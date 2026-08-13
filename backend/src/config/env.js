'use strict';

/**
 * src/config/env.js — Carrega e valida variáveis de ambiente
 *
 * Deve ser o primeiro módulo importado no server.js.
 * Encerra o processo caso alguma variável obrigatória esteja ausente,
 * evitando que o servidor suba em estado inválido.
 */

require('dotenv').config();
process.env.TZ = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseTrustProxy(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 1;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return raw;
}

// ─── Variáveis obrigatórias ───────────────────────────────────────────────────

const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();

const REQUIRED = [
  'FACE_RECOGNITION_URL',
  'CORS_ORIGINS',
  'AUTH_PASSWORD_SALT',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
];

const missing = REQUIRED.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `[config] ERRO: Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}\n` +
    `         Copie .env.example para .env e preencha os valores.`
  );
  process.exit(1);
}

const corsRaw = String(process.env.CORS_ORIGINS || '').trim();
const allowBootstrapAdmin = parseBool(process.env.ALLOW_BOOTSTRAP_ADMIN, false);

if (NODE_ENV === 'production' && corsRaw === '*') {
  console.error('[config] ERRO: CORS_ORIGINS nao pode ser "*" em producao.');
  process.exit(1);
}

if (NODE_ENV === 'production' && allowBootstrapAdmin) {
  console.error('[config] ERRO: ALLOW_BOOTSTRAP_ADMIN deve ser false em producao.');
  process.exit(1);
}

// ─── Exporta configuração tipada ──────────────────────────────────────────────

module.exports = Object.freeze({
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  APP_TIMEZONE: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY),

  // Face Recognition
  FACE_RECOGNITION_URL: process.env.FACE_RECOGNITION_URL,
  FACE_RECOGNITION_THRESHOLD: parseFloat(process.env.FACE_RECOGNITION_THRESHOLD) || 0.6,
  FACE_RECOGNITION_TIMEOUT_MS: parseInt(process.env.FACE_RECOGNITION_TIMEOUT_MS, 10) || 15000,

  // CORS
  CORS_ORIGINS: corsRaw,

  // Autenticação
  AUTH_TOKEN_TTL_HOURS: parseInt(process.env.AUTH_TOKEN_TTL_HOURS, 10) || 12,
  AUTH_PASSWORD_SALT: process.env.AUTH_PASSWORD_SALT,
  INITIAL_ADMIN_NAME: process.env.INITIAL_ADMIN_NAME || 'Viana Peixoto',
  INITIAL_ADMIN_USER: process.env.INITIAL_ADMIN_USER || 'viana.peixoto',
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || '',
  ALLOW_BOOTSTRAP_ADMIN: allowBootstrapAdmin,

  // Segurança HTTP
  RATE_LIMIT_AUTH_WINDOW_MS: parsePositiveInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 15),
  RATE_LIMIT_RECOGNIZE_WINDOW_MS: parsePositiveInt(process.env.RATE_LIMIT_RECOGNIZE_WINDOW_MS, 60 * 1000),
  RATE_LIMIT_RECOGNIZE_MAX: parsePositiveInt(process.env.RATE_LIMIT_RECOGNIZE_MAX, 30),

  // Controle de presença
  PRESENCE_COOLDOWN_MS: parseInt(process.env.PRESENCE_COOLDOWN_MS, 10) || 10000,
  // PostgreSQL
  DB_HOST:     process.env.DB_HOST,
  DB_PORT:     parseInt(process.env.DB_PORT, 10),
  DB_DATABASE: process.env.DB_DATABASE,
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_SCHEMA:   process.env.DB_SCHEMA || 'public',
});
