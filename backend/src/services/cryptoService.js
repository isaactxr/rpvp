'use strict';

/**
 * Utilitário criptográfico de senhas.
 *
 * Usa `pbkdf2` com salt configurado no ambiente para armazenar hashes e comparar credenciais
 * sem expor a senha original em nenhuma etapa do fluxo.
 */
const crypto = require('crypto');
const config = require('../config/env');

const ITERACOES = 120000;
const KEYLEN = 64;
const DIGEST = 'sha512';

/**
 * Gera o hash persistido da senha usando PBKDF2.
 * @param {string} senha Senha em texto puro validada pela camada de serviço.
 * @returns {string} Valor serializado no formato `pbkdf2$iteracoes$digest$hash`.
 */
function hashSenha(senha) {
  const texto = String(senha || '');
  if (texto.length < 6) {
    const err = new Error('A senha deve ter ao menos 6 caracteres.');
    err.statusCode = 400;
    throw err;
  }

  const salt = config.AUTH_PASSWORD_SALT;
  const hash = crypto.pbkdf2Sync(texto, salt, ITERACOES, KEYLEN, DIGEST).toString('hex');
  return `pbkdf2$${ITERACOES}$${DIGEST}$${hash}`;
}

/**
 * Compara uma senha informada com o hash armazenado, usando `timingSafeEqual` para evitar comparação insegura.
 * @param {string} senha Senha recebida na autenticação.
 * @param {string} armazenada Hash persistido no banco.
 * @returns {boolean} `true` quando a senha corresponde ao hash armazenado.
 */
function verificarSenha(senha, armazenada) {
  if (!armazenada) return false;
  const [algoritmo, iteracoesTxt, digest, hashOriginal] = String(armazenada).split('$');

  if (algoritmo !== 'pbkdf2' || !iteracoesTxt || !digest || !hashOriginal) {
    return false;
  }

  const iteracoes = Number(iteracoesTxt);
  if (!Number.isInteger(iteracoes) || iteracoes <= 0) {
    return false;
  }

  const hashComparacao = crypto
    .pbkdf2Sync(String(senha || ''), config.AUTH_PASSWORD_SALT, iteracoes, KEYLEN, digest)
    .toString('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hashOriginal, 'hex'), Buffer.from(hashComparacao, 'hex'));
  } catch (_err) {
    return false;
  }
}

module.exports = {
  hashSenha,
  verificarSenha,
};
