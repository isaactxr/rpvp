# Task 5 Report: Replace Recognition Flow in Controller

## Changes

- Migrated `POST /reconhecer` in `backend/src/controllers/reconhecerController.js` from the CompreFace recognition call to `usuarioFaceService.listarCandidatosReconhecimento()` and `faceRecognitionService.recognizeImage()`.
- Resolved the matched local user through `usuarioService.obterUsuarioPorId(resultado.usuarioId)`.
- Bridged the existing presence service with `usuarioReconhecido.subject_compreface || usuarioReconhecido.nome_completo` and calculated similarity from the local recognition distance.
- Preserved the endpoint response shape and mapped motor validation errors to HTTP 422; other motor failures remain HTTP 502.
- No route change was required.

## Verification

- `node -c backend/src/controllers/reconhecerController.js` passed.
- `node -c backend/src/routes/reconhecer.js` passed.
- `git diff --check` passed.

## Remaining CompreFace References

`rg -n "compreFaceService|CompreFace" backend/src/controllers/reconhecerController.js` still finds the import and user collection lifecycle handlers (`criarUsuario`, `atualizarUsuario`, `desativarUsuario`, and collection image endpoints). These are outside Task 5 and are retained for Task 9; the `reconhecer` flow contains no CompreFace references.
