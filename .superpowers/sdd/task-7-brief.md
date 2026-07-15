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

