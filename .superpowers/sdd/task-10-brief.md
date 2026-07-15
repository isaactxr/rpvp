### Task 10: End-to-End Verification

**Files:**
- No required source edits unless verification reveals defects.

**Interfaces:**
- Verifies Docker startup, health endpoints, backend syntax, and frontend static loading.

- [ ] **Step 1: Install/build dependencies**

Run:

```powershell
docker compose build
```

Expected: all images build, including `rpvp-face-recognition`.

- [ ] **Step 2: Start services**

Run:

```powershell
docker compose up -d postgres face-recognition backend frontend
```

Expected: containers start successfully.

- [ ] **Step 3: Verify face service health**

Run:

```powershell
docker compose exec face-recognition python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

Expected includes:

```json
{"success":true,"engine":"face_recognition"}
```

- [ ] **Step 4: Verify backend health**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/health
```

Expected: JSON containing `"status":"ok"`.

- [ ] **Step 5: Reprocess imported embeddings**

After user imports `usuarios_faces(usuario_id, face, content_type, atualizado_em)` rows, run:

```powershell
docker compose exec backend npm run faces:reprocess
```

Expected: summary line like:

```text
[faces] concluido :: total=10 ok=10 falhas=0
```

- [ ] **Step 6: Verify no missing embeddings for valid imported faces**

Run in Postgres:

```sql
SELECT COUNT(*) AS sem_embedding
FROM usuarios_faces
WHERE embedding IS NULL;
```

Expected: `0` for all valid face photos; invalid photos must be reviewed manually.

- [ ] **Step 7: Verify UI manually**

Open:

```text
http://localhost:8080/pages/usuarios.html
```

Expected:

- Login works.
- User face collection loads.
- Existing imported photos display.
- New photo upload works.
- Face delete works.

- [ ] **Step 8: Verify recognition manually**

Open:

```text
http://localhost:8080/pages/sessao.html
```

Expected:

- Camera starts.
- Blink capture sends image.
- Backend recognizes a migrated user.
- Presence is registered in the selected session.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize face recognition migration"
```

If no fixes were needed, do not create an empty commit.

