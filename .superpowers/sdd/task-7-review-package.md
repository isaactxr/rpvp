# Review Package: Task 7

## Commits
327765c feat: add face embedding reprocess script

## Stat
 backend/package.json                       |  3 +-
 backend/scripts/reprocessFaceEmbeddings.js | 50 ++++++++++++++++++++++++++++++
 2 files changed, 52 insertions(+), 1 deletion(-)

## Diff
diff --git a/backend/package.json b/backend/package.json
index 0361d32..9d52689 100644
--- a/backend/package.json
+++ b/backend/package.json
@@ -1,19 +1,20 @@
 {
   "name": "presenca-backend",
   "version": "1.0.0",
   "description": "Backend de registro de presença por reconhecimento facial com CompreFace",
   "main": "server.js",
   "scripts": {
     "start": "node server.js",
     "dev": "nodemon server.js",
-    "migrate": "node scripts/runMigrations.js"
+    "migrate": "node scripts/runMigrations.js",
+    "faces:reprocess": "node scripts/reprocessFaceEmbeddings.js"
   },
   "dependencies": {
     "axios": "^1.7.2",
     "cors": "^2.8.5",
     "dotenv": "^16.4.5",
     "express-rate-limit": "^7.5.0",
     "exceljs": "^4.4.0",
     "express": "^4.19.2",
     "form-data": "^4.0.0",
     "helmet": "^8.1.0",
diff --git a/backend/scripts/reprocessFaceEmbeddings.js b/backend/scripts/reprocessFaceEmbeddings.js
new file mode 100644
index 0000000..6419dc5
--- /dev/null
+++ b/backend/scripts/reprocessFaceEmbeddings.js
@@ -0,0 +1,50 @@
+'use strict';
+
+const db = require('../src/config/database');
+const faceRecognitionService = require('../src/services/faceRecognitionService');
+const usuarioFaceService = require('../src/services/usuarioFaceService');
+
+async function main() {
+  const result = await db.query(
+    `SELECT id, usuario_id, face, content_type
+     FROM usuarios_faces
+     WHERE embedding IS NULL
+     ORDER BY usuario_id ASC, id ASC`
+  );
+
+  let ok = 0;
+  let failed = 0;
+
+  for (const row of result.rows) {
+    try {
+      const encoded = await faceRecognitionService.encodeImage({
+        buffer: row.face,
+        mimetype: row.content_type || 'image/jpeg',
+        originalname: `face-${row.id}.jpg`,
+      });
+      await usuarioFaceService.atualizarEmbedding(row.id, encoded.embedding);
+      ok += 1;
+      console.log(`[faces] embedding atualizado :: face=${row.id} usuario=${row.usuario_id}`);
+    } catch (err) {
+      failed += 1;
+      console.error(`[faces] falha ao processar face=${row.id} usuario=${row.usuario_id}: ${err.message}`);
+    }
+  }
+
+  console.log(`[faces] concluido :: total=${result.rows.length} ok=${ok} falhas=${failed}`);
+  await db.pool.end();
+
+  if (failed > 0) {
+    process.exitCode = 1;
+  }
+}
+
+main().catch(async (err) => {
+  console.error(`[faces] erro fatal: ${err.message}`);
+  try {
+    await db.pool.end();
+  } catch (_) {
+    // ignora erro no encerramento do pool
+  }
+  process.exit(1);
+});
