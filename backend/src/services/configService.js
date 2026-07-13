'use strict';

/**
 * src/services/configService.js — Configurações administrativas em banco de dados
 *
 * Mantém um cache em memória invalidado a cada escrita.
 * Chaves e tipos são definidos em DEFAULTS e nunca aceitos ad-hoc.
 */

const db = require('../config/database');

// ─── Definições de configurações ──────────────────────────────────────────────

const DEFAULTS = [
  {
    chave: 'checkout_obrigatorio',
    valor: 'false',
    tipo: 'boolean',
    descricao: 'Exige checkout facial para considerar a presença como concluída',
  },
  {
    chave: 'min_checkout_intervalo_seg',
    valor: '180',
    tipo: 'integer',
    descricao: 'Intervalo mínimo em segundos entre check-in e checkout',
  },
  {
    chave: 'cooldown_entre_tentativas_ms',
    valor: '10000',
    tipo: 'integer',
    descricao: 'Cooldown em milissegundos entre tentativas de reconhecimento facial',
  },
  {
    chave: 'limiar_similaridade',
    valor: '0.92',
    tipo: 'decimal',
    descricao: 'Limiar de similaridade para aceitar o reconhecimento facial (0.0 – 1.0)',
  },
  {
    chave: 'ear_fechado',
    valor: '0.20',
    tipo: 'decimal',
    descricao: 'EAR abaixo do qual o olho é considerado fechado na detecção de piscada',
  },
  {
    chave: 'ear_aberto',
    valor: '0.25',
    tipo: 'decimal',
    descricao: 'EAR acima do qual o olho é considerado aberto na detecção de piscada',
  },
  {
    chave: 'area_minima_rosto',
    valor: '0.06',
    tipo: 'decimal',
    descricao: 'Fração mínima do frame que o rosto deve ocupar (rejeita rostos distantes)',
  },
  {
    chave: 'frames_fechado_min',
    valor: '2',
    tipo: 'integer',
    descricao: 'Frames consecutivos com EAR fechado para validar o estado',
  },
  {
    chave: 'frames_aberto_min',
    valor: '2',
    tipo: 'integer',
    descricao: 'Frames consecutivos com EAR aberto para validar o estado',
  },
  {
    chave: 'atraso_pos_piscada_ms',
    valor: '700',
    tipo: 'integer',
    descricao: 'Atraso em milissegundos entre detectar a piscada e capturar a foto',
  },
  {
    chave: 'limite_exportacao',
    valor: '10000',
    tipo: 'integer',
    descricao: 'Número máximo de linhas permitido por exportação (PDF/Excel)',
  },
  {
    chave: 'ttl_token_horas',
    valor: '12',
    tipo: 'integer',
    descricao: 'Tempo de vida do token de autenticação em horas',
  },
];

// Chaves cujos valores são enviados ao frontend sem autenticação
const CHAVES_PUBLICAS = new Set([
  'ear_fechado',
  'ear_aberto',
  'area_minima_rosto',
  'frames_fechado_min',
  'frames_aberto_min',
  'cooldown_entre_tentativas_ms',
  'atraso_pos_piscada_ms',
]);

// ─── Cache ────────────────────────────────────────────────────────────────────

let _cache = null;

function _parseValor(valor, tipo) {
  if (tipo === 'boolean') return valor === 'true';
  if (tipo === 'integer') return parseInt(valor, 10);
  if (tipo === 'decimal') return parseFloat(valor);
  return valor;
}

async function _carregarCache() {
  if (_cache !== null) return _cache;

  const result = await db.query(
    'SELECT chave, valor, tipo FROM configuracoes ORDER BY chave',
  );

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.chave] = _parseValor(row.valor, row.tipo);
  }

  _cache = mapa;
  return _cache;
}

function invalidarCache() {
  _cache = null;
}

// ─── API pública do serviço ───────────────────────────────────────────────────

async function obterTodos() {
  const result = await db.query(
    'SELECT chave, valor, tipo, descricao, atualizado_em FROM configuracoes ORDER BY chave',
  );
  return result.rows;
}

async function obter(chave) {
  const mapa = await _carregarCache();
  return mapa[chave] ?? null;
}

async function atualizar(chave, valor) {
  await db.query(
    'UPDATE configuracoes SET valor = $1, atualizado_em = NOW() WHERE chave = $2',
    [String(valor), chave],
  );
  invalidarCache();
}

async function atualizarLote(pares) {
  for (const { chave, valor } of pares) {
    await atualizar(chave, valor);
  }
}

async function obterPublico() {
  const mapa = await _carregarCache();
  const pub = {};
  for (const chave of CHAVES_PUBLICAS) {
    if (chave in mapa) pub[chave] = mapa[chave];
  }
  return pub;
}

module.exports = {
  DEFAULTS,
  obterTodos,
  obter,
  atualizar,
  atualizarLote,
  obterPublico,
  invalidarCache,
};
