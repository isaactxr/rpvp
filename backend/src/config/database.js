'use strict';

/**
 * src/config/database.js — Pool de conexões PostgreSQL
 *
 * Responsabilidades:
 *   - Criar e exportar um pool de conexões PostgreSQL
 *   - Validar a conexão ao iniciar o servidor
 *   - Fornecer métodos para executar queries
 */

const { Pool } = require('pg');
const config = require('./env');

const schema = config.DB_SCHEMA;
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  throw new Error(`[database] DB_SCHEMA inválido: ${schema}`);
}

// ─── Pool de Conexões ─────────────────────────────────────────────────────────

const pool = new Pool({
  host:     config.DB_HOST,
  port:     config.DB_PORT,
  database: config.DB_DATABASE,
  user:     config.DB_USERNAME,
  password: config.DB_PASSWORD,
  options:  `-c search_path=${schema},public -c timezone=${config.APP_TIMEZONE}`,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ─── Eventos do Pool ──────────────────────────────────────────────────────────

pool.on('error', (err) => {
  console.error('[database] Erro não tratado no pool:', err);
});

pool.on('connect', () => {
  console.log('[database] Nova conexão estabelecida');
});

// ─── Validação inicial ────────────────────────────────────────────────────────

async function validarConexao() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log(`[database] Conectado com sucesso: ${result.rows[0].now}`);
    return true;
  } catch (err) {
    console.error(`[database] Erro ao conectar: ${err.message}`);
    return false;
  }
}

// ─── Exporta ──────────────────────────────────────────────────────────────────

module.exports = {
  pool,
  validarConexao,

  /**
   * Executa uma query simples
   * @param {string} text - Comando SQL
   * @param {Array} values - Parâmetros preparados
   * @returns {Promise<{rows, rowCount}>}
   */
  async query(text, values) {
    const start = Date.now();
    try {
      const result = await pool.query(text, values);
      const duration = Date.now() - start;
      console.log(`[database] Query executada em ${duration}ms`);
      return result;
    } catch (err) {
      console.error(`[database] Erro na query: ${err.message}`);
      throw err;
    }
  },

  /**
   * Inicia uma transação
   * @returns {Promise<Client>}
   */
  async getClient() {
    return pool.connect();
  },
};
