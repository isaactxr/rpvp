# Task 8 Report

Status: complete

Updated the user-management frontend copy to use neutral facial-collection language, changed collection image previews to prefer `/faces/:id/img`, and added compatibility for `faceRecognition.fotosEnviadas` and `totalFotos` in create-user responses.

Verification:

- `node -c frontend/scripts/usuarios.js` passed.
- `rg -n "CompreFace|compreface" frontend/pages/usuarios.html frontend/scripts/usuarios.js` found no matches.
- `git diff --check` passed.
