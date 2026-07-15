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

