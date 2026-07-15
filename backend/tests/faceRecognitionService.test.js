'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function carregarServicoComMocks({ limiar }) {
  const servicePath = path.resolve(__dirname, '../src/services/faceRecognitionService.js');
  const configServicePath = path.resolve(__dirname, '../src/services/configService.js');
  const envPath = path.resolve(__dirname, '../src/config/env.js');

  delete require.cache[servicePath];
  delete require.cache[configServicePath];
  delete require.cache[envPath];

  let multipartBody = null;
  class FakeFormData {
    constructor() {
      this._streams = [];
    }

    append(key, value) {
      this._streams.push(key);
      this._streams.push(String(value));
    }

    getHeaders() {
      return {};
    }
  }

  const originalLoad = Module._load;
  Module._load = function carregarMock(request, parent, isMain) {
    if (request === 'axios') {
      return {
        post: async (_url, body) => {
          multipartBody = body;
          return {
            status: 200,
            data: {
              success: true,
              recognized: false,
              distance: 0.75,
            },
          };
        },
      };
    }

    if (request === 'form-data') {
      return FakeFormData;
    }

    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === configServicePath) {
      return {
        obter: async (chave) => (chave === 'limiar_similaridade' ? limiar : null),
      };
    }

    if (resolved === envPath) {
      return {
        FACE_RECOGNITION_URL: 'http://face-recognition:8000',
        FACE_RECOGNITION_THRESHOLD: 0.6,
        FACE_RECOGNITION_TIMEOUT_MS: 15000,
      };
    }

    return originalLoad(request, parent, isMain);
  };

  return {
    service: require(servicePath),
    getMultipartBody: () => multipartBody,
    restore: () => {
      Module._load = originalLoad;
    },
  };
}

test('recognizeImage usa limiar_similaridade do banco como tolerance', async () => {
  const { service, getMultipartBody, restore } = carregarServicoComMocks({ limiar: 0.42 });

  try {
    await service.recognizeImage({
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/jpeg',
      originalname: 'face.jpg',
      candidates: [{
        usuarioId: 1,
        faceId: 10,
        embedding: Array.from({ length: 128 }, () => 0.1),
      }],
    });

    const body = getMultipartBody();
    assert.ok(body, 'multipart body deveria ter sido enviado ao motor facial');
    assert.match(body._streams.join('\n'), /0\.42/);
  } finally {
    restore();
  }
});
