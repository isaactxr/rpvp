'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('usuarios nao depende mais das colunas subject legadas', () => {
  const dbInit = read('db/init.sql');
  const authService = read('backend/src/services/authService.js');
  const usuarioService = read('backend/src/services/usuarioService.js');
  const presencaService = read('backend/src/services/presencaService.js');
  const reconhecerController = read('backend/src/controllers/reconhecerController.js');

  assert.doesNotMatch(dbInit, /\bsubject(?:_compreface)?\b/);
  assert.doesNotMatch(authService, /\bsubject(?:_compreface)?\b/);
  assert.doesNotMatch(usuarioService, /\bsubject(?:_compreface)?\b/);
  assert.doesNotMatch(presencaService, /\bsubject(?:_compreface)?\b/);
  assert.doesNotMatch(reconhecerController, /\bsubject(?:_compreface)?\b/);
});
