'use strict';

/**
 * src/services/tipoSessaoService.js — CRUD para tipos de sessão curados pelo admin
 */

const db = require('../config/database');

function _criarErro(msg, status = 400) {
  const err = new Error(msg);
  err.statusCode = status;
  return err;
}

function _normalizarNome(valor) {
  const texto = String(valor || '').trim();
  if (!texto) throw _criarErro('Informe o nome do tipo de sessão.');
  if (texto.length > 80) throw _criarErro('O nome do tipo de sessão deve ter no máximo 80 caracteres.');
  return texto;
}

async function listarTipos({ apenasAtivos = false } = {}) {
  const sql = apenasAtivos
    ? 'SELECT id, nome, ativo, criado_em FROM tipos_sessao WHERE ativo = true ORDER BY nome'
    : 'SELECT id, nome, ativo, criado_em FROM tipos_sessao ORDER BY nome';

  const result = await db.query(sql);
  return result.rows;
}

async function criarTipo(nome) {
  const nomeNorm = _normalizarNome(nome);

  const existente = await db.query(
    'SELECT id FROM tipos_sessao WHERE LOWER(nome) = LOWER($1)',
    [nomeNorm],
  );
  if (existente.rows.length > 0) {
    throw _criarErro('Já existe um tipo de sessão com este nome.', 409);
  }

  const result = await db.query(
    'INSERT INTO tipos_sessao (nome) VALUES ($1) RETURNING id, nome, ativo, criado_em',
    [nomeNorm],
  );
  return result.rows[0];
}

async function atualizarTipo(id, { nome, ativo } = {}) {
  const tipoId = parseInt(id, 10);
  if (!Number.isInteger(tipoId) || tipoId <= 0) throw _criarErro('ID inválido.');

  const existente = await db.query(
    'SELECT id, nome, ativo FROM tipos_sessao WHERE id = $1',
    [tipoId],
  );
  if (existente.rows.length === 0) throw _criarErro('Tipo de sessão não encontrado.', 404);

  const nomeNorm = nome !== undefined ? _normalizarNome(nome) : existente.rows[0].nome;
  const ativoNorm = ativo !== undefined ? Boolean(ativo) : existente.rows[0].ativo;

  const result = await db.query(
    'UPDATE tipos_sessao SET nome = $1, ativo = $2 WHERE id = $3 RETURNING id, nome, ativo, criado_em',
    [nomeNorm, ativoNorm, tipoId],
  );
  return result.rows[0];
}

async function deletarTipo(id) {
  const tipoId = parseInt(id, 10);
  if (!Number.isInteger(tipoId) || tipoId <= 0) throw _criarErro('ID inválido.');

  const emUso = await db.query(
    'SELECT id FROM sessoes WHERE tipo_sessao = (SELECT nome FROM tipos_sessao WHERE id = $1) LIMIT 1',
    [tipoId],
  );
  if (emUso.rows.length > 0) {
    throw _criarErro('Não é possível remover um tipo que está sendo usado em sessões. Desative-o em vez disso.', 409);
  }

  await db.query('DELETE FROM tipos_sessao WHERE id = $1', [tipoId]);
}

module.exports = { listarTipos, criarTipo, atualizarTipo, deletarTipo };
