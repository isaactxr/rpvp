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

