# Review Package: Task 5

## Commits
626bb47 chore: untrack task coordination report
37eed21 feat: use local face recognition for presence

## Stat
 backend/src/controllers/reconhecerController.js | 42 +++++++++++--------------
 1 file changed, 19 insertions(+), 23 deletions(-)

## Diff
diff --git a/backend/src/controllers/reconhecerController.js b/backend/src/controllers/reconhecerController.js
index a802a2f..00fff09 100644
--- a/backend/src/controllers/reconhecerController.js
+++ b/backend/src/controllers/reconhecerController.js
@@ -1,19 +1,21 @@
 'use strict';
 
 /**
  * Controller principal da aplicação.
  *
  * Concentra os handlers HTTP ligados a autenticação, reconhecimento facial, auditoria,
  * sessões e usuários, delegando as regras de negócio para a camada de serviços.
  */
 const compreFaceService = require('../services/compreFaceService');
+const faceRecognitionService = require('../services/faceRecognitionService');
+const usuarioFaceService = require('../services/usuarioFaceService');
 const presencaService = require('../services/presencaService');
 const auditImageService = require('../services/auditImageService');
 const sessaoService = require('../services/sessaoService');
 const sessaoExportService = require('../services/sessaoExportService');
 const usuarioService = require('../services/usuarioService');
 const authService = require('../services/authService');
 const auditoriaService = require('../services/auditoriaService');
 const auditoriaExportService = require('../services/auditoriaExportService');
 
 function responderErro(res, err, fallback) {
@@ -85,21 +87,21 @@ async function alterarMinhaSenhaPrimeiroAcesso(req, res) {
       data: usuario,
     });
   } catch (err) {
     responderErro(res, err, 'Erro ao alterar senha no primeiro acesso.');
   }
 }
 
 /**
  * Endpoint central do reconhecimento facial.
  *
- * Recebe a imagem enviada pelo navegador, consulta o CompreFace, tenta gerar a imagem auditada
+ * Recebe a imagem enviada pelo navegador, consulta o motor facial, tenta gerar a imagem auditada
  * e delega ao `presencaService` a decisão final de check-in/check-out.
  */
 async function reconhecer(req, res) {
   if (!req.file) {
     return res.status(400).json({
       success: false,
       reconhecido: false,
       message: 'Nenhuma imagem recebida. Envie o campo "file" como multipart/form-data.',
     });
   }
@@ -116,55 +118,49 @@ async function reconhecer(req, res) {
     });
   }
 
   console.log(
     `[reconhecer] Imagem recebida :: ${originalname ?? 'face.jpg'} | ` +
     `${mimetype} | ${(buffer.length / 1024).toFixed(1)} KB | tipo=${tipoRegistro}`
   );
 
   let resultado;
   try {
-    resultado = await compreFaceService.reconhecer(buffer, mimetype, originalname);
-  } catch (err) {
-    console.error(`[reconhecer] Erro ao consultar CompreFace: ${err.message}`);
-    return res.status(502).json({
-      success: false,
-      reconhecido: false,
-      message: 'Serviço de reconhecimento indisponível. Tente novamente.',
+    const candidates = await usuarioFaceService.listarCandidatosReconhecimento();
+    resultado = await faceRecognitionService.recognizeImage({
+      buffer,
+      mimetype,
+      originalname,
+      candidates,
     });
-  }
-
-  const { rostoEncontrado, reconhecido, subject, similarity } = resultado;
-
-  if (!rostoEncontrado) {
-    return res.status(422).json({
+  } catch (err) {
+    console.error(`[reconhecer] Erro ao consultar motor facial: ${err.message}`);
+    return res.status(err.statusCode === 422 ? 422 : 502).json({
       success: false,
       reconhecido: false,
-      message: 'Nenhum rosto detectado na imagem.',
+      message: err.statusCode === 422
+        ? err.message
+        : 'Serviço de reconhecimento indisponível. Tente novamente.',
     });
   }
 
-  if (!reconhecido) {
+  if (!resultado.reconhecido || !resultado.usuarioId) {
     return res.status(200).json({
       success: false,
       reconhecido: false,
       message: 'Não reconhecido',
     });
   }
 
-  if (!subject) {
-    return res.status(502).json({
-      success: false,
-      reconhecido: false,
-      message: 'Resposta inválida do serviço de reconhecimento.',
-    });
-  }
+  const usuarioReconhecido = await usuarioService.obterUsuarioPorId(resultado.usuarioId);
+  const subject = usuarioReconhecido.subject_compreface || usuarioReconhecido.nome_completo;
+  const similarity = resultado.distance === null ? null : Math.max(0, 1 - resultado.distance);
 
   let imagemAuditada = null;
   let avisoImagemAuditoria = null;
   let tipoSessaoWatermark = 'SESSAO';
 
   try {
     const sessao = await sessaoService.obterSessaoPorId(sessaoId);
     tipoSessaoWatermark = String(sessao?.tipo_sessao || sessao?.nome || 'SESSAO').trim() || 'SESSAO';
   } catch (err) {
     console.warn(`[reconhecer] Falha ao buscar tipo da sessão para watermark: ${err.message}`);
