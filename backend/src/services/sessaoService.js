'use strict';

/**
 * Serviço de sessões.
 *
 * Valida entradas de criação, gera o nome automático da sessão, controla a execução
 * efetiva (início/fim) e expõe consultas para acompanhamento operacional.
 */
const db = require('../config/database');

function criarErroValidacao(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizarTexto(valor, campo) {
  const texto = String(valor || '').trim();
  if (!texto) {
    throw criarErroValidacao(`Informe ${campo}.`);
  }
  return texto;
}

function normalizarTextoOpcional(valor, limite = 255) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  return texto.slice(0, limite);
}

function normalizarData(data) {
  const valor = String(data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw criarErroValidacao('Informe uma data válida no formato YYYY-MM-DD.');
  }
  return valor;
}

const TIMEZONE_PADRAO = 'America/Sao_Paulo';

function obterPartesDataHora(dataHora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_PADRAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dataHora).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

function obterDataHojeLocal() {
  const partes = obterPartesDataHora();
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function gerarNomeSessaoAutomatico(dataHora = new Date()) {
  const partes = obterPartesDataHora(dataHora);
  return `${partes.day}${partes.month}${partes.year}${partes.hour}${partes.minute}`;
}

function normalizarInstrutorId(instrutorId) {
  if (instrutorId === null || instrutorId === undefined || instrutorId === '') {
    return null;
  }

  const numero = Number(instrutorId);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw criarErroValidacao('Instrutor inválido.');
  }

  return numero;
}

async function validarInstrutor(instrutorId) {
  if (!instrutorId) {
    return null;
  }

  const result = await db.query(
    `SELECT id, nome_completo, perfil_acesso
     FROM usuarios
     WHERE id = $1`,
    [instrutorId]
  );

  if (result.rows.length === 0) {
    throw criarErroValidacao('Responsável da sessão não encontrado.');
  }

  return result.rows[0];
}

async function validarTipoSessaoAtivo(tipoSessao) {
  const tipoNormalizado = normalizarTexto(tipoSessao, 'o tipo de sessao');
  const result = await db.query(
    `SELECT nome
     FROM tipos_sessao
     WHERE LOWER(nome) = LOWER($1)
       AND ativo = true
     LIMIT 1`,
    [tipoNormalizado]
  );

  if (result.rows.length === 0) {
    throw criarErroValidacao('Selecione um tipo de sessao ativo cadastrado em Configuracoes.');
  }

  return result.rows[0].nome;
}

function normalizarUsuarioIdOpcional(usuarioId, campo) {
  if (usuarioId === undefined || usuarioId === null || usuarioId === '') {
    return null;
  }

  const numero = Number(usuarioId);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw criarErroValidacao(`${campo} inválido.`);
  }

  return numero;
}

/**
 * Cria uma nova sessão para a data atual e gera automaticamente o nome no formato `DDMMAAAAHHMM`.
 * @param {object} payload Dados enviados pelo frontend de gestão de sessões.
 * @returns {Promise<object>} Sessão recém-criada conforme retornada pelo PostgreSQL.
 */
async function criarSessao(payload) {
  const nome = gerarNomeSessaoAutomatico();
  const tipoSessao = await validarTipoSessaoAtivo(payload.tipoSessao);
  const descricao = normalizarTextoOpcional(payload.descricao, 500);
  const local = normalizarTextoOpcional(payload.local, 180);
  const data = obterDataHojeLocal();
  const instrutorId = normalizarInstrutorId(payload.instrutorId);
  const checkoutHabilitado = Boolean(payload.checkoutHabilitado);

  await validarInstrutor(instrutorId);

  const result = await db.query(
    `INSERT INTO sessoes (nome, tipo_sessao, descricao, local, data, instrutor_id, checkout_habilitado)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, nome, tipo_sessao, descricao, local, data, inicio_efetivo_em, fim_efetivo_em, checkout_habilitado, instrutor_id, criado_em`,
    [nome, tipoSessao, descricao, local, data, instrutorId, checkoutHabilitado]
  );

  return result.rows[0];
}

async function obterSessaoPorId(sessaoId) {
  const sessaoNumero = Number(sessaoId);
  if (!Number.isInteger(sessaoNumero) || sessaoNumero <= 0) {
    throw criarErroValidacao('Sessão inválida.');
  }

  const result = await db.query(
    `SELECT s.id,
            s.nome,
            s.tipo_sessao,
            s.local,
            s.data,
            s.inicio_efetivo_em,
            s.fim_efetivo_em,
            s.checkout_habilitado,
            s.instrutor_id,
            u.nome_completo AS instrutor_nome
     FROM sessoes s
     LEFT JOIN usuarios u ON u.id = s.instrutor_id
     WHERE s.id = $1`,
    [sessaoNumero]
  );

  if (result.rows.length === 0) {
    const err = new Error('Sessão não encontrada.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

/**
 * Lista a trilha de presença da sessão, calculando o status a partir dos horários de check-in/check-out.
 * @param {number|string} sessaoId Identificador da sessão monitorada.
 * @param {number|string|null} [gestorId=null] Restrição opcional para limitar os colaboradores ao gestor autenticado.
 * @returns {Promise<object[]>} Linhas usadas pela tela de acompanhamento em tempo real.
 */
async function listarAcompanhamento(sessaoId, { gestorId = null, colaboradorId = null } = {}) {
  const sessaoNumero = Number(sessaoId);
  if (!Number.isInteger(sessaoNumero) || sessaoNumero <= 0) {
    throw criarErroValidacao('Sessão inválida.');
  }

  const gestorNumero = normalizarUsuarioIdOpcional(gestorId, 'Gestor');
  const colaboradorNumero = normalizarUsuarioIdOpcional(colaboradorId, 'Colaborador');

  const params = [sessaoNumero];
  let whereRestricao = '';
  if (gestorNumero) {
    params.push(gestorNumero);
    whereRestricao += ` AND u.gestor_id = $${params.length}`;
  }

  if (colaboradorNumero) {
    params.push(colaboradorNumero);
    whereRestricao += ` AND p.usuario_id = $${params.length}`;
  }

  // Lista todos os colaboradores que têm presença nesta sessão.
  // Não depende mais de convocações.
  const result = await db.query(
    `SELECT p.id AS presenca_id,
            p.sessao_id,
            p.usuario_id AS colaborador_id,
            u.nome_completo,
            p.check_in_em,
            p.check_out_em,
            (pic.presenca_id IS NOT NULL) AS tem_foto_checkin,
            (poc.presenca_id IS NOT NULL) AS tem_foto_checkout,
            CASE
              WHEN p.check_in_em IS NOT NULL AND s.checkout_habilitado = false THEN 'concluido'
              WHEN p.check_out_em IS NOT NULL THEN 'concluido'
              WHEN p.check_in_em IS NOT NULL THEN 'em_andamento'
              ELSE 'nao_iniciado'
            END AS status
     FROM presencas p
     JOIN sessoes s ON s.id = p.sessao_id
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN presencas_imagens pic ON pic.presenca_id = p.id AND pic.tipo_registro = 'checkin'
     LEFT JOIN presencas_imagens poc ON poc.presenca_id = p.id AND poc.tipo_registro = 'checkout'
     WHERE p.sessao_id = $1
       AND p.data = s.data
       ${whereRestricao}
     ORDER BY u.nome_completo ASC`,
    params
  );

  return result.rows;
}

async function iniciarSessao(sessaoId, user) {
  const sessao = await obterSessaoPorId(sessaoId);

  if (!user || !['admin', 'instrutor'].includes(user.perfil_acesso)) {
    const err = new Error('Sem permissão para iniciar sessão.');
    err.statusCode = 403;
    throw err;
  }

  if (user.perfil_acesso === 'instrutor' && Number(sessao.instrutor_id) !== Number(user.id)) {
    const err = new Error('Instrutor pode iniciar apenas as próprias sessões.');
    err.statusCode = 403;
    throw err;
  }

  if (sessao.fim_efetivo_em) {
    throw criarErroValidacao('A sessão já foi encerrada e não pode ser iniciada novamente.');
  }

  if (sessao.inicio_efetivo_em) {
    return sessao;
  }

  const result = await db.query(
    `UPDATE sessoes
     SET inicio_efetivo_em = CURRENT_TIMESTAMP,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, nome, data, inicio_efetivo_em, fim_efetivo_em, instrutor_id`,
    [Number(sessaoId)]
  );

  return result.rows[0];
}

async function encerrarSessao(sessaoId, user) {
  const sessao = await obterSessaoPorId(sessaoId);

  if (!user || !['admin', 'instrutor'].includes(user.perfil_acesso)) {
    const err = new Error('Sem permissão para encerrar sessão.');
    err.statusCode = 403;
    throw err;
  }

  if (user.perfil_acesso === 'instrutor' && Number(sessao.instrutor_id) !== Number(user.id)) {
    const err = new Error('Instrutor pode encerrar apenas as próprias sessões.');
    err.statusCode = 403;
    throw err;
  }

  if (sessao.fim_efetivo_em) {
    return sessao;
  }

  if (!sessao.inicio_efetivo_em) {
    throw criarErroValidacao('A sessão precisa ser iniciada antes de ser encerrada.');
  }

  const result = await db.query(
    `UPDATE sessoes
     SET fim_efetivo_em = CURRENT_TIMESTAMP,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, nome, data, inicio_efetivo_em, fim_efetivo_em, instrutor_id`,
    [Number(sessaoId)]
  );

  return result.rows[0];
}

async function atualizarCheckoutSessao({ sessaoId, checkoutHabilitado, user }) {
  const sessao = await obterSessaoPorId(sessaoId);

  if (!user || !['admin', 'instrutor'].includes(user.perfil_acesso)) {
    const err = new Error('Sem permissão para alterar checkout da sessão.');
    err.statusCode = 403;
    throw err;
  }

  if (user.perfil_acesso === 'instrutor' && Number(sessao.instrutor_id) !== Number(user.id)) {
    const err = new Error('Instrutor pode alterar apenas as próprias sessões.');
    err.statusCode = 403;
    throw err;
  }

  const result = await db.query(
    `UPDATE sessoes
     SET checkout_habilitado = $2,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, nome, tipo_sessao, data, inicio_efetivo_em, fim_efetivo_em, checkout_habilitado, instrutor_id`,
    [Number(sessaoId), Boolean(checkoutHabilitado)]
  );

  return result.rows[0];
}

async function listarSessoes({ data, instrutorId, tipoSessao, ativo } = {}) {
  const valores = [];
  const where = [];

  if (data) {
    valores.push(normalizarData(data));
    where.push(`s.data = $${valores.length}`);
  }

  if (instrutorId !== undefined && instrutorId !== null && instrutorId !== '') {
    valores.push(normalizarInstrutorId(instrutorId));
    where.push(`s.instrutor_id = $${valores.length}`);
  }

  if (tipoSessao !== undefined && tipoSessao !== null && tipoSessao !== '') {
    valores.push(normalizarTexto(tipoSessao, 'o tipo de sessão'));
    where.push(`s.tipo_sessao = $${valores.length}`);
  }

  if (ativo === true) {
    where.push('s.fim_efetivo_em IS NULL');
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT s.id,
            s.nome,
          s.tipo_sessao,
            s.descricao,
            s.local,
            s.data,
            s.inicio_efetivo_em,
            s.fim_efetivo_em,
            s.checkout_habilitado,
            s.instrutor_id,
            instrutor.nome_completo AS instrutor_nome,
            s.criado_em
     FROM sessoes s
     LEFT JOIN usuarios instrutor ON s.instrutor_id = instrutor.id
     ${whereSql}
     ORDER BY s.data DESC, s.nome ASC`,
    valores
  );

  return result.rows;
}

module.exports = {
  criarSessao,
  obterSessaoPorId,
  iniciarSessao,
  encerrarSessao,
  atualizarCheckoutSessao,
  listarSessoes,
  listarAcompanhamento,
};
