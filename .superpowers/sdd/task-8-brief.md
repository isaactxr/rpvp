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

