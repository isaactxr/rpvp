### Task 4: Add Backend Face Services

**Files:**
- Create: `backend/src/services/faceRecognitionService.js`
- Create: `backend/src/services/usuarioFaceService.js`

**Interfaces:**
- Produces `faceRecognitionService.encodeImage(fileOrBuffer)`.
- Produces `faceRecognitionService.recognizeImage({ buffer, mimetype, originalname, candidates })`.
- Produces `usuarioFaceService.listarFacesUsuario(usuarioId)`.
- Produces `usuarioFaceService.criarFaceUsuario(usuarioId, file)`.
- Produces `usuarioFaceService.removerFaceUsuario(faceId, usuarioId = null)`.
- Produces `usuarioFaceService.obterImagemFace(faceId, usuarioId = null)`.
- Produces `usuarioFaceService.listarCandidatosReconhecimento()`.
- Produces `usuarioFaceService.atualizarEmbedding(faceId, embedding)`.

- [ ] **Step 1: Create `backend/src/services/faceRecognitionService.js`**

```js
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
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw criarErro('Embedding facial invalido retornado pelo motor.', 502);
  }
  return embedding.map((value) => Number(value));
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
  const data = await postImagem('/recognize', {
    buffer,
    mimetype,
    filename: originalname || 'face.jpg',
    fields: {
      candidates,
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
```

- [ ] **Step 2: Create `backend/src/services/usuarioFaceService.js`**

```js
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
  if (usuarioId) {
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
  if (usuarioId) {
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
    embedding: row.embedding.map(Number),
  }));
}

async function atualizarEmbedding(faceId, embedding) {
  const id = normalizarId(faceId, 'Face');
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw criarErro('Embedding invalido.');
  }
  const result = await db.query(
    `UPDATE usuarios_faces
     SET embedding = $2,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, usuario_id, content_type, atualizado_em, (embedding IS NOT NULL) AS tem_embedding`,
    [id, embedding.map(Number)]
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
```

- [ ] **Step 3: Verify syntax**

Run:

```powershell
node -c backend/src/services/faceRecognitionService.js
node -c backend/src/services/usuarioFaceService.js
```

Expected: no output and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/faceRecognitionService.js backend/src/services/usuarioFaceService.js
git commit -m "feat: add backend face recognition services"
```

---

