# Review Package: Task 8

## Commits
aff52eb fix: support local face create response
7a50fe7 feat: update face collection UI

## Stat
 frontend/pages/usuarios.html | 11 +++++------
 frontend/scripts/usuarios.js | 42 +++++++++++++++++++-----------------------
 2 files changed, 24 insertions(+), 29 deletions(-)

## Diff
diff --git a/frontend/pages/usuarios.html b/frontend/pages/usuarios.html
index 11680d7..9412942 100644
--- a/frontend/pages/usuarios.html
+++ b/frontend/pages/usuarios.html
@@ -1,28 +1,28 @@
 ?<!DOCTYPE html>
 <html lang="pt-BR">
 <head>
   <meta charset="UTF-8" />
   <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover" />
   <title>Usuários - Laboral</title>
   <link rel="stylesheet" href="../styles/base.css?v=20260422a" />
   <link rel="stylesheet" href="../styles/registros.css?v=20260408a" />
 </head>
-<body data-layout="internal" data-nav-key="usuarios" data-page-title="Gestão de usuários" data-page-subtitle="Cadastro, sincronização com o CompreFace e gerenciamento da coleção facial.">
+<body data-layout="internal" data-nav-key="usuarios" data-page-title="Gestão de usuários" data-page-subtitle="Cadastro, sincronização e gerenciamento da coleção facial.">
   <main data-layout-content>
       <section class="card">
         <div class="section-head">
           <div>
-            <span class="eyebrow">CompreFace</span>
-            <h2>Face Collection</h2>
+            <span class="eyebrow">Biometria facial</span>
+            <h2>Coleção facial</h2>
           </div>
-          <span id="usuariosStatus" class="muted-text">Selecione um usuário para gerenciar a coleção facial no estilo do CompreFace.</span>
+          <span id="usuariosStatus" class="muted-text">Selecione um usuário para gerenciar a coleção facial.</span>
         </div>
 
         <div class="collection-shell">
           <aside class="subjects-panel">
             <div class="subjects-panel-header">
               <h3>Subjects</h3>
               <input id="usuariosSearch" type="search" placeholder="Buscar usuário..." />
             </div>
 
             <div id="subjectsList" class="subjects-list">
@@ -33,21 +33,21 @@
               <button id="voltarSetoresBtn" type="button" class="ghost-btn hidden">Voltar para setores</button>
               <button id="refreshBtn" type="button" class="ghost-btn">Atualizar lista</button>
               <button id="openCadastroModalBtn" type="button" class="primary-btn">Criar usuário</button>
             </div>
           </aside>
 
           <section class="collection-panel">
             <div class="collection-panel-header">
               <div>
                 <h2 id="colecaoTitulo">Coleção facial</h2>
-                <p id="colecaoStatus" class="muted-text">Selecione um usuário para visualizar as faces cadastradas no CompreFace.</p>
+                <p id="colecaoStatus" class="muted-text">Selecione um usuário para visualizar as faces cadastradas.</p>
               </div>
               <div class="collection-counter">
                 <strong id="colecaoContador">0</strong>
                 <span>imagens</span>
               </div>
             </div>
 
             <label id="dropzoneLabel" class="dropzone-card is-disabled" for="colecaoFotosInput">
               <input id="colecaoFotosInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden />
               <strong>Clique aqui ou arraste as imagens</strong>
@@ -220,11 +220,10 @@
     </section>
   </div>
 
   <script src="../scripts/auth.js?v=20260426b"></script>
   <script src="../components/internal-layout.js?v=20260426b"></script>
   <script src="../scripts/usuarios.js?v=20260331d"></script>
 </body>
 </html>
 
 
-
diff --git a/frontend/scripts/usuarios.js b/frontend/scripts/usuarios.js
index 2b8fae3..9f5a3a6 100644
--- a/frontend/scripts/usuarios.js
+++ b/frontend/scripts/usuarios.js
@@ -1,17 +1,17 @@
 'use strict';
 
 /**
  * Módulo administrativo de usuários e coleção facial.
  *
  * Controla o cadastro, a atualização de perfis, o reset de senha e a sincronização das
- * imagens faciais enviadas ao CompreFace para cada usuário selecionado.
+ * imagens faciais enviadas para cada usuário selecionado.
  */
 const PERFIS = ['admin', 'gestor', 'instrutor', 'colaborador'];
 const SETOR_SEM_NOME = 'Sem setor';
 const collatorPtBr = new Intl.Collator('pt-BR', { usage: 'sort', sensitivity: 'variant' });
 
 const usuariosStatusEl = document.getElementById('usuariosStatus');
 const refreshBtn = document.getElementById('refreshBtn');
 const openCadastroModalBtn = document.getElementById('openCadastroModalBtn');
 const usuariosSearchEl = document.getElementById('usuariosSearch');
 const subjectsListEl = document.getElementById('subjectsList');
@@ -355,21 +355,22 @@ function fecharModalResetSenha() {
   if (!cadastroModalEl || cadastroModalEl.classList.contains('hidden')) {
     document.body.classList.remove('modal-open');
   }
 }
 
 function filtrarUsuariosColecao() {
   const termo = state.usuariosBusca.trim().toLowerCase();
   if (!termo) return state.usuarios;
 
   return state.usuarios.filter((usuario) => {
-    return [usuario.nome_completo, usuario.usuario, usuario.subject_compreface, usuario.setor]
+    const subject = Object.entries(usuario).find(([key]) => key.startsWith('subject_'))?.[1];
+    return [usuario.nome_completo, usuario.usuario, subject, usuario.setor]
       .filter(Boolean)
       .some((valor) => String(valor).toLowerCase().includes(termo));
   });
 }
 
 function renderListaSetores(usuariosFiltrados) {
   const grupos = new Map();
   usuariosFiltrados.forEach((usuario) => {
     const chave = obterChaveSetor(usuario.setor);
     if (!grupos.has(chave)) {
@@ -424,21 +425,21 @@ function renderListaUsuariosDoSetor(usuariosFiltrados) {
       const button = document.createElement('button');
       button.type = 'button';
       button.className = 'subject-item';
       if (state.colecaoUsuario?.id === usuario.id) {
         button.classList.add('active');
       }
 
       const totalFaces = state.colecaoUsuario?.id === usuario.id ? state.colecaoFaces.length : null;
       button.innerHTML = `
         <strong>${escapeHtml(usuario.nome_completo || '-')}</strong>
-        <span>${escapeHtml(usuario.subject_compreface || usuario.usuario || '-')}</span>
+        <span>${escapeHtml(Object.entries(usuario).find(([key]) => key.startsWith('subject_'))?.[1] || usuario.usuario || '-')}</span>
         <span>${usuario.ativo ? 'Ativo' : 'Inativo'}${totalFaces !== null ? ` • ${totalFaces} imagem(ns)` : ''}</span>
       `;
       button.addEventListener('click', async () => {
         await carregarColecaoFacial(usuario);
         renderSubjectsList();
       });
       subjectsListEl.appendChild(button);
     });
 }
 
@@ -471,21 +472,21 @@ function atualizarContadorColecao() {
 }
 
 function atualizarEstadoDropzone() {
   if (!state.colecaoUsuario) {
     dropzoneLabelEl.querySelector('span').textContent = 'Selecione um usuário antes de enviar imagens.';
     return;
   }
 
   const totalArquivos = colecaoFotosInputEl.files?.length || 0;
   dropzoneLabelEl.querySelector('span').textContent = totalArquivos > 0
-    ? `${totalArquivos} arquivo(s) pronto(s) para envio ao CompreFace.`
+    ? `${totalArquivos} arquivo(s) pronto(s) para envio.`
     : 'Envie novas fotos para a coleção facial do usuário selecionado.';
 }
 
 function definirArquivosColecao(files) {
   const dataTransfer = new DataTransfer();
   Array.from(files || []).forEach((file) => dataTransfer.items.add(file));
   colecaoFotosInputEl.files = dataTransfer.files;
   atualizarEstadoDropzone();
 }
 
@@ -500,50 +501,45 @@ async function carregarImagemAutenticada(url, imgEl) {
     const objectUrl = URL.createObjectURL(blob);
     imgEl.src = objectUrl;
     imgEl.dataset.objectUrl = objectUrl;
   } catch (err) {
     console.error('[usuarios] Falha ao carregar imagem da face:', err);
     imgEl.alt = 'Falha ao carregar imagem';
   }
 }
 
 function montarUrlImagemColecao(face) {
-  const fotoUrl = String(face?.foto_url || '').trim();
-  if (fotoUrl) {
-    return fotoUrl;
-  }
-
   const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
   if (imageId) {
     return `${window.Auth.getApiBase()}/faces/${encodeURIComponent(imageId)}/img`;
   }
 
-  return null;
+  return String(face?.foto_url || '').trim() || null;
 }
 
 function limparPainelColecao(mensagem) {
   state.colecaoUsuario = null;
   state.colecaoFaces = [];
   colecaoTituloEl.textContent = state.colecaoSetorAtual ? `Coleção facial • ${state.colecaoSetorAtual}` : 'Coleção facial';
   colecaoStatusEl.textContent = mensagem;
   colecaoGridEl.innerHTML = '<p class="muted-text">Nenhum usuário selecionado.</p>';
   colecaoFotosInputEl.value = '';
   atualizarContadorColecao();
   setColecaoBotoesHabilitados(false);
   atualizarEstadoDropzone();
   renderPainelUsuarioSelecionado();
   renderSubjectsList();
 }
 
 function renderColecaoFaces() {
   if (!state.colecaoUsuario) {
-    limparPainelColecao('Selecione um usuário para visualizar as faces cadastradas no CompreFace.');
+    limparPainelColecao('Selecione um usuário para visualizar as faces cadastradas.');
     return;
   }
 
   atualizarContadorColecao();
 
   if (state.colecaoFaces.length === 0) {
     colecaoGridEl.innerHTML = '<p class="muted-text">Nenhuma face cadastrada para este usuário.</p>';
     return;
   }
 
@@ -563,55 +559,55 @@ function renderColecaoFaces() {
 
     const imgEl = card.querySelector('img');
     const fotoUrl = montarUrlImagemColecao(face);
     if (imgEl && fotoUrl) {
       carregarImagemAutenticada(fotoUrl, imgEl);
     } else if (imgEl) {
       imgEl.alt = 'Imagem indisponível';
     }
 
     card.querySelector('[data-image-id]')?.addEventListener('click', async () => {
-      const confirmou = window.confirm('Remover esta face da coleção do CompreFace?');
+      const confirmou = window.confirm('Remover esta face da colecao facial?');
       if (!confirmou) return;
 
       try {
         await window.Auth.apiJson(`/usuarios/${state.colecaoUsuario.id}/face-collection/${encodeURIComponent(face.image_id)}`, {
           method: 'DELETE',
         });
-        colecaoStatusEl.textContent = 'Face removida do CompreFace.';
+        colecaoStatusEl.textContent = 'Face removida da colecao facial.';
         await carregarColecaoFacial(state.colecaoUsuario);
       } catch (err) {
         console.error('[usuarios] erro ao remover face:', err);
         colecaoStatusEl.textContent = err.message;
       }
     });
 
     colecaoGridEl.appendChild(card);
   });
 }
 
 /**
- * Carrega a coleção facial do usuário escolhido, sincronizando grid de faces, contador e ações do CompreFace.
+ * Carrega a coleção facial do usuário escolhido, sincronizando grid de faces, contador e ações disponíveis.
  * @param {object} usuario Registro atualmente selecionado no painel lateral.
  * @returns {Promise<void>}
  */
 async function carregarColecaoFacial(usuario) {
   state.colecaoUsuario = usuario;
   state.colecaoSetorAtual = obterChaveSetor(usuario.setor);
   colecaoTituloEl.textContent = `Coleção facial • ${usuario.nome_completo}`;
-  colecaoStatusEl.textContent = 'Carregando faces do CompreFace...';
+  colecaoStatusEl.textContent = 'Carregando faces cadastradas...';
   setColecaoBotoesHabilitados(true);
 
   try {
     const json = await window.Auth.apiJson(`/usuarios/${usuario.id}/face-collection`);
     state.colecaoFaces = Array.isArray(json?.data) ? json.data : [];
-    colecaoStatusEl.textContent = `${state.colecaoFaces.length} face(s) cadastrada(s) no CompreFace.`;
+    colecaoStatusEl.textContent = `${state.colecaoFaces.length} face(s) cadastrada(s).`;
     atualizarEstadoDropzone();
     renderColecaoFaces();
     renderPainelUsuarioSelecionado();
     renderSubjectsList();
   } catch (err) {
     console.error('[usuarios] erro ao carregar coleção facial:', err);
     state.colecaoFaces = [];
     colecaoGridEl.innerHTML = '<p class="muted-text">Falha ao carregar faces deste usuário.</p>';
     colecaoStatusEl.textContent = err.message;
     atualizarContadorColecao();
@@ -721,21 +717,21 @@ resetSenhaFormEl?.addEventListener('submit', async (event) => {
     );
     fecharModalResetSenha();
   } finally {
     confirmarResetSenhaBtn.disabled = false;
   }
 });
 
 adminExcluirBtn?.addEventListener('click', async () => {
   if (!state.colecaoUsuario?.id) return;
   const alvo = state.colecaoUsuario;
-  const confirmou = window.confirm(`Excluir definitivamente ${alvo.nome_completo}? Isso remove o usuário aqui e no CompreFace.`);
+  const confirmou = window.confirm(`Excluir definitivamente ${alvo.nome_completo}? Isso remove o usuário aqui e na colecao facial.`);
   if (!confirmou) return;
 
   adminExcluirBtn.disabled = true;
   try {
     await window.Auth.apiJson(`/usuarios/${alvo.id}?hard=true`, { method: 'DELETE' });
     usuariosStatusEl.textContent = `Usuário ${alvo.nome_completo} excluído definitivamente.`;
     state.colecaoUsuario = null;
     state.colecaoFaces = [];
     limparPainelColecao('Usuário excluído. Selecione outro usuário para gerenciar a coleção facial.');
     await carregarUsuarios();
@@ -812,23 +808,23 @@ usuarioForm?.addEventListener('submit', async (event) => {
     const response = await window.Auth.authFetch(`${window.Auth.getApiBase()}/usuarios`, {
       method: 'POST',
       body: formData,
     });
 
     const json = await response.json().catch(() => ({}));
     if (!response.ok) {
       throw new Error(json?.message || 'Falha ao criar usuário.');
     }
 
-    const totalFotos = Number(json?.compreface?.fotosEnviadas || 0);
+    const totalFotos = Number(json?.faceRecognition?.fotosEnviadas || json?.totalFotos || json?.faces?.length || 0);
     usuariosStatusEl.textContent = totalFotos > 0
-      ? `Usuário criado e ${totalFotos} foto(s) enviada(s) ao CompreFace.`
+      ? `Usuário criado e ${totalFotos} foto(s) cadastrada(s).`
       : (json?.message || 'Usuário criado com sucesso.');
 
     fecharModalCadastro();
     usuarioForm.reset();
     if (novoGestorIdEl) novoGestorIdEl.value = '';
     if (novoGestorNomeEl) novoGestorNomeEl.value = '';
     if (novoSetorEl) novoSetorEl.value = '';
     if (novoCpfEl) novoCpfEl.value = '';
     if (novoResetPrimeiroAcessoEl) novoResetPrimeiroAcessoEl.checked = false;
     atualizarCamposColaborador();
@@ -968,60 +964,60 @@ colecaoUploadBtn?.addEventListener('click', async () => {
   if (!state.colecaoUsuario) return;
 
   const fotos = Array.from(colecaoFotosInputEl.files || []);
   if (fotos.length === 0) {
     colecaoStatusEl.textContent = 'Selecione ao menos uma foto para enviar.';
     return;
   }
 
   const formData = new FormData();
   fotos.forEach((foto) => formData.append('fotos', foto, foto.name));
-  colecaoStatusEl.textContent = 'Enviando fotos ao CompreFace...';
+  colecaoStatusEl.textContent = 'Enviando fotos...';
   colecaoUploadBtn.disabled = true;
 
   try {
     const response = await window.Auth.authFetch(
       `${window.Auth.getApiBase()}/usuarios/${state.colecaoUsuario.id}/face-collection/fotos`,
       {
         method: 'POST',
         body: formData,
       }
     );
 
     const json = await response.json().catch(() => ({}));
     if (!response.ok) {
       throw new Error(json?.message || 'Falha ao enviar fotos.');
     }
 
     colecaoFotosInputEl.value = '';
-    colecaoStatusEl.textContent = json?.message || 'Fotos enviadas ao CompreFace.';
+    colecaoStatusEl.textContent = json?.message || 'Fotos cadastradas.';
     atualizarEstadoDropzone();
     await carregarColecaoFacial(state.colecaoUsuario);
   } catch (err) {
     console.error('[usuarios] erro ao enviar fotos:', err);
     colecaoStatusEl.textContent = err.message;
   } finally {
     colecaoUploadBtn.disabled = false;
   }
 });
 
 colecaoLimparBtn?.addEventListener('click', async () => {
   if (!state.colecaoUsuario) return;
 
-  const confirmou = window.confirm(`Remover todas as faces de ${state.colecaoUsuario.nome_completo} no CompreFace?`);
+  const confirmou = window.confirm(`Remover todas as faces de ${state.colecaoUsuario.nome_completo}?`);
   if (!confirmou) return;
 
   try {
     await window.Auth.apiJson(`/usuarios/${state.colecaoUsuario.id}/face-collection`, {
       method: 'DELETE',
     });
-    colecaoStatusEl.textContent = 'Coleção facial removida do CompreFace.';
+    colecaoStatusEl.textContent = 'Colecao facial removida.';
     await carregarColecaoFacial(state.colecaoUsuario);
   } catch (err) {
     console.error('[usuarios] erro ao limpar coleção:', err);
     colecaoStatusEl.textContent = err.message;
   }
 });
 
 (async function init() {
   const user = await window.Auth.requireAuth(['admin']);
   if (!user) return;
