'use strict';

/**
 * Middleware de autenticação/autorização.
 *
 * Extrai o token Bearer, valida a sessão ativa e aplica o bloqueio de rotas quando o
 * usuário ainda precisa concluir a troca de senha do primeiro acesso.
 */
const authService = require('../services/authService');

function extrairToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
}

async function autenticar(req, res, next) {
  try {
    const token = extrairToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token de acesso ausente.' });
    }

    const sessao = await authService.obterSessao(token);
    if (!sessao) {
      return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
    }

    req.auth = {
      token,
      user: sessao.usuario,
      expiraEm: sessao.expiraEm,
    };

    const precisaAlterarSenha = Boolean(sessao.usuario?.reset_senha_primeiro_acesso);
    const caminho = String(req.path || '');
    const permitidosDuranteReset = ['/auth/me', '/auth/logout', '/auth/alterar-senha'];

    if (precisaAlterarSenha && !permitidosDuranteReset.includes(caminho)) {
      return res.status(403).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'É necessário alterar a senha no primeiro acesso antes de continuar.',
      });
    }

    next();
  } catch (err) {
    console.error(`[auth] Falha ao autenticar: ${err.message}`);
    res.status(500).json({ success: false, message: 'Erro ao validar autenticação.' });
  }
}

function autorizar(perfisPermitidos) {
  const perfis = Array.isArray(perfisPermitidos) ? perfisPermitidos : [perfisPermitidos];

  return (req, res, next) => {
    const perfil = req.auth?.user?.perfil_acesso;

    if (!perfil || !perfis.includes(perfil)) {
      return res.status(403).json({ success: false, message: 'Acesso negado para este perfil.' });
    }

    next();
  };
}

module.exports = {
  autenticar,
  autorizar,
};
