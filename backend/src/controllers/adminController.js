'use strict';

/**
 * src/controllers/adminController.js — Handlers para o painel administrativo
 *
 * Rotas cobertas:
 *   GET  /admin/configuracoes          → listarConfiguracoes  (admin)
 *   PUT  /admin/configuracoes          → atualizarConfiguracoes (admin)
 *   GET  /config/publica               → obterConfigPublica   (sem auth)
 *   GET  /tipos-sessao                 → listarTiposSessao    (admin, instrutor)
 *   POST /tipos-sessao                 → criarTipoSessao      (admin)
 *   PUT  /tipos-sessao/:id             → atualizarTipoSessao  (admin)
 *   DELETE /tipos-sessao/:id           → deletarTipoSessao    (admin)
 */

const configService = require('../services/configService');
const tipoSessaoService = require('../services/tipoSessaoService');

function responderErro(res, err, fallback) {
  console.error(`[admin] ${fallback}: ${err.message}`);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || fallback });
}

function validarValorConfiguracao(item, mapaTipos) {
  const chave = String(item?.chave || '').trim();
  const valor = item?.valor;
  const tipo = mapaTipos.get(chave);

  if (!tipo) {
    const err = new Error(`Chave desconhecida: ${chave}`);
    err.statusCode = 400;
    throw err;
  }

  if (tipo === 'boolean' && !['true', 'false', true, false].includes(valor)) {
    const err = new Error(`Valor inválido para ${chave}. Use true ou false.`);
    err.statusCode = 400;
    throw err;
  }

  if (tipo === 'integer') {
    const numero = Number(valor);
    if (!Number.isInteger(numero)) {
      const err = new Error(`Valor inválido para ${chave}. Informe um número inteiro.`);
      err.statusCode = 400;
      throw err;
    }
  }

  if (tipo === 'decimal') {
    const numero = Number(valor);
    if (Number.isFinite(numero) && chave === 'limiar_similaridade' && (numero < 0.3 || numero > 0.8)) {
      const err = new Error('Distancia maxima de reconhecimento deve estar entre 0.30 e 0.80.');
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(numero)) {
      const err = new Error(`Valor inválido para ${chave}. Informe um número decimal.`);
      err.statusCode = 400;
      throw err;
    }
  }
}

// ─── Configurações ────────────────────────────────────────────────────────────

async function listarConfiguracoes(req, res) {
  try {
    const dados = await configService.obterTodos();
    res.json({ success: true, data: dados });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar configurações.');
  }
}

async function atualizarConfiguracoes(req, res) {
  try {
    const body = req.body;
    if (!Array.isArray(body) || body.length === 0) {
      return res.status(400).json({ success: false, message: 'Envie um array de { chave, valor }.' });
    }

    const todos = await configService.obterTodos();
    const chavesValidas = new Set(todos.map((c) => c.chave));
    const mapaTipos = new Map(todos.map((c) => [c.chave, c.tipo]));

    for (const item of body) {
      if (!item.chave || !chavesValidas.has(item.chave)) {
        return res.status(400).json({ success: false, message: `Chave desconhecida: ${item.chave}` });
      }
      if (item.valor === undefined || item.valor === null) {
        return res.status(400).json({ success: false, message: `Valor ausente para: ${item.chave}` });
      }
      validarValorConfiguracao(item, mapaTipos);
    }

    await configService.atualizarLote(body);

    console.log(`[admin] ${body.length} configuração(ões) atualizada(s) por ${req.auth?.user?.nome_completo}`);
    res.json({ success: true, message: `${body.length} configuração(ões) salva(s) com sucesso.` });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar configurações.');
  }
}

// ─── Config Pública (sem autenticação) ───────────────────────────────────────

async function obterConfigPublica(req, res) {
  try {
    const dados = await configService.obterPublico();
    res.json({ success: true, data: dados });
  } catch (err) {
    responderErro(res, err, 'Erro ao obter configurações públicas.');
  }
}

// ─── Tipos de Sessão ──────────────────────────────────────────────────────────

async function listarTiposSessao(req, res) {
  try {
    const apenasAtivos = String(req.query?.ativo || '').toLowerCase() === 'true';
    const dados = await tipoSessaoService.listarTipos({ apenasAtivos });
    res.json({ success: true, data: dados });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar tipos de sessão.');
  }
}

async function criarTipoSessao(req, res) {
  try {
    const tipo = await tipoSessaoService.criarTipo(req.body?.nome);
    res.status(201).json({ success: true, data: tipo });
  } catch (err) {
    responderErro(res, err, 'Erro ao criar tipo de sessão.');
  }
}

async function atualizarTipoSessao(req, res) {
  try {
    const tipo = await tipoSessaoService.atualizarTipo(req.params.id, req.body || {});
    res.json({ success: true, data: tipo });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar tipo de sessão.');
  }
}

async function deletarTipoSessao(req, res) {
  try {
    await tipoSessaoService.deletarTipo(req.params.id);
    res.json({ success: true, message: 'Tipo de sessão removido.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao remover tipo de sessão.');
  }
}

module.exports = {
  listarConfiguracoes,
  atualizarConfiguracoes,
  obterConfigPublica,
  listarTiposSessao,
  criarTipoSessao,
  atualizarTipoSessao,
  deletarTipoSessao,
};
