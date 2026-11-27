'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  let rows = [];
  const db = { async query(sql, values) {
    if (sql.startsWith('UPDATE')) {
      rows.find(row => row.chave === values[1]).valor = values[0];
      return { rows: [] };
    }
    return { rows: rows.map(row => ({ ...row })) };
  } };
  const context = vm.createContext({ module: { exports: {} }, require: () => db });
  vm.runInContext(fs.readFileSync(require.resolve('../src/services/configService.js'), 'utf8'), context);
  const service = context.module.exports;
  rows = service.DEFAULTS.map(({ chave, valor, tipo }) => ({ chave, valor, tipo }));
  return service;
}

test('configuração pública inicial usa uma amostra fechada e máscara desligada', async () => {
  const pub = await setup().obterPublico();
  assert.equal(pub.frames_fechado_min, 1);
  assert.equal(pub.frames_aberto_min, 2);
  assert.equal(pub.mostrar_mascara_olhos, false);
  assert.equal('ttl_token_horas' in pub, false);
});

test('salvar máscara invalida cache e mantém tipo booleano na configuração pública', async () => {
  const service = setup();
  await service.obterPublico();
  await service.atualizar('mostrar_mascara_olhos', true);
  assert.equal((await service.obterPublico()).mostrar_mascara_olhos, true);
  await service.atualizar('mostrar_mascara_olhos', false);
  assert.equal((await service.obterPublico()).mostrar_mascara_olhos, false);
});
