'use strict';

/**
 * server.js — Ponto de entrada da aplicação
 *
 * Responsabilidades:
 *   - Carregar variáveis de ambiente (deve ser o PRIMEIRO import)
 *   - Configurar Express + middlewares globais (CORS, JSON, logs)
 *   - Registrar rotas
 *   - Iniciar servidor na porta configurada
 */

// Carrega .env ANTES de qualquer outro módulo que precise das vars
const config = require('./src/config/env');
const db     = require('./src/config/database');
const authService = require('./src/services/authService');
const configService = require('./src/services/configService');

const express = require('express');
const cors    = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const reconhecerRouter = require('./src/routes/reconhecer');

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY);

const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_AUTH_WINDOW_MS,
  max: config.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Muitas tentativas de autenticacao. Tente novamente em instantes.',
  },
});

const recognizeLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_RECOGNIZE_WINDOW_MS,
  max: config.RATE_LIMIT_RECOGNIZE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    reconhecido: false,
    message: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
  },
});

app.use(helmet());
app.use('/auth/login', authLimiter);
app.use('/reconhecer', recognizeLimiter);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Origins são definidas via CORS_ORIGINS no .env (separadas por vírgula).
// Nunca expõe a API Key ao frontend — ela fica exclusivamente no backend.

const corsAllowAll = String(config.CORS_ORIGINS || '').trim() === '*';
const originsPermitidas = String(config.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Permite requisições sem origin (ex.: curl, Postman, apps mobile)
    if (!origin) return callback(null, true);

    if (corsAllowAll && config.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (originsPermitidas.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin não permitida → ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Middlewares globais ──────────────────────────────────────────────────────

app.use(express.json());


// Log de todas as requisições recebidas
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Rotas ───────────────────────────────────────────────────────────────────

app.use('/', reconhecerRouter);

// Health-check simples
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Erro 404 ────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint não encontrado' });
});

// ─── Tratamento global de erros ──────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(`[erro global] ${err.message}`);

  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: 'Origin não permitida por política de CORS',
    });
  }

  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
  });
});

// ─── Inicialização ───────────────────────────────────────────────────────────

async function iniciar() {
  try {
    // Valida conexão com banco de dados
    console.log('[server] Validando conexão com PostgreSQL...');
    const conectado = await db.validarConexao();
    if (!conectado) {
      console.error('[server] Falha ao conectar ao banco de dados. Encerrando.');
      process.exit(1);
    }

    console.log('[server] Garantindo estrutura de setores...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS setores (
         id SERIAL PRIMARY KEY,
         nome VARCHAR(120) NOT NULL UNIQUE,
         criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    );

    await db.query(
      `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL`
    );

    await db.query(
      `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS cpf VARCHAR(11)`
    );

    await db.query(
      `ALTER TABLE usuarios
       ADD COLUMN IF NOT EXISTS reset_senha_primeiro_acesso BOOLEAN NOT NULL DEFAULT false`
    );

    await db.query(
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'usuarios'
             AND column_name = 'subject_compreface'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'usuarios'
             AND column_name = 'subject'
         ) THEN
           ALTER TABLE usuarios RENAME COLUMN subject_compreface TO subject;
         END IF;

         IF EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'usuarios_subject_compreface_key'
         ) THEN
           ALTER TABLE usuarios RENAME CONSTRAINT usuarios_subject_compreface_key TO usuarios_subject_key;
         END IF;
       END $$`
    );

    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS usuarios_cpf_unique_idx
       ON usuarios (cpf)
       WHERE cpf IS NOT NULL`
    );

    console.log('[server] Garantindo estrutura de faces de usuarios...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS usuarios_faces (
         id SERIAL PRIMARY KEY,
         usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
         face BYTEA NOT NULL,
         embedding DOUBLE PRECISION[],
         content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
         atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_usuario_id
       ON usuarios_faces (usuario_id)`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_embedding_not_null
       ON usuarios_faces (usuario_id)
       WHERE embedding IS NOT NULL`
    );

    await db.query(
      `CREATE TABLE IF NOT EXISTS sessoes_autenticacao (
         id BIGSERIAL PRIMARY KEY,
         token_hash CHAR(64) NOT NULL UNIQUE,
         usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
         expira_em TIMESTAMPTZ NOT NULL,
         criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         revogado_em TIMESTAMPTZ
       )`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sessoes_auth_usuario ON sessoes_autenticacao (usuario_id)`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_sessoes_auth_expira_em ON sessoes_autenticacao (expira_em)`
    );

    await db.query(
      `DELETE FROM sessoes_autenticacao
       WHERE expira_em < NOW() - INTERVAL '7 days'`
    );


    console.log('[server] Garantindo estrutura de execução de sessões...');
    await db.query(
      `ALTER TABLE sessoes
       ADD COLUMN IF NOT EXISTS inicio_efetivo_em TIMESTAMP,
       ADD COLUMN IF NOT EXISTS fim_efetivo_em TIMESTAMP`
    );

    await db.query(
      `ALTER TABLE sessoes
       ADD COLUMN IF NOT EXISTS tipo_sessao VARCHAR(80)`
    );

    await db.query(
      `ALTER TABLE sessoes
       ADD COLUMN IF NOT EXISTS checkout_habilitado BOOLEAN NOT NULL DEFAULT false`
    );

    // ─── Tabela de tipos de sessão curados ───────────────────────────────────────
    console.log('[server] Garantindo tabela tipos_sessao...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS tipos_sessao (
         id        SERIAL PRIMARY KEY,
         nome      VARCHAR(80) NOT NULL UNIQUE,
         ativo     BOOLEAN NOT NULL DEFAULT true,
         criado_em TIMESTAMPTZ DEFAULT NOW()
       )`
    );

    // Migra tipos já existentes nas sessões para a tabela curada
    await db.query(
      `INSERT INTO tipos_sessao (nome)
       SELECT DISTINCT TRIM(tipo_sessao)
       FROM sessoes
       WHERE TRIM(tipo_sessao) <> ''
         AND tipo_sessao IS NOT NULL
       ON CONFLICT (nome) DO NOTHING`
    );

    // ─── Tabela de configurações administrativas ──────────────────────────────────
    console.log('[server] Garantindo tabela configuracoes...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS configuracoes (
         chave         VARCHAR(80) PRIMARY KEY,
         valor         TEXT NOT NULL,
         tipo          VARCHAR(10) NOT NULL DEFAULT 'string',
         descricao     TEXT,
         atualizado_em TIMESTAMPTZ DEFAULT NOW()
       )`
    );

    // Semente de valores padrão (só insere se a chave ainda não existir)
    for (const def of configService.DEFAULTS) {
      await db.query(
        `INSERT INTO configuracoes (chave, valor, tipo, descricao)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chave) DO NOTHING`,
        [def.chave, def.valor, def.tipo, def.descricao]
      );
    }

    // Sincroniza descricao de chaves existentes (atualiza se mudou no código)
    for (const def of configService.DEFAULTS) {
      await db.query(
        `UPDATE configuracoes SET descricao = $1 WHERE chave = $2 AND (descricao IS DISTINCT FROM $1)`,
        [def.descricao, def.chave]
      );
    }

    const syncAdmin = await authService.sincronizarAdminInicial();
    if (syncAdmin.status === 'updated' || syncAdmin.status === 'created') {
      console.log(`[server] Admin inicial ${syncAdmin.status === 'updated' ? 'sincronizado' : 'criado'} para ${syncAdmin.usuario}.`);
    } else if (syncAdmin.status === 'skipped') {
      console.log(`[server] Admin inicial não sincronizado: ${syncAdmin.reason}`);
    }

    // Inicia o servidor
    app.listen(config.PORT, config.HOST, () => {
      console.log(`[server] ✓ Rodando em http://${config.HOST}:${config.PORT}`);
      console.log(`[server] ✓ Face Recognition: ${config.FACE_RECOGNITION_URL}`);
      console.log(`[server] ✓ Threshold facial: ${config.FACE_RECOGNITION_THRESHOLD}`);
      console.log(`[server] ✓ Banco de dados: ${config.DB_DATABASE}@${config.DB_HOST}:${config.DB_PORT}`);
    });
  } catch (err) {
    console.error(`[server] Erro fatal ao iniciar: ${err.message}`);
    process.exit(1);
  }
}

iniciar();
