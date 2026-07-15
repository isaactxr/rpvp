# Task 6 Report: Replace Face Collection Endpoints

## Status

Completed.

## Changes

- Replaced collection list, add, delete, clear, and image handlers with `usuarioFaceService` operations.
- Replaced the image route with `GET /faces/:faceId/img`.
- Removed the controller's legacy external face-service dependency and migrated remaining user photo lifecycle calls to local storage.

## Verification

- `node -c backend/src/controllers/reconhecerController.js` passed.
- `node -c backend/src/routes/reconhecer.js` passed.
- Legacy reference search returned no matches.
- `git diff --check` passed.

## Concerns

- No automated HTTP integration test was added because task ownership limits source edits to the controller and route modules.

## Review Fixes

- Collection list/add responses now use `usuario.subject_compreface || usuario.nome_completo`.
- Frontend face image resolution honors `face.foto_url` and otherwise requests `/faces/:imageId/img` through the configured API base.

## Review Verification

- `node -c backend/src/controllers/reconhecerController.js` passed.
- `node -c frontend/scripts/usuarios.js` passed.
- Legacy URL search returned no `/compreface` matches in the owned controller, frontend, or route files.
- `git diff --check` passed.
