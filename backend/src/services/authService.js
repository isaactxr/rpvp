'use strict';

/**
 * Serviço de autenticação.
 *
 * Implementa login por usuario/senha, sessões persistidas em banco de dados
 * e o fluxo de troca obrigatória de senha no primeiro acesso.
 */
const crypto = require('crypto');
const db = require('../config/database');
const config = require('../config/env');
const { verificarSenha } = require('./cryptoService');
const { hashSenha } = require('./cryptoService');
// Hash legado usado para detectar instalações antigas e reconciliar o admin inicial.
const LEGACY_SEEDED_ADMIN_HASH = 'pbkdf2$120000$sha512$524f347e5367c94e3111fd0119dc3c254f4a141e0ff58b81f04c058f46901b80792fc0aed60b0d4613005bcf196a753cec7df7c0708cda29c2bc9bdb00f00649';

function criarErro(message, statusCode = 401) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

function gerarHashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function prazoExpiracao() {
  const ttlHoras = Number(config.AUTH_TOKEN_TTL_HOURS) || 12;
  return Date.now() + ttlHoras * 60 * 60 * 1000;
}

function normalizarUsuario(usuario) {
  return String(usuario || '').trim().toLowerCase();
}

function normalizarSenha(senha) {
  const valor = String(senha || '');
  if (!valor.trim()) {
    throw criarErro('Informe a nova senha.', 400);
  }
  if (valor.length < 6) {
    throw criarErro('A nova senha deve ter no mínimo 6 caracteres.', 400);
  }
  return valor;
}

/**
 * Autentica um usuário ativo a partir de usuario e senha, criando uma sessão persistida no banco.
 * @param {string} usuario Login informado na tela de autenticação.
 * @param {string} senha Senha em texto puro enviada pelo frontend.
 * @returns {Promise<{token:string, expiraEm:number, precisaAlterarSenha:boolean, usuario:object}>}
 */
async function login(usuarioLogin, senha) {
  const usuarioNormalizado = normalizarUsuario(usuarioLogin);
  if (!usuarioNormalizado || !senha) {
    throw criarErro('Informe usuario e senha.', 400);
  }

  const result = await db.query(
    `SELECT id, nome_completo, cpf, usuario, perfil_acesso, ativo, senha_hash, gestor_id, reset_senha_primeiro_acesso
     FROM usuarios
     WHERE LOWER(usuario) = $1
     LIMIT 1`,
    [usuarioNormalizado]
  );

  if (result.rows.length === 0) {
    throw criarErro('Credenciais inválidas.', 401);
  }

  const usuarioBanco = result.rows[0];
  if (!usuarioBanco.ativo) {
    throw criarErro('Usuário inativo.', 403);
  }

  if (!verificarSenha(senha, usuarioBanco.senha_hash)) {
    throw criarErro('Credenciais inválidas.', 401);
  }

  const token = gerarToken();
  const expiraEm = prazoExpiracao();
  const tokenHash = gerarHashToken(token);

  await db.query(
    `INSERT INTO sessoes_autenticacao (token_hash, usuario_id, expira_em)
     VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0))`,
    [tokenHash, usuarioBanco.id, expiraEm]
  );

  await db.query(
    `UPDATE usuarios
     SET ultimo_login_em = CURRENT_TIMESTAMP,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [usuarioBanco.id]
  );

  return {
    token,
    expiraEm,
    precisaAlterarSenha: Boolean(usuarioBanco.reset_senha_primeiro_acesso),
    usuario: {
      id: usuarioBanco.id,
      nome_completo: usuarioBanco.nome_completo,
      cpf: usuarioBanco.cpf,
      usuario: usuarioBanco.usuario,
      perfil_acesso: usuarioBanco.perfil_acesso,
      gestor_id: usuarioBanco.gestor_id,
      reset_senha_primeiro_acesso: Boolean(usuarioBanco.reset_senha_primeiro_acesso),
    },
  };
}

async function bootstrapAdmin({ nomeCompleto, usuario, senha }) {
  const existente = await db.query(
    `SELECT id
     FROM usuarios
     WHERE senha_hash IS NOT NULL
     LIMIT 1`
  );

  if (existente.rows.length > 0) {
    throw criarErro('Bootstrap já concluído. Use login normal.', 409);
  }

  const nome = String(nomeCompleto || '').trim();
  const usuarioNormalizado = normalizarUsuario(usuario);

  if (!nome || !usuarioNormalizado || !senha) {
    throw criarErro('Informe nome, usuario e senha para bootstrap.', 400);
  }

  const senhaHash = hashSenha(senha);

  const result = await db.query(
    `INSERT INTO usuarios (nome_completo, usuario, senha_hash, perfil_acesso, ativo, reset_senha_primeiro_acesso)
     VALUES ($1, $2, $3, 'admin', true, false)
     RETURNING id, nome_completo, usuario, perfil_acesso`,
    [nome, usuarioNormalizado, senhaHash]
  );

  return result.rows[0];
}

async function sincronizarAdminInicial() {
  const nome = String(config.INITIAL_ADMIN_NAME || '').trim();
  const usuarioNormalizado = normalizarUsuario(config.INITIAL_ADMIN_USER);
  const senha = String(config.INITIAL_ADMIN_PASSWORD || '');

  if (!nome || !usuarioNormalizado || !senha) {
    return { status: 'skipped', reason: 'Credenciais iniciais não configuradas.' };
  }

  const senhaHash = hashSenha(senha);
  const result = await db.query(
    `SELECT id, perfil_acesso, senha_hash
     FROM usuarios
     WHERE LOWER(usuario) = $1
     LIMIT 1`,
    [usuarioNormalizado]
  );

  if (result.rows.length === 0) {
    const criado = await db.query(
      `INSERT INTO usuarios (
         nome_completo,
         usuario,
         senha_hash,
         perfil_acesso,
         ativo,
         reset_senha_primeiro_acesso
       )
       VALUES ($1, $2, $3, 'admin', true, true)
       RETURNING id`,
      [nome, usuarioNormalizado, senhaHash]
    );

    return { status: 'created', userId: criado.rows[0].id, usuario: usuarioNormalizado };
  }

  const usuarioAtual = result.rows[0];
  if (usuarioAtual.perfil_acesso !== 'admin') {
    return {
      status: 'skipped',
      reason: `Usuário ${usuarioNormalizado} já existe com perfil ${usuarioAtual.perfil_acesso}.`,
    };
  }

  const hashArmazenado = String(usuarioAtual.senha_hash || '');
  const hashMalformado = hashArmazenado.split('$').length < 4;
  const precisaReconciliarHash = !hashArmazenado
    || hashMalformado
    || hashArmazenado === LEGACY_SEEDED_ADMIN_HASH;

  if (!precisaReconciliarHash) {
    return { status: 'unchanged', userId: usuarioAtual.id, usuario: usuarioNormalizado };
  }

  await db.query(
    `UPDATE usuarios
     SET nome_completo = $1,
         senha_hash = $2,
         ativo = true,
         reset_senha_primeiro_acesso = true,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [nome, senhaHash, usuarioAtual.id]
  );

  return { status: 'updated', userId: usuarioAtual.id, usuario: usuarioNormalizado };
}

async function logout(token) {
  if (!token) return;
  await db.query(
    `UPDATE sessoes_autenticacao
     SET revogado_em = NOW()
     WHERE token_hash = $1
       AND revogado_em IS NULL`,
    [gerarHashToken(token)]
  );
}

/**
 * Recupera a sessão correspondente ao token Bearer e revalida o usuário no banco antes de autorizar a requisição.
 * @param {string} token Token Bearer recebido na requisição.
 * @returns {Promise<{token:string, expiraEm:number, usuario:object}|null>}
 */
async function obterSessao(token) {
  if (!token) return null;

  const result = await db.query(
    `SELECT s.expira_em,
            u.id,
            u.nome_completo,
            u.cpf,
            u.usuario,
            u.perfil_acesso,
            u.ativo,
            u.gestor_id,
            u.reset_senha_primeiro_acesso
     FROM sessoes_autenticacao s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = $1
       AND s.revogado_em IS NULL
       AND s.expira_em > NOW()
     LIMIT 1`,
    [gerarHashToken(token)]
  );

  if (result.rows.length === 0 || !result.rows[0].ativo) {
    return null;
  }

  const sessaoBanco = result.rows[0];
  const expiraEm = new Date(sessaoBanco.expira_em).getTime();

  return {
    token,
    expiraEm,
    usuario: {
      id: sessaoBanco.id,
      nome_completo: sessaoBanco.nome_completo,
      cpf: sessaoBanco.cpf,
      usuario: sessaoBanco.usuario,
      perfil_acesso: sessaoBanco.perfil_acesso,
      ativo: sessaoBanco.ativo,
      gestor_id: sessaoBanco.gestor_id,
      reset_senha_primeiro_acesso: sessaoBanco.reset_senha_primeiro_acesso,
    },
  };
}

async function alterarSenhaPrimeiroAcesso(userId, novaSenha) {
  const senhaNormalizada = normalizarSenha(novaSenha);
  const result = await db.query(
    `UPDATE usuarios
     SET senha_hash = $1,
         reset_senha_primeiro_acesso = false,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, nome_completo, cpf, usuario, perfil_acesso, ativo, gestor_id, reset_senha_primeiro_acesso`,
    [hashSenha(senhaNormalizada), userId]
  );

  if (result.rows.length === 0) {
    throw criarErro('Usuário não encontrado.', 404);
  }

  return result.rows[0];
}

module.exports = {
  login,
  bootstrapAdmin,
  sincronizarAdminInicial,
  logout,
  obterSessao,
  alterarSenhaPrimeiroAcesso,
};
