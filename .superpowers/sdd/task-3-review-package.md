# Review Package: Task 3

## Commits
3bbd3c7 feat: configure local face recognition service

## Stat
 .env.example              | 11 +++++------
 backend/server.js         |  4 ++--
 backend/src/config/env.js | 12 +++++-------
 docker-compose.yml        | 20 ++++++++++++++++----
 4 files changed, 28 insertions(+), 19 deletions(-)

## Diff
diff --git a/.env.example b/.env.example
index 920dffb..00f9eda 100644
--- a/.env.example
+++ b/.env.example
@@ -1,20 +1,19 @@
 # ================================================================
 # RPVP - Arquivo unico de variaveis de ambiente (Docker Compose)
 # Copie para .env na raiz do projeto.
 # ================================================================
 
-# --- CompreFace (externo) ---------------------------------------
-COMPREFACE_URL=http://compreface-ui:80
-COMPREFACE_API_KEY=
-COMPREFACE_SIMILARITY_THRESHOLD=0.92
-COMPREFACE_TIMEOUT_MS=10000
+# --- Face Recognition (interno) ---------------------------------
+FACE_RECOGNITION_URL=http://face-recognition:8000
+FACE_RECOGNITION_THRESHOLD=0.6
+FACE_RECOGNITION_TIMEOUT_MS=15000
 
 # --- Backend API -------------------------------------------------
 NODE_ENV=production
 PORT=3000
 HOST=0.0.0.0
 APP_TIMEZONE=America/Sao_Paulo
 TRUST_PROXY=1
 CORS_ORIGINS=https://app.suaempresa.com
 
 AUTH_TOKEN_TTL_HOURS=12
@@ -35,11 +34,11 @@ DB_HOST=rpvp-postgres
 DB_PORT=5432
 DB_DATABASE=rpvp
 DB_USERNAME=vianapeixoto
 DB_PASSWORD=defina_uma_senha_forte_para_o_banco
 DB_SCHEMA=public
 
 # --- Frontend ----------------------------------------------------
 FRONTEND_HOST=0.0.0.0
 FRONTEND_PORT=8080
 BACKEND_TARGET=http://backend:3000
-FRONTEND_API_BASE=/api
\ No newline at end of file
+FRONTEND_API_BASE=/api
diff --git a/backend/server.js b/backend/server.js
index a8af358..ac68ef8 100644
--- a/backend/server.js
+++ b/backend/server.js
@@ -292,21 +292,21 @@ async function iniciar() {
     const syncAdmin = await authService.sincronizarAdminInicial();
     if (syncAdmin.status === 'updated' || syncAdmin.status === 'created') {
       console.log(`[server] Admin inicial ${syncAdmin.status === 'updated' ? 'sincronizado' : 'criado'} para ${syncAdmin.usuario}.`);
     } else if (syncAdmin.status === 'skipped') {
       console.log(`[server] Admin inicial não sincronizado: ${syncAdmin.reason}`);
     }
 
     // Inicia o servidor
     app.listen(config.PORT, config.HOST, () => {
       console.log(`[server] ? Rodando em http://${config.HOST}:${config.PORT}`);
-      console.log(`[server] ? CompreFace: ${config.COMPREFACE_URL}`);
-      console.log(`[server] ? Threshold de similaridade: ${config.SIMILARITY_THRESHOLD}`);
+      console.log(`[server] ? Face Recognition: ${config.FACE_RECOGNITION_URL}`);
+      console.log(`[server] ? Threshold facial: ${config.FACE_RECOGNITION_THRESHOLD}`);
       console.log(`[server] ? Banco de dados: ${config.DB_DATABASE}@${config.DB_HOST}:${config.DB_PORT}`);
     });
   } catch (err) {
     console.error(`[server] Erro fatal ao iniciar: ${err.message}`);
     process.exit(1);
   }
 }
 
 iniciar();
diff --git a/backend/src/config/env.js b/backend/src/config/env.js
index d2acaba..bbedaea 100644
--- a/backend/src/config/env.js
+++ b/backend/src/config/env.js
@@ -38,22 +38,21 @@ function parseTrustProxy(value) {
   }
 
   return raw;
 }
 
 // --- Variáveis obrigatórias ---------------------------------------------------
 
 const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
 
 const REQUIRED = [
-  'COMPREFACE_URL',
-  'COMPREFACE_API_KEY',
+  'FACE_RECOGNITION_URL',
   'CORS_ORIGINS',
   'AUTH_PASSWORD_SALT',
   'DB_HOST',
   'DB_PORT',
   'DB_DATABASE',
   'DB_USERNAME',
   'DB_PASSWORD',
 ];
 
 const missing = REQUIRED.filter(key => !process.env[key]);
@@ -81,25 +80,24 @@ if (NODE_ENV === 'production' && allowBootstrapAdmin) {
 
 // --- Exporta configuração tipada ----------------------------------------------
 
 module.exports = Object.freeze({
   NODE_ENV,
   PORT: parseInt(process.env.PORT, 10) || 3000,
   HOST: process.env.HOST || '0.0.0.0',
   APP_TIMEZONE: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
   TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY),
 
-  // CompreFace
-  COMPREFACE_URL:      process.env.COMPREFACE_URL,
-  COMPREFACE_API_KEY:  process.env.COMPREFACE_API_KEY,
-  SIMILARITY_THRESHOLD: parseFloat(process.env.COMPREFACE_SIMILARITY_THRESHOLD) || 0.92,
-  COMPREFACE_TIMEOUT_MS: parseInt(process.env.COMPREFACE_TIMEOUT_MS, 10) || 10000,
+  // Face Recognition
+  FACE_RECOGNITION_URL: process.env.FACE_RECOGNITION_URL,
+  FACE_RECOGNITION_THRESHOLD: parseFloat(process.env.FACE_RECOGNITION_THRESHOLD) || 0.6,
+  FACE_RECOGNITION_TIMEOUT_MS: parseInt(process.env.FACE_RECOGNITION_TIMEOUT_MS, 10) || 15000,
 
   // CORS
   CORS_ORIGINS: corsRaw,
 
   // Autenticação
   AUTH_TOKEN_TTL_HOURS: parseInt(process.env.AUTH_TOKEN_TTL_HOURS, 10) || 12,
   AUTH_PASSWORD_SALT: process.env.AUTH_PASSWORD_SALT,
   INITIAL_ADMIN_NAME: process.env.INITIAL_ADMIN_NAME || 'Viana Peixoto',
   INITIAL_ADMIN_USER: process.env.INITIAL_ADMIN_USER || 'viana.peixoto',
   INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || '',
diff --git a/docker-compose.yml b/docker-compose.yml
index bbabc1a..db26e27 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -20,41 +20,53 @@ services:
       timeout: 5s
       retries: 10
 
   cloudflared:
     image: cloudflare/cloudflared:latest
     restart: unless-stopped
     command: tunnel --no-autoupdate --edge-ip-version 4 run
     environment:
        TUNNEL_TOKEN: ${TUNNEL_TOKEN}
 
+  face-recognition:
+    build:
+      context: ./face-recognition
+      dockerfile: Dockerfile
+    container_name: rpvp-face-recognition
+    restart: unless-stopped
+    environment:
+      PYTHONUNBUFFERED: "1"
+    expose:
+      - "8000"
+
   backend:
     build:
       context: ./backend
       dockerfile: Dockerfile
     container_name: rpvp-backend
     restart: unless-stopped
     depends_on:
       postgres:
         condition: service_healthy
+      face-recognition:
+        condition: service_started
     environment:
       NODE_ENV: ${NODE_ENV:-production}
       PORT: 3000
       HOST: 0.0.0.0
       APP_TIMEZONE: America/Sao_Paulo
       TRUST_PROXY: ${TRUST_PROXY:-1}
       CORS_ORIGINS: ${CORS_ORIGINS:?Defina CORS_ORIGINS com os dominios permitidos}
 
-      COMPREFACE_URL: ${COMPREFACE_URL:-http://localhost:8000}
-      COMPREFACE_API_KEY: ${COMPREFACE_API_KEY:?Defina COMPREFACE_API_KEY no arquivo .env}
-      COMPREFACE_SIMILARITY_THRESHOLD: ${COMPREFACE_SIMILARITY_THRESHOLD:-0.92}
-      COMPREFACE_TIMEOUT_MS: ${COMPREFACE_TIMEOUT_MS:-10000}
+      FACE_RECOGNITION_URL: ${FACE_RECOGNITION_URL:-http://face-recognition:8000}
+      FACE_RECOGNITION_THRESHOLD: ${FACE_RECOGNITION_THRESHOLD:-0.6}
+      FACE_RECOGNITION_TIMEOUT_MS: ${FACE_RECOGNITION_TIMEOUT_MS:-15000}
 
       AUTH_TOKEN_TTL_HOURS: ${AUTH_TOKEN_TTL_HOURS:-12}
       AUTH_PASSWORD_SALT: ${AUTH_PASSWORD_SALT:?Defina AUTH_PASSWORD_SALT no arquivo .env}
       INITIAL_ADMIN_NAME: ${INITIAL_ADMIN_NAME:-Viana Peixoto}
       INITIAL_ADMIN_USER: ${INITIAL_ADMIN_USER:-viana.peixoto}
       INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD:?Defina INITIAL_ADMIN_PASSWORD no arquivo .env}
       ALLOW_BOOTSTRAP_ADMIN: ${ALLOW_BOOTSTRAP_ADMIN:-false}
       PRESENCE_COOLDOWN_MS: ${PRESENCE_COOLDOWN_MS:-10000}
       RATE_LIMIT_AUTH_WINDOW_MS: ${RATE_LIMIT_AUTH_WINDOW_MS:-900000}
       RATE_LIMIT_AUTH_MAX: ${RATE_LIMIT_AUTH_MAX:-15}
