# Review Package: Task 6

## Commits
33e1859 chore: untrack task 6 coordination report
92cba65 fix: preserve local face collection compatibility
52f57a8 feat: store user face collection locally

## Stat
 backend/src/controllers/reconhecerController.js | 109 +++++++++---------------
 backend/src/routes/reconhecer.js                |   2 +-
 frontend/scripts/usuarios.js                    |   9 +-
 3 files changed, 46 insertions(+), 74 deletions(-)

## Diff
diff --git a/backend/src/controllers/reconhecerController.js b/backend/src/controllers/reconhecerController.js
index 00fff09..49eb70d 100644
--- a/backend/src/controllers/reconhecerController.js
+++ b/backend/src/controllers/reconhecerController.js
@@ -1,19 +1,18 @@
 'use strict';
 
 /**
  * Controller principal da aplicação.
  *
  * Concentra os handlers HTTP ligados a autenticação, reconhecimento facial, auditoria,
  * sessões e usuários, delegando as regras de negócio para a camada de serviços.
  */
-const compreFaceService = require('../services/compreFaceService');
 const faceRecognitionService = require('../services/faceRecognitionService');
 const usuarioFaceService = require('../services/usuarioFaceService');
 const presencaService = require('../services/presencaService');
 const auditImageService = require('../services/auditImageService');
 const sessaoService = require('../services/sessaoService');
 const sessaoExportService = require('../services/sessaoExportService');
 const usuarioService = require('../services/usuarioService');
 const authService = require('../services/authService');
 const auditoriaService = require('../services/auditoriaService');
 const auditoriaExportService = require('../services/auditoriaExportService');
@@ -509,68 +508,49 @@ async function listarUsuarios(req, res) {
     }
 
     const lista = await usuarioService.listarUsuarios(filtros);
     res.json({ data: lista, total: lista.length, perfis: usuarioService.PERFIS_ACESSO });
   } catch (err) {
     responderErro(res, err, 'Erro ao listar usuários.');
   }
 }
 
 /**
- * Cria um usuário no banco e, quando houver arquivos anexados, envia as fotos para a coleção facial do CompreFace.
+ * Cria um usuário no banco e persiste as fotos anexadas na coleção facial local.
  */
 async function criarUsuario(req, res) {
   try {
     const usuario = await usuarioService.criarUsuario(req.body || {});
     const arquivos = Array.isArray(req.files) ? req.files : [];
-    const subject = String(usuario.subject_compreface || '').trim();
-
-    let compreface = null;
-    if (subject) {
-      await compreFaceService.garantirSubject(subject);
-
-      const uploads = [];
-      for (const arquivo of arquivos) {
-        const enviado = await compreFaceService.enviarFaceParaSubject(subject, arquivo);
-        uploads.push(enviado);
-      }
-
-      compreface = {
-        subject,
-        fotosEnviadas: uploads.length,
-        imagens: uploads,
-      };
+    const faces = [];
+    for (const arquivo of arquivos) {
+      faces.push(await usuarioFaceService.criarFaceUsuario(usuario.id, arquivo));
     }
 
     res.status(201).json({
       success: true,
       data: usuario,
-      compreface,
+      faces,
       message: arquivos.length > 0
-        ? 'Usuário criado e fotos enviadas para o CompreFace.'
+        ? 'Usuário criado e fotos cadastradas.'
         : 'Usuário criado com sucesso.',
     });
   } catch (err) {
     responderErro(res, err, 'Erro ao criar usuário.');
   }
 }
 
 async function atualizarUsuario(req, res) {
   try {
     const usuarioId = Number(req.params.id);
-    const atual = await usuarioService.obterUsuarioPorId(usuarioId);
     const usuario = await usuarioService.atualizarUsuario(usuarioId, req.body || {});
 
-    if (atual.subject_compreface && usuario.subject_compreface && atual.subject_compreface !== usuario.subject_compreface) {
-      await compreFaceService.renomearSubject(atual.subject_compreface, usuario.subject_compreface);
-    }
-
     res.json({ success: true, data: usuario, message: 'Usuário atualizado com sucesso.' });
   } catch (err) {
     responderErro(res, err, 'Erro ao atualizar usuário.');
   }
 }
 
 async function atualizarPerfilUsuario(req, res) {
   try {
     const usuarioId = Number(req.params.id);
     const usuario = await usuarioService.atualizarPerfil(usuarioId, req.body?.perfil);
@@ -584,131 +564,118 @@ async function atualizarPerfilUsuario(req, res) {
     responderErro(res, err, 'Erro ao atualizar perfil.');
   }
 }
 
 async function desativarUsuario(req, res) {
   try {
     const usuarioId = Number(req.params.id);
     const hardDelete = String(req.query?.hard || '').toLowerCase() === 'true';
 
     if (hardDelete) {
-      const usuarioAtual = await usuarioService.obterUsuarioPorId(usuarioId);
-
-      if (usuarioAtual.subject_compreface) {
-        await compreFaceService.deletarSubject(usuarioAtual.subject_compreface).catch((err) => {
-          if (err.statusCode === 404) return null;
-          throw err;
-        });
-      }
-
       const usuario = await usuarioService.excluirUsuario(usuarioId);
-      res.json({ success: true, data: usuario, message: 'Usuário excluído definitivamente e removido do CompreFace.' });
+      res.json({ success: true, data: usuario, message: 'Usuário excluído definitivamente.' });
       return;
     }
 
     const usuario = await usuarioService.desativarUsuario(usuarioId);
     res.json({ success: true, data: usuario, message: 'Usuário desativado com sucesso.' });
   } catch (err) {
     responderErro(res, err, 'Erro ao desativar usuário.');
   }
 }
 
 async function listarColecaoFacialUsuario(req, res) {
   try {
     const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
-    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();
-
-    const resultado = await compreFaceService.listarFacesPorSubject(subject);
+    const faces = await usuarioFaceService.listarFacesUsuario(usuario.id);
 
     res.json({
       success: true,
-      subject,
-      data: resultado.faces.map((face) => {
-        const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
-        return {
-          ...face,
-          image_id: imageId || null,
-          foto_url: imageId
-            ? `/compreface/faces/${encodeURIComponent(imageId)}/img`
-            : null,
-        };
-      }),
+      subject: usuario.subject_compreface || usuario.nome_completo,
+      data: faces.map((face) => ({
+        id: face.id,
+        image_id: String(face.id),
+        usuario_id: face.usuario_id,
+        content_type: face.content_type,
+        atualizado_em: face.atualizado_em,
+        tem_embedding: Boolean(face.tem_embedding),
+        foto_url: `/faces/${encodeURIComponent(face.id)}/img`,
+      })),
       pagination: {
-        pageNumber: resultado.pageNumber,
-        pageSize: resultado.pageSize,
-        totalPages: resultado.totalPages,
-        totalElements: resultado.totalElements,
+        pageNumber: 0,
+        pageSize: faces.length,
+        totalPages: faces.length > 0 ? 1 : 0,
+        totalElements: faces.length,
       },
     });
   } catch (err) {
     responderErro(res, err, 'Erro ao listar coleção facial do usuário.');
   }
 }
 
 async function adicionarFotosColecaoUsuario(req, res) {
   try {
     const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
-    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();
     const arquivos = Array.isArray(req.files) ? req.files : [];
 
     if (arquivos.length === 0) {
       const err = new Error('Envie ao menos uma foto.');
       err.statusCode = 400;
       throw err;
     }
 
-    await compreFaceService.garantirSubject(subject);
-
     const imagens = [];
     for (const arquivo of arquivos) {
-      imagens.push(await compreFaceService.enviarFaceParaSubject(subject, arquivo));
+      imagens.push(await usuarioFaceService.criarFaceUsuario(usuario.id, arquivo));
     }
 
     res.status(201).json({
       success: true,
-      subject,
+      subject: usuario.subject_compreface || usuario.nome_completo,
       total: imagens.length,
       data: imagens,
-      message: `${imagens.length} foto(s) enviada(s) ao CompreFace.`,
+      message: `${imagens.length} foto(s) cadastrada(s).`,
     });
   } catch (err) {
     responderErro(res, err, 'Erro ao adicionar fotos na coleção facial.');
   }
 }
 
 async function deletarFaceColecaoUsuario(req, res) {
   try {
-    const resultado = await compreFaceService.deletarFacePorId(req.params.imageId);
-    res.json({ success: true, data: resultado, message: 'Face removida do CompreFace.' });
+    const resultado = await usuarioFaceService.removerFaceUsuario(req.params.imageId, req.params.id);
+    res.json({ success: true, data: resultado, message: 'Face removida.' });
   } catch (err) {
     responderErro(res, err, 'Erro ao remover face da coleção facial.');
   }
 }
 
 async function limparColecaoFacialUsuario(req, res) {
   try {
     const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
-    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();
-    const resultado = await compreFaceService.deletarFacesPorSubject(subject);
-    res.json({ success: true, subject, ...resultado, message: 'Coleção facial removida do CompreFace.' });
+    const faces = await usuarioFaceService.listarFacesUsuario(usuario.id);
+    for (const face of faces) {
+      await usuarioFaceService.removerFaceUsuario(face.id, usuario.id);
+    }
+    res.json({ success: true, deleted: faces.length, message: 'Coleção facial removida.' });
   } catch (err) {
     responderErro(res, err, 'Erro ao limpar coleção facial do usuário.');
   }
 }
 
-async function baixarImagemFaceCompreface(req, res) {
+async function baixarImagemFace(req, res) {
   try {
-    const imagem = await compreFaceService.baixarImagemFace(req.params.imageId);
-    res.setHeader('Content-Type', imagem.contentType);
-    res.send(imagem.buffer);
+    const imagem = await usuarioFaceService.obterImagemFace(req.params.faceId);
+    res.setHeader('Content-Type', imagem.content_type || 'image/jpeg');
+    res.send(imagem.face);
   } catch (err) {
-    responderErro(res, err, 'Erro ao baixar imagem da coleção facial.');
+    responderErro(res, err, 'Erro ao baixar imagem facial.');
   }
 }
 
 module.exports = {
   bootstrapAdmin,
   login,
   me,
   logout,
   alterarMinhaSenhaPrimeiroAcesso,
   reconhecer,
@@ -728,12 +695,12 @@ module.exports = {
   criarUsuario,
   atualizarUsuario,
   desativarUsuario,
   atualizarPerfilUsuario,
   exportarAuditoriaPdf,
   exportarAuditoriaExcel,
   listarColecaoFacialUsuario,
   adicionarFotosColecaoUsuario,
   deletarFaceColecaoUsuario,
   limparColecaoFacialUsuario,
-  baixarImagemFaceCompreface,
+  baixarImagemFace,
 };
diff --git a/backend/src/routes/reconhecer.js b/backend/src/routes/reconhecer.js
index 63854de..646f872 100644
--- a/backend/src/routes/reconhecer.js
+++ b/backend/src/routes/reconhecer.js
@@ -66,21 +66,21 @@ router.post(
   autorizar(['admin']),
   upload.array('fotos', 10),
   tratarErroUpload,
   controller.adicionarFotosColecaoUsuario
 );
 router.delete('/usuarios/:id/face-collection', autorizar(['admin']), controller.limparColecaoFacialUsuario);
 router.delete('/usuarios/:id/face-collection/:imageId', autorizar(['admin']), controller.deletarFaceColecaoUsuario);
 router.put('/usuarios/:id', autorizar(['admin']), controller.atualizarUsuario);
 router.patch('/usuarios/:id/perfil', autorizar(['admin']), controller.atualizarPerfilUsuario);
 router.delete('/usuarios/:id', autorizar(['admin']), controller.desativarUsuario);
-router.get('/compreface/faces/:imageId/img', autorizar(['admin']), controller.baixarImagemFaceCompreface);
+router.get('/faces/:faceId/img', autorizar(['admin']), controller.baixarImagemFace);
 
 // --- Painel Admin -------------------------------------------------------------
 router.get('/admin/configuracoes',  autorizar(['admin']), adminController.listarConfiguracoes);
 router.put('/admin/configuracoes',  autorizar(['admin']), adminController.atualizarConfiguracoes);
 
 router.get('/tipos-sessao',    autorizar(['admin', 'gestor', 'instrutor', 'colaborador']), adminController.listarTiposSessao);
 router.post('/tipos-sessao',   autorizar(['admin']), adminController.criarTipoSessao);
 router.put('/tipos-sessao/:id', autorizar(['admin']), adminController.atualizarTipoSessao);
 router.delete('/tipos-sessao/:id', autorizar(['admin']), adminController.deletarTipoSessao);
 
diff --git a/frontend/scripts/usuarios.js b/frontend/scripts/usuarios.js
index cae681c..2b8fae3 100644
--- a/frontend/scripts/usuarios.js
+++ b/frontend/scripts/usuarios.js
@@ -500,26 +500,31 @@ async function carregarImagemAutenticada(url, imgEl) {
     const objectUrl = URL.createObjectURL(blob);
     imgEl.src = objectUrl;
     imgEl.dataset.objectUrl = objectUrl;
   } catch (err) {
     console.error('[usuarios] Falha ao carregar imagem da face:', err);
     imgEl.alt = 'Falha ao carregar imagem';
   }
 }
 
 function montarUrlImagemColecao(face) {
+  const fotoUrl = String(face?.foto_url || '').trim();
+  if (fotoUrl) {
+    return fotoUrl;
+  }
+
   const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
   if (imageId) {
-    return `${window.Auth.getApiBase()}/compreface/faces/${encodeURIComponent(imageId)}/img`;
+    return `${window.Auth.getApiBase()}/faces/${encodeURIComponent(imageId)}/img`;
   }
 
-  return String(face?.foto_url || '').trim() || null;
+  return null;
 }
 
 function limparPainelColecao(mensagem) {
   state.colecaoUsuario = null;
   state.colecaoFaces = [];
   colecaoTituloEl.textContent = state.colecaoSetorAtual ? `Coleção facial • ${state.colecaoSetorAtual}` : 'Coleção facial';
   colecaoStatusEl.textContent = mensagem;
   colecaoGridEl.innerHTML = '<p class="muted-text">Nenhum usuário selecionado.</p>';
   colecaoFotosInputEl.value = '';
   atualizarContadorColecao();
