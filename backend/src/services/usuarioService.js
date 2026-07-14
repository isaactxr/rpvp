'use strict';

/**
 * Serviço de usuários.
 *
 * Centraliza validações de cadastro, normalização de CPF/usuario/perfil, vínculo com gestor
 * e setor, além das operações de CRUD administrativas.
 */
const db = require('../config/database');
const { hashSenha } = require('./cryptoService');

const PERFIS_ACESSO = Object.freeze(['admin', 'instrutor', 'gestor', 'colaborador']);

function criarErroValidacao(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizarPerfil(perfil) {
  const valor = String(perfil || '').trim().toLowerCase();
  if (!PERFIS_ACESSO.includes(valor)) {
    throw criarErroValidacao(`Perfil inválido. Use: ${PERFIS_ACESSO.join(', ')}.`);
  }
  return valor;
}

function normalizarUsuario(usuario) {
  const valor = String(usuario || '').trim().toLowerCase();
  if (!valor) {
    throw criarErroValidacao('Informe o usuário/login do usuário.');
  }

  const usuarioPadraoValido = /^[a-z0-9._-]{3,60}$/i.test(valor);
  const usuarioEmailLegadoValido = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(valor);
  if (!usuarioPadraoValido && !usuarioEmailLegadoValido) {
    throw criarErroValidacao('Informe um usuário válido (login simples ou formato legado com @).');
  }

  return valor;
}

function normalizarTexto(valor, campo) {
  const texto = String(valor || '').trim();
  if (!texto) {
    throw criarErroValidacao(`Informe ${campo}.`);
  }
  return texto;
}

function normalizarSenha(senha) {
  const valor = String(senha || '');
  if (!valor.trim()) {
    throw criarErroValidacao('Informe a senha do usuário.');
  }
  if (valor.length < 6) {
    throw criarErroValidacao('A senha deve ter no mínimo 6 caracteres.');
  }
  return valor;
}

function normalizarCpf(cpf, { obrigatorio = false } = {}) {
  if (cpf === undefined || cpf === null || cpf === '') {
    if (obrigatorio) {
      throw criarErroValidacao('Informe o CPF do usuário.');
    }
    return null;
  }

  const digitos = String(cpf).replace(/\D/g, '');
  if (digitos.length !== 11) {
    throw criarErroValidacao('CPF inválido. Informe 11 dígitos.');
  }

  return digitos;
}

function normalizarFlagResetPrimeiroAcesso(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') {
    return Boolean(padrao);
  }

  if (typeof valor === 'boolean') {
    return valor;
  }

  const texto = String(valor).trim().toLowerCase();
  return ['1', 'true', 'sim', 'on'].includes(texto);
}

function normalizarGestorId(gestorId) {
  if (gestorId === null || gestorId === undefined || gestorId === '') {
    return null;
  }

  const numero = Number(gestorId);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw criarErroValidacao('Gestor inválido.');
  }

  return numero;
}

async function validarGestor(gestorId) {
  if (!gestorId) return;

  const result = await db.query(
    `SELECT id, perfil_acesso
     FROM usuarios
     WHERE id = $1`,
    [gestorId]
  );

  if (result.rows.length === 0) {
    throw criarErroValidacao('Gestor não encontrado.');
  }

  if (result.rows[0].perfil_acesso !== 'gestor') {
    throw criarErroValidacao('O gestor associado deve ter perfil gestor.');
  }
}

async function validarCpfUnico(cpf, usuarioIdIgnorar = null) {
  if (!cpf) return;

  const valores = [cpf];
  let whereExtra = '';
  if (usuarioIdIgnorar) {
    valores.push(usuarioIdIgnorar);
    whereExtra = ` AND id <> $${valores.length}`;
  }

  const result = await db.query(
    `SELECT id
     FROM usuarios
     WHERE cpf = $1${whereExtra}
     LIMIT 1`,
    valores
  );

  if (result.rows.length > 0) {
    throw criarErroValidacao('CPF já cadastrado para outro usuário.');
  }
}

async function obterOuCriarSetor(setorNome) {
  const nome = String(setorNome || '').trim();
  if (!nome) {
    return { id: null, nome: null };
  }

  const insert = await db.query(
    `INSERT INTO setores (nome)
     VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id, nome`,
    [nome]
  );

  return insert.rows[0] || { id: null, nome };
}

async function listarSetores() {
  const result = await db.query(
    `SELECT s.id, s.nome, s.criado_em, s.atualizado_em
     FROM setores s
     ORDER BY s.nome ASC`
  );

  return result.rows;
}

async function listarUsuarios({ perfil, ativo, busca, gestorId } = {}) {
  const valores = [];
  const where = [];

  if (perfil) {
    valores.push(normalizarPerfil(perfil));
    where.push(`u.perfil_acesso = $${valores.length}`);
  }

  if (ativo !== undefined && ativo !== null && ativo !== '') {
    const ativoBool = String(ativo).toLowerCase() === 'true';
    valores.push(ativoBool);
    where.push(`u.ativo = $${valores.length}`);
  }

  if (busca) {
    valores.push(`%${String(busca).trim()}%`);
    where.push(`u.nome_completo ILIKE $${valores.length}`);
  }

  if (gestorId !== undefined && gestorId !== null && gestorId !== '') {
    valores.push(normalizarGestorId(gestorId));
    where.push(`u.gestor_id = $${valores.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT u.id,
            u.nome_completo,
            u.subject,
          u.cpf,
            u.usuario,
            u.perfil_acesso,
            u.ativo,
          u.reset_senha_primeiro_acesso,
            u.gestor_id,
            u.setor_id,
            setor.nome AS setor,
            gestor.nome_completo AS gestor_nome,
            setor_gestor.nome AS gestor_setor,
            u.criado_em,
            u.atualizado_em,
            u.ultimo_login_em
     FROM usuarios u
     LEFT JOIN usuarios gestor ON u.gestor_id = gestor.id
     LEFT JOIN setores setor ON setor.id = u.setor_id
     LEFT JOIN setores setor_gestor ON setor_gestor.id = gestor.setor_id
     ${whereSql}
     ORDER BY u.nome_completo ASC`,
    valores
  );

  return result.rows;
}

/**
 * Cria um usuário administrativo ou operacional já com senha hash, perfil e vínculo opcional com gestor/setor.
 * @param {object} payload Corpo enviado pelo frontend de usuários.
 * @returns {Promise<object>} Registro persistido para uso imediato no restante do fluxo.
 */
async function criarUsuario(payload) {
  const nomeCompleto = normalizarTexto(payload.nomeCompleto, 'o nome completo');
  const cpf = normalizarCpf(payload.cpf);
  const usuario = normalizarUsuario(payload.usuario);
  const perfilAcesso = normalizarPerfil(payload.perfil || 'colaborador');
  const senhaHash = hashSenha(normalizarSenha(payload.senha));
  const resetSenhaPrimeiroAcesso = normalizarFlagResetPrimeiroAcesso(payload.resetSenhaPrimeiroAcesso, false);
  const gestorId = normalizarGestorId(payload.gestorId);
  const setorEntrada = payload.setor ? String(payload.setor).trim() || null : null;
  const setor = await obterOuCriarSetor(setorEntrada);
  const subject = nomeCompleto;

  await validarGestor(gestorId);
  await validarCpfUnico(cpf);

  const result = await db.query(
    `INSERT INTO usuarios (nome_completo, cpf, usuario, senha_hash, perfil_acesso, ativo, reset_senha_primeiro_acesso, gestor_id, setor_id, subject)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, COALESCE($9, CONCAT('user-', EXTRACT(EPOCH FROM NOW())::bigint, '-', floor(random()*99999)::int)))
     RETURNING id, nome_completo, cpf, usuario, perfil_acesso, ativo, reset_senha_primeiro_acesso, gestor_id, setor_id, subject, criado_em`,
    [nomeCompleto, cpf, usuario, senhaHash, perfilAcesso, resetSenhaPrimeiroAcesso, gestorId, setor.id, subject]
  );

  return result.rows[0];
}

/**
 * Atualiza apenas os campos informados de um usuário existente, reaplicando todas as validações necessárias.
 * @param {number} usuarioId Identificador do usuário no banco.
 * @param {object} payload Conjunto parcial de alterações permitidas pela administração.
 * @returns {Promise<object>} Usuário já atualizado.
 */
async function atualizarUsuario(usuarioId, payload) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw criarErroValidacao('Usuário inválido.');
  }

  const set = [];
  const valores = [];

  let novoNomeCompleto = null;

  if (payload.nomeCompleto !== undefined) {
    novoNomeCompleto = normalizarTexto(payload.nomeCompleto, 'o nome completo');
    valores.push(novoNomeCompleto);
    set.push(`nome_completo = $${valores.length}`);
    if (payload.subject === undefined) {
      valores.push(novoNomeCompleto);
      set.push(`subject = $${valores.length}`);
    }
  }

  if (payload.usuario !== undefined) {
    valores.push(normalizarUsuario(payload.usuario));
    set.push(`usuario = $${valores.length}`);
  }

  if (payload.cpf !== undefined) {
    const cpf = normalizarCpf(payload.cpf);
    await validarCpfUnico(cpf, usuarioId);
    valores.push(cpf);
    set.push(`cpf = $${valores.length}`);
  }

  if (payload.perfil !== undefined) {
    valores.push(normalizarPerfil(payload.perfil));
    set.push(`perfil_acesso = $${valores.length}`);
  }

  if (payload.ativo !== undefined) {
    valores.push(Boolean(payload.ativo));
    set.push(`ativo = $${valores.length}`);
  }

  if (payload.resetSenhaPrimeiroAcesso !== undefined) {
    valores.push(normalizarFlagResetPrimeiroAcesso(payload.resetSenhaPrimeiroAcesso));
    set.push(`reset_senha_primeiro_acesso = $${valores.length}`);
  }

  if (payload.gestorId !== undefined) {
    const gestorId = normalizarGestorId(payload.gestorId);
    await validarGestor(gestorId);
    valores.push(gestorId);
    set.push(`gestor_id = $${valores.length}`);
  }

  if (payload.setor !== undefined) {
    const setor = await obterOuCriarSetor(payload.setor ? String(payload.setor).trim() || null : null);
    valores.push(setor.id);
    set.push(`setor_id = $${valores.length}`);
  }

  if (payload.subject !== undefined) {
    const subject = String(payload.subject || '').trim();
    if (!subject) {
      throw criarErroValidacao('subject não pode ficar vazio.');
    }
    valores.push(subject);
    set.push(`subject = $${valores.length}`);
  }

  if (payload.senha !== undefined && String(payload.senha).trim()) {
    valores.push(hashSenha(normalizarSenha(payload.senha)));
    set.push(`senha_hash = $${valores.length}`);
  }

  if (set.length === 0) {
    throw criarErroValidacao('Nenhum campo informado para atualização.');
  }

  valores.push(usuarioId);
  const result = await db.query(
    `UPDATE usuarios
     SET ${set.join(', ')}, atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $${valores.length}
    RETURNING id, nome_completo, cpf, usuario, perfil_acesso, ativo, reset_senha_primeiro_acesso, gestor_id, setor_id, subject, atualizado_em`,
    valores
  );

  if (result.rows.length === 0) {
    const err = new Error('Usuário não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

async function atualizarPerfil(usuarioId, perfil) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw criarErroValidacao('Usuário inválido.');
  }

  const perfilNormalizado = normalizarPerfil(perfil);
  const result = await db.query(
    `UPDATE usuarios
     SET perfil_acesso = $1,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, nome_completo, subject, perfil_acesso, atualizado_em`,
    [perfilNormalizado, usuarioId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Usuário não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

async function desativarUsuario(usuarioId) {
  return atualizarUsuario(usuarioId, { ativo: false });
}

async function obterUsuarioPorId(usuarioId) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw criarErroValidacao('Usuário inválido.');
  }

  const result = await db.query(
    `SELECT u.id,
            u.nome_completo,
            u.subject,
          u.cpf,
            u.usuario,
            u.perfil_acesso,
            u.ativo,
          u.reset_senha_primeiro_acesso,
            u.gestor_id,
            u.setor_id,
            s.nome AS setor,
            u.criado_em,
            u.atualizado_em,
            u.ultimo_login_em
     FROM usuarios u
     LEFT JOIN setores s ON s.id = u.setor_id
     WHERE u.id = $1
     LIMIT 1`,
    [usuarioId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Usuário não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

async function excluirUsuario(usuarioId) {
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw criarErroValidacao('Usuário inválido.');
  }

  const result = await db.query(
    `DELETE FROM usuarios
     WHERE id = $1
     RETURNING id, nome_completo, usuario, perfil_acesso, subject`,
    [usuarioId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Usuário não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
}

module.exports = {
  PERFIS_ACESSO,
  listarSetores,
  listarUsuarios,
  obterUsuarioPorId,
  criarUsuario,
  atualizarUsuario,
  desativarUsuario,
  excluirUsuario,
  atualizarPerfil,
  normalizarPerfil,
};
