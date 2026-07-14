'use strict';

/**
 * src/middleware/upload.js — Configuração do Multer
 *
 * Usa armazenamento em memória (memoryStorage) para que o buffer
 * da imagem fique disponível em req.file.buffer e possa ser
 * encaminhado diretamente ao motor facial sem gravar em disco.
 *
 * Restrições:
 *   - Apenas imagens (JPEG, PNG, WEBP)
 *   - Tamanho máximo: 5 MB
 *   - Campo esperado: "file" (compatível com o frontend)
 */

const multer = require('multer');

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TAMANHO_MAX_MB  = 5;

const storage = multer.memoryStorage();

function filtroArquivo(_req, file, callback) {
  if (!MIME_PERMITIDOS.has(file.mimetype)) {
    const err = new Error(
      `Tipo de arquivo não suportado: ${file.mimetype}. Use JPEG, PNG ou WEBP.`
    );
    err.code = 'INVALID_FILE_TYPE';
    return callback(err);
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter: filtroArquivo,
  limits: {
    fileSize: TAMANHO_MAX_MB * 1024 * 1024,
    files: 10,
  },
});

/**
 * Middleware de tratamento de erros do Multer.
 * Deve ser usado APÓS o middleware de upload nas rotas.
 */
function tratarErroUpload(err, _req, res, next) {
  if (err?.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, reconhecido: false, message: err.message });
  }

  if (err instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE:       `Imagem muito grande. Máximo: ${TAMANHO_MAX_MB} MB.`,
      LIMIT_UNEXPECTED_FILE: err.message || 'Campo de arquivo inesperado.',
    };
    const msg = mensagens[err.code] ?? `Erro no upload: ${err.code}`;
    return res.status(400).json({ success: false, reconhecido: false, message: msg });
  }
  next(err);
}

module.exports = { upload, tratarErroUpload };
