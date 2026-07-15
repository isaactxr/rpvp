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

