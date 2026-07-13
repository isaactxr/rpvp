# CompreFace to Face Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CompreFace with an internal `face-recognition` service while storing migrated user face photos and embeddings in the RPVP database.

**Architecture:** Keep Node/Express as the business-rule API and add a private Python/FastAPI container for face encoding and comparison. Store face photos and generated embeddings in a single RPVP table, `usuarios_faces`, and remove all runtime dependencies on CompreFace after migration.

**Tech Stack:** Node.js 20, Express, PostgreSQL, Docker Compose, Python, FastAPI, Uvicorn, `face_recognition`, dlib.

## Global Constraints

- Use table name `usuarios_faces`.
- Use columns `id`, `usuario_id`, `face`, `embedding`, `content_type`, `atualizado_em`.
- Do not add an `origem` column.
- New container name is `face-recognition`.
- Initial recognition engine is `face_recognition`.
- A user may have multiple face photos.
- The user prepares/imports initial `usuario_id` + `face` rows; the application reprocesses embeddings afterward.
- Remove `COMPREFACE_*` runtime variables after the new engine is wired.
- Do not reuse CompreFace embeddings as final embeddings.

---

## File Structure

- Create `face-recognition/app.py`: FastAPI service exposing `/health`, `/encode`, and `/recognize`.
- Create `face-recognition/requirements.txt`: Python dependencies for FastAPI and `face_recognition`.
- Create `face-recognition/Dockerfile`: Linux container with native build/runtime dependencies for dlib.
- Modify `docker-compose.yml`: add `face-recognition`, point backend to it, remove `COMPREFACE_*`.
- Modify `.env.example`: replace `COMPREFACE_*` with `FACE_RECOGNITION_*`.
- Modify `db/init.sql`: create `usuarios_faces` table and indexes.
- Modify `backend/src/config/env.js`: validate and export `FACE_RECOGNITION_*`.
- Create `backend/src/services/faceRecognitionService.js`: Node client for the Python service.
- Create `backend/src/services/usuarioFaceService.js`: DB operations for `usuarios_faces`.
- Modify `backend/src/controllers/reconhecerController.js`: use local face service for recognize and face collection operations.
- Modify `backend/src/routes/reconhecer.js`: replace CompreFace image route with neutral face image route.
- Delete or stop requiring `backend/src/services/compreFaceService.js`: no active code may import it.
- Add `backend/scripts/reprocessFaceEmbeddings.js`: fill missing embeddings after imported inserts.
- Modify `frontend/pages/usuarios.html`: remove CompreFace copy.
- Modify `frontend/scripts/usuarios.js`: update copy, response fields, and image URLs.
- Modify `README.md` and `docs/*.md`: remove active CompreFace dependency and document the new service.

---

### Task 1: Add `usuarios_faces` Schema

**Files:**
- Modify: `db/init.sql`
- Modify: `backend/server.js`

**Interfaces:**
- Produces table `usuarios_faces(id, usuario_id, face, embedding, content_type, atualizado_em)`.
- Later tasks rely on `usuarios_faces.embedding` as `DOUBLE PRECISION[]`.

- [ ] **Step 1: Add the table to `db/init.sql` after the `usuarios` table definition**

Add:

```sql
CREATE TABLE public.usuarios_faces (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    face bytea NOT NULL,
    embedding double precision[],
    content_type character varying(100) DEFAULT 'image/jpeg'::character varying NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.usuarios_faces OWNER TO vianapeixoto;

CREATE SEQUENCE public.usuarios_faces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.usuarios_faces_id_seq OWNER TO vianapeixoto;
ALTER SEQUENCE public.usuarios_faces_id_seq OWNED BY public.usuarios_faces.id;
ALTER TABLE ONLY public.usuarios_faces ALTER COLUMN id SET DEFAULT nextval('public.usuarios_faces_id_seq'::regclass);

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_pkey PRIMARY KEY (id);

CREATE INDEX idx_usuarios_faces_usuario_id ON public.usuarios_faces USING btree (usuario_id);
CREATE INDEX idx_usuarios_faces_embedding_not_null ON public.usuarios_faces USING btree (usuario_id) WHERE (embedding IS NOT NULL);

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Add startup migration in `backend/server.js`**

Inside `iniciar()`, after user/table compatibility migrations, add:

```js
    console.log('[server] Garantindo estrutura de faces de usuarios...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS usuarios_faces (
         id SERIAL PRIMARY KEY,
         usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
         face BYTEA NOT NULL,
         embedding DOUBLE PRECISION[],
         content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
         atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_usuario_id
       ON usuarios_faces (usuario_id)`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_embedding_not_null
       ON usuarios_faces (usuario_id)
       WHERE embedding IS NOT NULL`
    );
```

- [ ] **Step 3: Verify SQL syntax**

Run:

```powershell
rg -n "usuarios_faces" db/init.sql backend/server.js
```

Expected: matches in both files.

- [ ] **Step 4: Commit**

```bash
git add db/init.sql backend/server.js
git commit -m "feat: add user face storage table"
```

---

### Task 2: Add Python `face-recognition` Service

**Files:**
- Create: `face-recognition/app.py`
- Create: `face-recognition/requirements.txt`
- Create: `face-recognition/Dockerfile`

**Interfaces:**
- Produces `GET /health`.
- Produces `POST /encode` returning `{ success, faceFound, embedding, dimensions }`.
- Produces `POST /recognize` accepting multipart field `file` and JSON field `candidates`.

- [ ] **Step 1: Create `face-recognition/requirements.txt`**

```txt
fastapi==0.116.1
uvicorn[standard]==0.35.0
python-multipart==0.0.20
numpy==2.2.6
face_recognition==1.3.0
Pillow==11.3.0
```

- [ ] **Step 2: Create `face-recognition/app.py`**

```python
import io
import json
from typing import Any, List

import face_recognition
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="RPVP Face Recognition")


class Candidate(BaseModel):
    usuarioId: int
    faceId: int
    embedding: List[float]


def _load_rgb_image(raw: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Imagem invalida.") from exc
    return np.array(image)


def _single_encoding(raw: bytes) -> list[float]:
    image = _load_rgb_image(raw)
    locations = face_recognition.face_locations(image, model="hog")

    if len(locations) == 0:
        raise HTTPException(status_code=422, detail="Nenhuma face encontrada na imagem.")

    if len(locations) > 1:
        raise HTTPException(status_code=422, detail="Mais de uma face encontrada na imagem.")

    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    if not encodings:
        raise HTTPException(status_code=422, detail="Nao foi possivel gerar embedding facial.")

    return [float(value) for value in encodings[0]]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "engine": "face_recognition"}


@app.post("/encode")
async def encode(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    embedding = _single_encoding(raw)
    return {
        "success": True,
        "faceFound": True,
        "embedding": embedding,
        "dimensions": len(embedding),
    }


@app.post("/recognize")
async def recognize(
    file: UploadFile = File(...),
    candidates: str = Form(...),
    tolerance: float = Form(0.6),
) -> dict[str, Any]:
    raw = await file.read()
    unknown = np.array(_single_encoding(raw), dtype=np.float64)

    try:
        parsed = json.loads(candidates)
        candidate_models = [Candidate(**item) for item in parsed]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Lista de candidatos invalida.") from exc

    if not candidate_models:
        return {
            "success": True,
            "faceFound": True,
            "recognized": False,
            "message": "Nenhum candidato cadastrado.",
        }

    known = np.array([item.embedding for item in candidate_models], dtype=np.float64)
    distances = face_recognition.face_distance(known, unknown)
    best_index = int(np.argmin(distances))
    best_distance = float(distances[best_index])
    best = candidate_models[best_index]

    if best_distance > tolerance:
        return {
            "success": True,
            "faceFound": True,
            "recognized": False,
            "distance": best_distance,
        }

    return {
        "success": True,
        "faceFound": True,
        "recognized": True,
        "usuarioId": best.usuarioId,
        "faceId": best.faceId,
        "distance": best_distance,
    }
```

- [ ] **Step 3: Create `face-recognition/Dockerfile`**

```dockerfile
FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      cmake \
      libboost-all-dev \
      libopenblas-dev \
      liblapack-dev \
      libx11-6 \
      libglib2.0-0 \
      libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: Build the service image**

Run:

```powershell
docker build -t rpvp-face-recognition ./face-recognition
```

Expected: image builds successfully.

- [ ] **Step 5: Commit**

```bash
git add face-recognition
git commit -m "feat: add face recognition service"
```

---

### Task 3: Wire Docker and Environment Configuration

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `backend/src/config/env.js`

**Interfaces:**
- Produces config keys `FACE_RECOGNITION_URL`, `FACE_RECOGNITION_THRESHOLD`, `FACE_RECOGNITION_TIMEOUT_MS`.
- Removes required `COMPREFACE_*` config.

- [ ] **Step 1: Update `.env.example`**

Replace the CompreFace block with:

```env
# --- Face Recognition (interno) ---------------------------------
FACE_RECOGNITION_URL=http://face-recognition:8000
FACE_RECOGNITION_THRESHOLD=0.6
FACE_RECOGNITION_TIMEOUT_MS=15000
```

- [ ] **Step 2: Update `docker-compose.yml`**

Add service:

```yaml
  face-recognition:
    build:
      context: ./face-recognition
      dockerfile: Dockerfile
    container_name: rpvp-face-recognition
    restart: unless-stopped
    environment:
      PYTHONUNBUFFERED: "1"
    expose:
      - "8000"
```

In `backend.depends_on`, add:

```yaml
      face-recognition:
        condition: service_started
```

In `backend.environment`, remove `COMPREFACE_*` entries and add:

```yaml
      FACE_RECOGNITION_URL: ${FACE_RECOGNITION_URL:-http://face-recognition:8000}
      FACE_RECOGNITION_THRESHOLD: ${FACE_RECOGNITION_THRESHOLD:-0.6}
      FACE_RECOGNITION_TIMEOUT_MS: ${FACE_RECOGNITION_TIMEOUT_MS:-15000}
```

- [ ] **Step 3: Update `backend/src/config/env.js` required variables**

Remove these from `REQUIRED`:

```js
  'COMPREFACE_URL',
  'COMPREFACE_API_KEY',
```

Add:

```js
  'FACE_RECOGNITION_URL',
```

Replace CompreFace exports with:

```js
  // Face Recognition
  FACE_RECOGNITION_URL: process.env.FACE_RECOGNITION_URL,
  FACE_RECOGNITION_THRESHOLD: parseFloat(process.env.FACE_RECOGNITION_THRESHOLD) || 0.6,
  FACE_RECOGNITION_TIMEOUT_MS: parseInt(process.env.FACE_RECOGNITION_TIMEOUT_MS, 10) || 15000,
```

- [ ] **Step 4: Update startup logs in `backend/server.js`**

Replace:

```js
      console.log(`[server] ✓ CompreFace: ${config.COMPREFACE_URL}`);
      console.log(`[server] ✓ Threshold de similaridade: ${config.SIMILARITY_THRESHOLD}`);
```

With:

```js
      console.log(`[server] ✓ Face Recognition: ${config.FACE_RECOGNITION_URL}`);
      console.log(`[server] ✓ Threshold facial: ${config.FACE_RECOGNITION_THRESHOLD}`);
```

- [ ] **Step 5: Verify no config references remain**

Run:

```powershell
rg -n "COMPREFACE_|COMPREFACE_URL|SIMILARITY_THRESHOLD" backend docker-compose.yml .env.example
```

Expected: no active backend/config matches.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example backend/src/config/env.js backend/server.js
git commit -m "feat: configure local face recognition service"
```

---

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

### Task 5: Replace Recognition Flow in Controller

**Files:**
- Modify: `backend/src/controllers/reconhecerController.js`
- Modify: `backend/src/routes/reconhecer.js`

**Interfaces:**
- Consumes `faceRecognitionService.recognizeImage`.
- Consumes `usuarioFaceService.listarCandidatosReconhecimento`.
- Keeps `POST /reconhecer` response shape compatible with frontend.

- [ ] **Step 1: Replace imports in `reconhecerController.js`**

Replace:

```js
const compreFaceService = require('../services/compreFaceService');
```

With:

```js
const faceRecognitionService = require('../services/faceRecognitionService');
const usuarioFaceService = require('../services/usuarioFaceService');
```

- [ ] **Step 2: Replace CompreFace call inside `reconhecer`**

Replace the block that calls `compreFaceService.reconhecer(...)` and validates `subject` with:

```js
  let resultado;
  try {
    const candidates = await usuarioFaceService.listarCandidatosReconhecimento();
    resultado = await faceRecognitionService.recognizeImage({
      buffer,
      mimetype,
      originalname,
      candidates,
    });
  } catch (err) {
    console.error(`[reconhecer] Erro ao consultar motor facial: ${err.message}`);
    return res.status(err.statusCode === 422 ? 422 : 502).json({
      success: false,
      reconhecido: false,
      message: err.statusCode === 422
        ? err.message
        : 'Servico de reconhecimento indisponivel. Tente novamente.',
    });
  }

  if (!resultado.reconhecido || !resultado.usuarioId) {
    return res.status(200).json({
      success: false,
      reconhecido: false,
      message: 'Nao reconhecido',
    });
  }

  const usuarioReconhecido = await usuarioService.obterUsuarioPorId(resultado.usuarioId);
  const subject = usuarioReconhecido.subject_compreface || usuarioReconhecido.nome_completo;
  const similarity = resultado.distance === null ? null : Math.max(0, 1 - resultado.distance);
```

- [ ] **Step 3: Keep `presencaService.registrarBatidaFacial` working**

Leave the later call as:

```js
    const registro = await presencaService.registrarBatidaFacial({
      subject,
      similarity,
      imagemAuditada,
      sessaoId,
      tipoRegistro,
    });
```

This preserves current presence logic while recognition now resolves the user locally.

- [ ] **Step 4: Update log and comments**

Change references in this function from "CompreFace" to "motor facial".

- [ ] **Step 5: Verify no import remains**

Run:

```powershell
rg -n "compreFaceService|CompreFace" backend/src/controllers/reconhecerController.js
```

Expected: no active CompreFace service import or recognition-flow comment remains.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/reconhecerController.js backend/src/routes/reconhecer.js
git commit -m "feat: use local face recognition for presence"
```

---

### Task 6: Replace Face Collection Endpoints

**Files:**
- Modify: `backend/src/controllers/reconhecerController.js`
- Modify: `backend/src/routes/reconhecer.js`

**Interfaces:**
- Keeps `GET /usuarios/:id/face-collection`.
- Keeps `POST /usuarios/:id/face-collection/fotos`.
- Keeps `DELETE /usuarios/:id/face-collection/:imageId`, but `imageId` now means `usuarios_faces.id`.
- Replaces `/compreface/faces/:imageId/img` with `/faces/:faceId/img`.

- [ ] **Step 1: Replace `listarColecaoFacialUsuario`**

Use:

```js
async function listarColecaoFacialUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const faces = await usuarioFaceService.listarFacesUsuario(usuario.id);

    res.json({
      success: true,
      subject: usuario.subject_compreface || usuario.nome_completo,
      data: faces.map((face) => ({
        id: face.id,
        image_id: String(face.id),
        usuario_id: face.usuario_id,
        content_type: face.content_type,
        atualizado_em: face.atualizado_em,
        tem_embedding: Boolean(face.tem_embedding),
        foto_url: `/faces/${encodeURIComponent(face.id)}/img`,
      })),
      pagination: {
        pageNumber: 0,
        pageSize: faces.length,
        totalPages: faces.length > 0 ? 1 : 0,
        totalElements: faces.length,
      },
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar colecao facial do usuario.');
  }
}
```

- [ ] **Step 2: Replace `adicionarFotosColecaoUsuario`**

Use:

```js
async function adicionarFotosColecaoUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const arquivos = Array.isArray(req.files) ? req.files : [];

    if (arquivos.length === 0) {
      const err = new Error('Envie ao menos uma foto.');
      err.statusCode = 400;
      throw err;
    }

    const imagens = [];
    for (const arquivo of arquivos) {
      imagens.push(await usuarioFaceService.criarFaceUsuario(usuario.id, arquivo));
    }

    res.status(201).json({
      success: true,
      subject: usuario.subject_compreface || usuario.nome_completo,
      total: imagens.length,
      data: imagens,
      message: `${imagens.length} foto(s) cadastrada(s).`,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao adicionar fotos na colecao facial.');
  }
}
```

- [ ] **Step 3: Replace delete/list image handlers**

Use:

```js
async function deletarFaceColecaoUsuario(req, res) {
  try {
    const resultado = await usuarioFaceService.removerFaceUsuario(req.params.imageId, req.params.id);
    res.json({ success: true, data: resultado, message: 'Face removida.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao remover face da colecao facial.');
  }
}

async function limparColecaoFacialUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const faces = await usuarioFaceService.listarFacesUsuario(usuario.id);
    for (const face of faces) {
      await usuarioFaceService.removerFaceUsuario(face.id, usuario.id);
    }
    res.json({ success: true, deleted: faces.length, message: 'Colecao facial removida.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao limpar colecao facial do usuario.');
  }
}

async function baixarImagemFace(req, res) {
  try {
    const imagem = await usuarioFaceService.obterImagemFace(req.params.faceId);
    res.setHeader('Content-Type', imagem.content_type || 'image/jpeg');
    res.send(imagem.face);
  } catch (err) {
    responderErro(res, err, 'Erro ao baixar imagem facial.');
  }
}
```

- [ ] **Step 4: Update exports**

Replace `baixarImagemFaceCompreface` with `baixarImagemFace` in `module.exports`.

- [ ] **Step 5: Update route**

In `backend/src/routes/reconhecer.js`, replace:

```js
router.get('/compreface/faces/:imageId/img', autorizar(['admin']), controller.baixarImagemFaceCompreface);
```

With:

```js
router.get('/faces/:faceId/img', autorizar(['admin']), controller.baixarImagemFace);
```

- [ ] **Step 6: Verify syntax**

Run:

```powershell
node -c backend/src/controllers/reconhecerController.js
node -c backend/src/routes/reconhecer.js
```

Expected: no syntax errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/reconhecerController.js backend/src/routes/reconhecer.js
git commit -m "feat: store user face collection locally"
```

---

### Task 7: Add Embedding Reprocess Script

**Files:**
- Create: `backend/scripts/reprocessFaceEmbeddings.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces npm script `npm run faces:reprocess`.
- Fills `usuarios_faces.embedding` for rows where embedding is null.

- [ ] **Step 1: Create `backend/scripts/reprocessFaceEmbeddings.js`**

```js
'use strict';

const db = require('../src/config/database');
const faceRecognitionService = require('../src/services/faceRecognitionService');
const usuarioFaceService = require('../src/services/usuarioFaceService');

async function main() {
  const result = await db.query(
    `SELECT id, usuario_id, face, content_type
     FROM usuarios_faces
     WHERE embedding IS NULL
     ORDER BY usuario_id ASC, id ASC`
  );

  let ok = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      const encoded = await faceRecognitionService.encodeImage({
        buffer: row.face,
        mimetype: row.content_type || 'image/jpeg',
        originalname: `face-${row.id}.jpg`,
      });
      await usuarioFaceService.atualizarEmbedding(row.id, encoded.embedding);
      ok += 1;
      console.log(`[faces] embedding atualizado :: face=${row.id} usuario=${row.usuario_id}`);
    } catch (err) {
      failed += 1;
      console.error(`[faces] falha ao processar face=${row.id} usuario=${row.usuario_id}: ${err.message}`);
    }
  }

  console.log(`[faces] concluido :: total=${result.rows.length} ok=${ok} falhas=${failed}`);
  await db.pool.end();

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(`[faces] erro fatal: ${err.message}`);
  try {
    await db.pool.end();
  } catch (_) {
    // ignora erro no encerramento do pool
  }
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `backend/package.json` scripts, add:

```json
"faces:reprocess": "node scripts/reprocessFaceEmbeddings.js"
```

- [ ] **Step 3: Verify syntax**

Run:

```powershell
node -c backend/scripts/reprocessFaceEmbeddings.js
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/reprocessFaceEmbeddings.js backend/package.json
git commit -m "feat: add face embedding reprocess script"
```

---

### Task 8: Update User Management Frontend Copy and URLs

**Files:**
- Modify: `frontend/pages/usuarios.html`
- Modify: `frontend/scripts/usuarios.js`

**Interfaces:**
- Consumes existing face collection endpoints.
- Uses `/faces/:faceId/img` for image preview.

- [ ] **Step 1: Update static copy in `frontend/pages/usuarios.html`**

Replace visible "CompreFace" text with "Biometria facial" or "colecao facial". For example:

```html
<span class="eyebrow">Biometria facial</span>
```

And:

```html
<span id="usuariosStatus" class="muted-text">Selecione um usuario para gerenciar a colecao facial.</span>
```

- [ ] **Step 2: Update `montarUrlImagemColecao` in `frontend/scripts/usuarios.js`**

Use:

```js
function montarUrlImagemColecao(face) {
  const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
  if (imageId) {
    return `${window.Auth.getApiBase()}/faces/${encodeURIComponent(imageId)}/img`;
  }

  return String(face?.foto_url || '').trim() || null;
}
```

- [ ] **Step 3: Replace user-facing CompreFace messages**

Replace messages with these equivalents:

```js
colecaoStatusEl.textContent = 'Carregando faces cadastradas...';
colecaoStatusEl.textContent = `${state.colecaoFaces.length} face(s) cadastrada(s).`;
colecaoStatusEl.textContent = 'Enviando fotos...';
colecaoStatusEl.textContent = json?.message || 'Fotos cadastradas.';
```

Replace confirmation text:

```js
const confirmou = window.confirm('Remover esta face da colecao facial?');
```

And:

```js
const confirmou = window.confirm(`Remover todas as faces de ${state.colecaoUsuario.nome_completo}?`);
```

- [ ] **Step 4: Replace create-user response handling**

Where code reads `json?.compreface?.fotosEnviadas`, change to support the new response:

```js
const totalFotos = Number(json?.faceRecognition?.fotosEnviadas || json?.totalFotos || 0);
```

- [ ] **Step 5: Verify no UI CompreFace text remains**

Run:

```powershell
rg -n "CompreFace|compreface" frontend/pages/usuarios.html frontend/scripts/usuarios.js
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add frontend/pages/usuarios.html frontend/scripts/usuarios.js
git commit -m "feat: update face collection UI"
```

---

### Task 9: Remove Remaining CompreFace Code and Docs

**Files:**
- Delete: `backend/src/services/compreFaceService.js`
- Modify: `backend/src/middleware/upload.js`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/documentacao-tecnica.md`
- Modify: `docs/manual-tecnico-completo.md`
- Modify: `docs/manual-nao-tecnico.md`

**Interfaces:**
- No active code imports `compreFaceService`.
- Docs describe `face-recognition`.

- [ ] **Step 1: Delete unused service**

Run:

```powershell
Remove-Item backend/src/services/compreFaceService.js
```

- [ ] **Step 2: Update `backend/src/middleware/upload.js` comments**

Replace "CompreFace" with "motor facial" in comments.

- [ ] **Step 3: Update package metadata**

In `backend/package.json`, change description to:

```json
"description": "Backend de registro de presenca por reconhecimento facial"
```

- [ ] **Step 4: Update README stack**

Use:

```md
- Reconhecimento: servico interno `face-recognition` + MediaPipe Face Mesh (deteccao local no cliente)
```

Replace CompreFace env block with:

```env
# Face Recognition
FACE_RECOGNITION_URL=http://face-recognition:8000
FACE_RECOGNITION_THRESHOLD=0.6
FACE_RECOGNITION_TIMEOUT_MS=15000
```

- [ ] **Step 5: Update docs**

Replace active CompreFace references with:

```md
O reconhecimento facial e feito por um servico interno `face-recognition`, acessado apenas pelo backend na rede Docker.
```

For historical migration references, use:

```md
As fotos legadas foram migradas do CompreFace para a tabela `usuarios_faces`.
```

- [ ] **Step 6: Verify no active CompreFace references remain**

Run:

```powershell
rg -n "CompreFace|compreface|COMPREFACE" .
```

Expected: only historical migration spec/plan references remain under `docs/superpowers`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove compreface references"
```

---

### Task 10: End-to-End Verification

**Files:**
- No required source edits unless verification reveals defects.

**Interfaces:**
- Verifies Docker startup, health endpoints, backend syntax, and frontend static loading.

- [ ] **Step 1: Install/build dependencies**

Run:

```powershell
docker compose build
```

Expected: all images build, including `rpvp-face-recognition`.

- [ ] **Step 2: Start services**

Run:

```powershell
docker compose up -d postgres face-recognition backend frontend
```

Expected: containers start successfully.

- [ ] **Step 3: Verify face service health**

Run:

```powershell
docker compose exec face-recognition python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

Expected includes:

```json
{"success":true,"engine":"face_recognition"}
```

- [ ] **Step 4: Verify backend health**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/health
```

Expected: JSON containing `"status":"ok"`.

- [ ] **Step 5: Reprocess imported embeddings**

After user imports `usuarios_faces(usuario_id, face, content_type, atualizado_em)` rows, run:

```powershell
docker compose exec backend npm run faces:reprocess
```

Expected: summary line like:

```text
[faces] concluido :: total=10 ok=10 falhas=0
```

- [ ] **Step 6: Verify no missing embeddings for valid imported faces**

Run in Postgres:

```sql
SELECT COUNT(*) AS sem_embedding
FROM usuarios_faces
WHERE embedding IS NULL;
```

Expected: `0` for all valid face photos; invalid photos must be reviewed manually.

- [ ] **Step 7: Verify UI manually**

Open:

```text
http://localhost:8080/pages/usuarios.html
```

Expected:

- Login works.
- User face collection loads.
- Existing imported photos display.
- New photo upload works.
- Face delete works.

- [ ] **Step 8: Verify recognition manually**

Open:

```text
http://localhost:8080/pages/sessao.html
```

Expected:

- Camera starts.
- Blink capture sends image.
- Backend recognizes a migrated user.
- Presence is registered in the selected session.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize face recognition migration"
```

If no fixes were needed, do not create an empty commit.

