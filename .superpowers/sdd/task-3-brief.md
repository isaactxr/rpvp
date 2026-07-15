### Task 3: Wire Docker and Environment Configuration

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `backend/src/config/env.js`

**Interfaces:**
- Produces config keys `FACE_RECOGNITION_URL`, `FACE_RECOGNITION_THRESHOLD`, `FACE_RECOGNITION_TIMEOUT_MS`.
- Removes required `COMPREFACE_*` config.

- [ ] **Step 1: Update `.env.example`**

Replace the CompreFace block with:

```env
# --- Face Recognition (interno) ---------------------------------
FACE_RECOGNITION_URL=http://face-recognition:8000
FACE_RECOGNITION_THRESHOLD=0.6
FACE_RECOGNITION_TIMEOUT_MS=15000
```

- [ ] **Step 2: Update `docker-compose.yml`**

Add service:

```yaml
  face-recognition:
    build:
      context: ./face-recognition
      dockerfile: Dockerfile
    container_name: rpvp-face-recognition
    restart: unless-stopped
    environment:
      PYTHONUNBUFFERED: "1"
    expose:
      - "8000"
```

In `backend.depends_on`, add:

```yaml
      face-recognition:
        condition: service_started
```

In `backend.environment`, remove `COMPREFACE_*` entries and add:

```yaml
      FACE_RECOGNITION_URL: ${FACE_RECOGNITION_URL:-http://face-recognition:8000}
      FACE_RECOGNITION_THRESHOLD: ${FACE_RECOGNITION_THRESHOLD:-0.6}
      FACE_RECOGNITION_TIMEOUT_MS: ${FACE_RECOGNITION_TIMEOUT_MS:-15000}
```

- [ ] **Step 3: Update `backend/src/config/env.js` required variables**

Remove these from `REQUIRED`:

```js
  'COMPREFACE_URL',
  'COMPREFACE_API_KEY',
```

Add:

```js
  'FACE_RECOGNITION_URL',
```

Replace CompreFace exports with:

```js
  // Face Recognition
  FACE_RECOGNITION_URL: process.env.FACE_RECOGNITION_URL,
  FACE_RECOGNITION_THRESHOLD: parseFloat(process.env.FACE_RECOGNITION_THRESHOLD) || 0.6,
  FACE_RECOGNITION_TIMEOUT_MS: parseInt(process.env.FACE_RECOGNITION_TIMEOUT_MS, 10) || 15000,
```

- [ ] **Step 4: Update startup logs in `backend/server.js`**

Replace:

```js
      console.log(`[server] ✓ CompreFace: ${config.COMPREFACE_URL}`);
      console.log(`[server] ✓ Threshold de similaridade: ${config.SIMILARITY_THRESHOLD}`);
```

With:

```js
      console.log(`[server] ✓ Face Recognition: ${config.FACE_RECOGNITION_URL}`);
      console.log(`[server] ✓ Threshold facial: ${config.FACE_RECOGNITION_THRESHOLD}`);
```

- [ ] **Step 5: Verify no config references remain**

Run:

```powershell
rg -n "COMPREFACE_|COMPREFACE_URL|SIMILARITY_THRESHOLD" backend docker-compose.yml .env.example
```

Expected: no active backend/config matches.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example backend/src/config/env.js backend/server.js
git commit -m "feat: configure local face recognition service"
```

---

