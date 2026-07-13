'use strict';

/**
 * src/services/presencaService.js — Controle de presença em PostgreSQL
 *
 * Responsabilidades:
 *   - Consultar/gravar presenças no banco de dados
 *   - Validar duplicidade por dia e sessão
 *   - Gerenciar cooldown entre tentativas
 *   - Criar usuários automaticamente conforme necessário
 */

const db = require('../config/database');
const config = require('../config/env');
const configService = require('./configService');

const TIMEZONE_PADRAO = 'America/Sao_Paulo';

function _hojeLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_PADRAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${partes.year}-${partes.month}-${partes.day}`;
}

function normalizarSessaoId(sessaoId) {
  if (sessaoId === null || sessaoId === undefined || sessaoId === '') {
    return null;
  }

  const numero = Number(sessaoId);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function normalizarImagemAuditoria(imagemAuditada) {
  if (!imagemAuditada || typeof imagemAuditada !== 'object') {
    return null;
  }

  const buffer = Buffer.isBuffer(imagemAuditada.buffer) ? imagemAuditada.buffer : null;
  if (!buffer || buffer.length === 0) {
    return null;
  }

  return {
    buffer,
    contentType: String(imagemAuditada.contentType || 'image/jpeg').trim() || 'image/jpeg',
  };
}

async function salvarImagemAuditoria(presencaId, imagemAuditada, tipoRegistro = 'checkin') {
  const imagem = normalizarImagemAuditoria(imagemAuditada);
  if (!imagem) return;

  const tipo = ['checkin', 'checkout'].includes(String(tipoRegistro || '').toLowerCase())
    ? String(tipoRegistro).toLowerCase()
    : 'checkin';

  await db.query(
    `INSERT INTO presencas_imagens (presenca_id, foto, content_type, tipo_registro)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (presenca_id, tipo_registro)
     DO UPDATE SET foto = EXCLUDED.foto,
                   content_type = EXCLUDED.content_type,
                   atualizado_em = CURRENT_TIMESTAMP`,
    [Number(presencaId), imagem.buffer, imagem.contentType, tipo]
  );
}

async function obterOuCriarUsuario(subject, nomeCompleto = subject) {
  try {
    let result = await db.query(
      'SELECT id, nome_completo, subject_compreface, perfil_acesso FROM usuarios WHERE subject_compreface = $1',
      [subject]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    result = await db.query(
      `INSERT INTO usuarios (nome_completo, subject_compreface)
       VALUES ($1, $2)
       RETURNING id, nome_completo, subject_compreface, perfil_acesso`,
      [nomeCompleto, subject]
    );

    console.log(`[presença] Usuário criado: ${subject} (${nomeCompleto})`);
    return result.rows[0];
  } catch (err) {
    console.error(`[presença] Erro ao criar/obter usuário: ${err.message}`);
    throw err;
  }
}

async function jaRegistradoHoje(subject, sessaoId = null) {
  try {
    const usuario = await obterOuCriarUsuario(subject);
    const hoje = _hojeLocal();
    const sessaoNormalizada = normalizarSessaoId(sessaoId);

    const result = await db.query(
      `SELECT id
       FROM presencas
       WHERE usuario_id = $1
         AND data = $2
         AND COALESCE(sessao_id, 0) = COALESCE($3::integer, 0)
       LIMIT 1`,
      [usuario.id, hoje, sessaoNormalizada]
    );

    return result.rows.length > 0;
  } catch (err) {
    console.error(`[presença] Erro ao verificar se já registrado: ${err.message}`);
    return false;
  }
}

async function estaNoCooldown(subject) {
  try {
    const usuario = await obterOuCriarUsuario(subject);

    const result = await db.query(
      'SELECT criado_em FROM presencas WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 1',
      [usuario.id]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const ultimaTentativa = new Date(result.rows[0].criado_em).getTime();
    const agora = Date.now();
    return agora - ultimaTentativa < config.PRESENCE_COOLDOWN_MS;
  } catch (err) {
    console.error(`[presença] Erro ao verificar cooldown: ${err.message}`);
    return false;
  }
}

async function registrarPresenca(subject, similarity, imagemAuditada = null, sessaoId = null) {
  try {
    const usuario = await obterOuCriarUsuario(subject);
    const sessaoNormalizada = normalizarSessaoId(sessaoId);

    const result = await db.query(
      `INSERT INTO presencas (usuario_id, sessao_id, data, hora, similaridade)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
       RETURNING id, data, hora`,
      [usuario.id, sessaoNormalizada, data, similarity]
    );

    await salvarImagemAuditoria(result.rows[0].id, imagemAuditada, 'checkin');

    const data = result.rows[0].data;
    const hora = result.rows[0].hora;

    console.log(
      `[presença] Registrada :: userId=${usuario.id} | sessaoId=${sessaoNormalizada ?? 'sem-sessao'} | similarity=${similarity.toFixed(4)} | horario=${hora}`
    );

    return {
      userId: usuario.id,
      presencaId: result.rows[0].id,
      sessaoId: sessaoNormalizada,
      dataRegistro: data,
      horario: hora,
      similarity,
      nomeCompleto: usuario.nome_completo,
    };
  } catch (err) {
    console.error(`[presença] Erro ao registrar presença: ${err.message}`);
    throw err;
  }
}

/**
 * Aplica as regras de negócio do reconhecimento facial para decidir entre check-in e check-out.
 *
 * Regras principais observadas no código:
 * - exige sessão selecionada;
 * - pode alternar automaticamente entre `checkin` e `checkout` quando o tipo é `auto`;
 * - respeita o tempo mínimo configurado para checkout;
 * - bloqueia duplicidade por sessão e, em alguns cenários, por tipo de sessão no mesmo dia.
 *
 * @param {{subject:string, similarity:number, imagemAuditada?:{buffer:Buffer, contentType:string}|null, sessaoId?:number|string|null, tipoRegistro?:'auto'|'checkin'|'checkout'}} params
 * @returns {Promise<object>} Resultado consolidado para a resposta HTTP do reconhecimento.
 */
async function registrarBatidaFacial({
  subject,
  similarity,
  imagemAuditada = null,
  sessaoId = null,
  tipoRegistro = 'auto',
}) {
  const tipo = String(tipoRegistro || 'auto').toLowerCase();
  if (!['checkin', 'checkout', 'auto'].includes(tipo)) {
    const err = new Error('Tipo de registro inválido. Use auto, checkin ou checkout.');
    err.statusCode = 400;
    throw err;
  }

  const usuario = await obterOuCriarUsuario(subject);
  const data = _hojeLocal();
  const sessaoNormalizada = normalizarSessaoId(sessaoId);

  if (!sessaoNormalizada) {
    const err = new Error('Selecione uma sessão para realizar a verificação de presença');
    err.statusCode = 400;
    throw err;
  }

  const sessaoResult = await db.query(
    `SELECT id, tipo_sessao, checkout_habilitado, inicio_efetivo_em, fim_efetivo_em
     FROM sessoes
     WHERE id = $1`,
    [sessaoNormalizada]
  );

  if (sessaoResult.rows.length === 0) {
    const err = new Error('Sessão não encontrada para registro de presença.');
    err.statusCode = 404;
    throw err;
  }

  const sessao = sessaoResult.rows[0];
  if (sessao.fim_efetivo_em) {
    const err = new Error('Sessão encerrada. Não é possível registrar novas presenças.');
    err.statusCode = 400;
    throw err;
  }

  if (!sessao.inicio_efetivo_em) {
    await db.query(
      `UPDATE sessoes
       SET inicio_efetivo_em = CURRENT_TIMESTAMP,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $1
         AND inicio_efetivo_em IS NULL`,
      [sessaoNormalizada]
    );
  }

  const checkoutHabilitadoSessao = Boolean(sessao.checkout_habilitado);

  const existente = await db.query(
    `SELECT id, check_in_em, check_out_em
     FROM presencas
     WHERE usuario_id = $1
       AND data = $2
       AND COALESCE(sessao_id, 0) = COALESCE($3::integer, 0)
     ORDER BY id DESC
     LIMIT 1`,
    [usuario.id, data, sessaoNormalizada]
  );

  const presencaAtual = existente.rows[0] || null;

  const tipoEfetivo = tipo === 'auto'
    ? (checkoutHabilitadoSessao && presencaAtual && presencaAtual.check_in_em && !presencaAtual.check_out_em ? 'checkout' : 'checkin')
    : tipo;

  if (tipoEfetivo === 'checkout') {
    if (!checkoutHabilitadoSessao) {
      return {
        tipo: 'checkout',
        status: 'concluido',
        message: `Presença já registrada em sessão de ${sessao.tipo_sessao || 'tipo não informado'} hoje`,
        userId: usuario.id,
        horario: presencaAtual?.check_in_em || null,
        sessaoId: sessaoNormalizada,
        nomeCompleto: usuario.nome_completo,
      };
    }

    if (!presencaAtual || !presencaAtual.check_in_em) {
      return {
        tipo: 'checkout',
        status: 'nao_iniciado',
        message: 'Check-out não permitido sem check-in prévio.',
        userId: usuario.id,
        horario: null,
        sessaoId: sessaoNormalizada,
      };
    }

    if (presencaAtual.check_out_em) {
      return {
        tipo: 'checkout',
        status: 'concluido',
        message: 'Check-out já registrado para esta sessão.',
        userId: usuario.id,
        horario: presencaAtual.check_out_em,
        sessaoId: sessaoNormalizada,
      };
    }

    const intervaloSeg = await configService.obter('min_checkout_intervalo_seg');
    const intervaloMinLegado = intervaloSeg === null
      ? await configService.obter('min_checkout_intervalo_min')
      : null;
    const minCheckoutSeg = Math.max(
      1,
      Number(intervaloSeg ?? ((intervaloMinLegado ?? 3) * 60)) || 180,
    );
    const minCheckoutMs = minCheckoutSeg * 1000;
    const checkInEpoch = new Date(presencaAtual.check_in_em).getTime();
    const agoraEpoch = Date.now();
    if (!Number.isNaN(checkInEpoch) && agoraEpoch - checkInEpoch < minCheckoutMs) {
      const restanteMs = minCheckoutMs - (agoraEpoch - checkInEpoch);
      const restanteSegundos = Math.max(Math.ceil(restanteMs / 1000), 1);
      return {
        tipo: 'checkout',
        status: 'em_andamento',
        message: 'Aguarde o tempo mínimo para realizar o check-out.',
        userId: usuario.id,
        horario: presencaAtual.check_in_em,
        sessaoId: sessaoNormalizada,
        tempoRestanteSegundos: restanteSegundos,
      };
    }

    const checkoutUpdate = await db.query(
      `UPDATE presencas
       SET check_out_em = CURRENT_TIMESTAMP,
           similaridade = COALESCE($1, similaridade)
       WHERE id = $2
       RETURNING check_out_em`,
      [similarity, presencaAtual.id]
    );

    await salvarImagemAuditoria(presencaAtual.id, imagemAuditada, 'checkout');
    const horarioCheckout = checkoutUpdate.rows[0]?.check_out_em || null;

    return {
      tipo: 'checkout',
      status: 'concluido',
      message: 'Check-out confirmado.',
      userId: usuario.id,
      horario: horarioCheckout,
      sessaoId: sessaoNormalizada,
      similarity,
      nomeCompleto: usuario.nome_completo,
    };
  }

  if (!checkoutHabilitadoSessao) {
    if (presencaAtual && presencaAtual.check_in_em) {
      return {
        tipo: 'checkin',
        status: 'concluido',
        message: `Presença já registrada em sessão de ${sessao.tipo_sessao || 'tipo não informado'} hoje`,
        userId: usuario.id,
        horario: presencaAtual.check_in_em,
        sessaoId: sessaoNormalizada,
        similarity,
        nomeCompleto: usuario.nome_completo,
      };
    }

    const duplicidadeTipo = await db.query(
      `SELECT p.id
       FROM presencas p
       JOIN sessoes s ON s.id = p.sessao_id
       WHERE p.usuario_id = $1
         AND p.data = $2
         AND p.check_in_em IS NOT NULL
         AND s.tipo_sessao = $3
         AND p.sessao_id <> $4
       LIMIT 1`,
      [usuario.id, data, String(sessao.tipo_sessao || ''), sessaoNormalizada]
    );

    if (duplicidadeTipo.rows.length > 0) {
      return {
        tipo: 'checkin',
        status: 'concluido',
        message: `Presença já registrada em sessão de ${sessao.tipo_sessao || 'tipo não informado'} hoje`,
        alerta: 'outra_sessao_mesmo_dia',
        userId: usuario.id,
        horario: null,
        sessaoId: sessaoNormalizada,
        similarity,
        nomeCompleto: usuario.nome_completo,
      };
    }
  }

  if (presencaAtual && presencaAtual.check_in_em) {
    return {
      tipo: 'checkin',
      status: presencaAtual.check_out_em ? 'concluido' : 'em_andamento',
      message: 'Check-in já registrado para esta sessão.',
      userId: usuario.id,
      horario: presencaAtual.check_in_em,
      sessaoId: sessaoNormalizada,
      similarity,
      nomeCompleto: usuario.nome_completo,
    };
  }

  const insert = await db.query(
    `INSERT INTO presencas (usuario_id, sessao_id, data, hora, check_in_em, similaridade)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)
     RETURNING id, check_in_em`,
    [usuario.id, sessaoNormalizada, data, similarity]
  );

  await salvarImagemAuditoria(insert.rows[0].id, imagemAuditada, 'checkin');

  return {
    tipo: 'checkin',
    status: checkoutHabilitadoSessao ? 'em_andamento' : 'concluido',
    message: 'Check-in confirmado.',
    userId: usuario.id,
    presencaId: insert.rows[0].id,
    horario: insert.rows[0].check_in_em,
    sessaoId: sessaoNormalizada,
    similarity,
    nomeCompleto: usuario.nome_completo,
  };
}

async function listarPresencas(filtros = {}) {
  try {
    const listarTudo = filtros.all === true;
    const data = filtros.data || (listarTudo ? null : _hojeLocal());
    const nome = String(filtros.nome || '').trim();
    const sessaoId = normalizarSessaoId(filtros.sessaoId);
    const valores = [];
    const where = [];

    if (data) {
      valores.push(data);
      where.push(`p.data = $${valores.length}`);
    }

    if (nome) {
      valores.push(`%${nome}%`);
      where.push(`u.nome_completo ILIKE $${valores.length}`);
    }

    if (sessaoId) {
      valores.push(sessaoId);
      where.push(`p.sessao_id = $${valores.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT p.id,
              u.id AS usuario_id,
              u.nome_completo,
              u.perfil_acesso,
              p.data,
              p.hora,
              p.check_in_em,
              p.check_out_em,
              p.similaridade,
              (pi.presenca_id IS NOT NULL) AS tem_imagem_auditoria,
              s.id AS sessao_id,
              s.nome AS sessao_nome,
              s.data AS sessao_data,
              instrutor.nome_completo AS instrutor_nome
       FROM presencas p
       JOIN usuarios u ON p.usuario_id = u.id
       LEFT JOIN sessoes s ON p.sessao_id = s.id
       LEFT JOIN usuarios instrutor ON s.instrutor_id = instrutor.id
       LEFT JOIN presencas_imagens pi ON pi.presenca_id = p.id
       ${whereSql}
       ORDER BY p.data DESC, p.hora DESC`,
      valores
    );

    return result.rows;
  } catch (err) {
    console.error(`[presença] Erro ao listar presenças: ${err.message}`);
    return [];
  }
}

async function listarTodasPresencas() {
  return listarPresencas({ all: true });
}

async function obterImagemAuditoria(presencaId, gestorId = null, tipoRegistro = null) {
  const presencaNumero = Number(presencaId);
  if (!Number.isInteger(presencaNumero) || presencaNumero <= 0) {
    const err = new Error('Presença inválida.');
    err.statusCode = 400;
    throw err;
  }

  const params = [presencaNumero];
  let whereGestor = '';

  if (gestorId) {
    params.push(Number(gestorId));
    whereGestor = ` AND u.gestor_id = $${params.length}`;
  }

  const tipo = tipoRegistro
    ? String(tipoRegistro).toLowerCase().trim()
    : null;

  if (tipo && !['checkin', 'checkout'].includes(tipo)) {
    const err = new Error('Tipo de imagem inválido. Use checkin ou checkout.');
    err.statusCode = 400;
    throw err;
  }

  if (tipo) {
    params.push(tipo);
  }

  const whereTipo = tipo ? ` AND pi.tipo_registro = $${params.length}` : '';

  const result = await db.query(
    `SELECT pi.foto, pi.content_type, pi.tipo_registro
     FROM presencas_imagens pi
     JOIN presencas p ON p.id = pi.presenca_id
     JOIN usuarios u ON u.id = p.usuario_id
     WHERE pi.presenca_id = $1
       ${whereTipo}
       ${whereGestor}
     ORDER BY CASE pi.tipo_registro WHEN 'checkout' THEN 2 ELSE 1 END
     LIMIT 1`,
    params
  );

  if (result.rows.length === 0) {
    const err = new Error('Imagem de auditoria não encontrada.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

module.exports = {
  obterOuCriarUsuario,
  normalizarSessaoId,
  jaRegistradoHoje,
  estaNoCooldown,
  registrarPresenca,
  registrarBatidaFacial,
  listarPresencas,
  listarTodasPresencas,
  obterImagemAuditoria,
};
