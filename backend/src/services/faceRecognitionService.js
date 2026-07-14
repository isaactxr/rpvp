'use strict';

const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');

function criarErro(message, statusCode = 502) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizarEmbedding(embedding) {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== 128 ||
    embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw criarErro('Embedding facial invalido retornado pelo motor.', 502);
  }
  return embedding;
}

function normalizarCandidatos(candidates) {
  if (!Array.isArray(candidates)) {
    throw criarErro('Lista de candidatos facial invalida.', 400);
  }

  return candidates.map((candidate) => ({
    ...candidate,
    embedding: normalizarEmbedding(candidate?.embedding),
  }));
}

async function postImagem(path, { buffer, mimetype, filename = 'face.jpg', fields = {} }) {
  const form = new FormData();
  form.append('file', buffer, {
    filename,
    contentType: mimetype || 'image/jpeg',
    knownLength: buffer.length,
  });

  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  let response;
  try {
    response = await axios.post(`${config.FACE_RECOGNITION_URL}${path}`, form, {
      headers: form.getHeaders(),
      timeout: config.FACE_RECOGNITION_TIMEOUT_MS,
      validateStatus: () => true,
    });
  } catch (err) {
    throw criarErro(`Motor facial indisponivel: ${err.message}`, 502);
  }

  if (response.status >= 400) {
    const detail = response.data?.detail || response.data?.message || 'Falha no motor facial.';
    throw criarErro(detail, response.status === 422 ? 422 : 502);
  }

  return response.data || {};
}

async function encodeImage({ buffer, mimetype, originalname }) {
  const data = await postImagem('/encode', {
    buffer,
    mimetype,
    filename: originalname || 'face.jpg',
  });

  return {
    embedding: normalizarEmbedding(data.embedding),
    dimensions: Number(data.dimensions || data.embedding?.length || 0),
  };
}

async function recognizeImage({ buffer, mimetype, originalname, candidates }) {
  const candidatosNormalizados = normalizarCandidatos(candidates);
  const data = await postImagem('/recognize', {
    buffer,
    mimetype,
    filename: originalname || 'face.jpg',
    fields: {
      candidates: candidatosNormalizados,
      tolerance: String(config.FACE_RECOGNITION_THRESHOLD),
    },
  });

  return {
    reconhecido: Boolean(data.recognized),
    usuarioId: data.usuarioId ? Number(data.usuarioId) : null,
    faceId: data.faceId ? Number(data.faceId) : null,
    distance: data.distance === undefined || data.distance === null ? null : Number(data.distance),
    message: data.message || null,
  };
}

module.exports = {
  encodeImage,
  recognizeImage,
};
