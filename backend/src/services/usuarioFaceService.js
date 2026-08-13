'use strict';

const db = require('../config/database');
const faceRecognitionService = require('./faceRecognitionService');

function criarErro(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizarId(valor, nome = 'ID') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw criarErro(`${nome} invalido.`);
  }
  return numero;
}

function normalizarEmbedding(embedding, message = 'Embedding invalido.', statusCode = 400) {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== 128 ||
    embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw criarErro(message, statusCode);
  }
  return embedding;
}

async function listarFacesUsuario(usuarioId) {
  const userId = normalizarId(usuarioId, 'Usuario');
  const result = await db.query(
    `SELECT id,
            usuario_id,
            content_type,
            atualizado_em,
            (embedding IS NOT NULL) AS tem_embedding
     FROM usuarios_faces
     WHERE usuario_id = $1
     ORDER BY atualizado_em DESC, id DESC`,
    [userId]
  );
  return result.rows;
}

async function criarFaceUsuario(usuarioId, file) {
  const userId = normalizarId(usuarioId, 'Usuario');
  if (!file?.buffer) {
    throw criarErro('Arquivo de imagem invalido.');
  }

  const encoded = await faceRecognitionService.encodeImage(file);
  const result = await db.query(
    `INSERT INTO usuarios_faces (usuario_id, face, embedding, content_type, atualizado_em)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     RETURNING id, usuario_id, content_type, atualizado_em, (embedding IS NOT NULL) AS tem_embedding`,
    [userId, file.buffer, encoded.embedding, file.mimetype || 'image/jpeg']
  );
  return result.rows[0];
}

async function removerFaceUsuario(faceId, usuarioId = null) {
  const id = normalizarId(faceId, 'Face');
  const params = [id];
  let whereUsuario = '';
  if (usuarioId !== null && usuarioId !== undefined) {
    params.push(normalizarId(usuarioId, 'Usuario'));
    whereUsuario = ` AND usuario_id = $${params.length}`;
  }

  const result = await db.query(
    `DELETE FROM usuarios_faces
     WHERE id = $1 ${whereUsuario}
     RETURNING id, usuario_id`,
    params
  );

  if (result.rows.length === 0) {
    throw criarErro('Face nao encontrada.', 404);
  }
  return result.rows[0];
}

async function obterImagemFace(faceId, usuarioId = null) {
  const id = normalizarId(faceId, 'Face');
  const params = [id];
  let whereUsuario = '';
  if (usuarioId !== null && usuarioId !== undefined) {
    params.push(normalizarId(usuarioId, 'Usuario'));
    whereUsuario = ` AND usuario_id = $${params.length}`;
  }

  const result = await db.query(
    `SELECT id, usuario_id, face, content_type
     FROM usuarios_faces
     WHERE id = $1 ${whereUsuario}
     LIMIT 1`,
    params
  );

  if (result.rows.length === 0) {
    throw criarErro('Imagem facial nao encontrada.', 404);
  }
  return result.rows[0];
}

async function listarCandidatosReconhecimento() {
  const result = await db.query(
    `SELECT uf.id AS "faceId",
            uf.usuario_id AS "usuarioId",
            uf.embedding
     FROM usuarios_faces uf
     JOIN usuarios u ON u.id = uf.usuario_id
     WHERE u.ativo = true
       AND uf.embedding IS NOT NULL`
  );
  return result.rows.map((row) => ({
    faceId: Number(row.faceId),
    usuarioId: Number(row.usuarioId),
    embedding: normalizarEmbedding(
      row.embedding,
      'Embedding facial persistido invalido para reconhecimento.',
      500
    ),
  }));
}

async function atualizarEmbedding(faceId, embedding) {
  const id = normalizarId(faceId, 'Face');
  const embeddingNormalizado = normalizarEmbedding(embedding);
  const result = await db.query(
    `UPDATE usuarios_faces
     SET embedding = $2,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, usuario_id, content_type, atualizado_em, (embedding IS NOT NULL) AS tem_embedding`,
    [id, embeddingNormalizado]
  );
  if (result.rows.length === 0) {
    throw criarErro('Face nao encontrada.', 404);
  }
  return result.rows[0];
}

module.exports = {
  listarFacesUsuario,
  criarFaceUsuario,
  removerFaceUsuario,
  obterImagemFace,
  listarCandidatosReconhecimento,
  atualizarEmbedding,
};
