'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function carregarSessaoServiceComDbMock(queryMock) {
  const servicePath = path.resolve(__dirname, '../src/services/sessaoService.js');
  const dbPath = path.resolve(__dirname, '../src/config/database.js');

  delete require.cache[servicePath];
  delete require.cache[dbPath];

  const originalLoad = Module._load;
  Module._load = function carregarMock(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === dbPath) {
      return { query: queryMock };
    }

    return originalLoad(request, parent, isMain);
  };

  return {
    service: require(servicePath),
    restore: () => {
      Module._load = originalLoad;
      delete require.cache[servicePath];
      delete require.cache[dbPath];
    },
  };
}

test('criarSessao rejeita tipo de sessao que nao esta ativo nos tipos cadastrados', async () => {
  const queryMock = async (sql) => {
    const textoSql = String(sql);
    if (textoSql.includes('FROM usuarios')) {
      return {
        rows: [{
          id: 10,
          nome_completo: 'Instrutor',
          perfil_acesso: 'instrutor',
        }],
      };
    }

    if (textoSql.includes('FROM tipos_sessao')) {
      return { rows: [] };
    }

    if (textoSql.includes('INSERT INTO sessoes')) {
      throw new Error('sessao nao deveria ser criada com tipo inexistente');
    }

    return { rows: [] };
  };

  const { service, restore } = carregarSessaoServiceComDbMock(queryMock);

  try {
    await assert.rejects(
      () => service.criarSessao({
        tipoSessao: 'Tipo livre',
        instrutorId: 10,
      }),
      /Selecione um tipo de sessao ativo/
    );
  } finally {
    restore();
  }
});
