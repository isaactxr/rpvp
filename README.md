# Laboral — Registro de Presença com Reconhecimento Facial

Sistema web para gestão de sessões e auditoria de presença com reconhecimento facial (CompreFace), controle de check-in/check-out, perfis de acesso e administração de usuários.

## Stack atual

- Backend: Node.js + Express + PostgreSQL
- Frontend: HTML/CSS/JavaScript (sem framework)
- Reconhecimento: CompreFace + MediaPipe Face Mesh (detecção local no cliente)
- Processamento de imagem de auditoria: Sharp

## Estrutura do projeto

```text
backend/
  server.js
  src/
    controllers/
    services/
    routes/
    middleware/
    config/
frontend/
  index.html
  pages/
    dashboard.html
    sessoes.html
    registros.html
    usuarios.html
    configuracoes.html
    login.html
    alterar-senha.html
```

## Principais funcionalidades

- Verificação facial com fluxo de piscada (EAR) e envio para reconhecimento
- Gestão de sessões:
  - criação de sessão por admin/instrutor
  - acompanhamento em tempo real
  - controle de início/encerramento
  - gerenciamento de tipos de sessão no próprio módulo
- Auditoria de sessões:
  - filtros avançados
  - exportação PDF e Excel
  - visualização de imagem auditada
- Dashboard operacional com KPIs do dia
- Gestão de usuários:
  - criação com CPF e setor
  - integração com coleção facial do CompreFace
  - reset de senha com opção de troca obrigatória no primeiro acesso
- Configurações administrativas em banco (sem reiniciar servidor)
  - presença, biometria e sistema
  - preview facial para ajuste de parâmetros
- Autenticação por token com perfis:
  - `admin`, `gestor`, `instrutor`, `colaborador`
  - suporte a troca obrigatória de senha no primeiro login

## Configuração de ambiente

Na raiz do projeto, copie o arquivo exemplo:

```bash
cp .env.example .env
```

Variáveis principais (resumo):

```env
# CompreFace
COMPREFACE_URL=http://localhost:8000
COMPREFACE_API_KEY=SUA_API_KEY_AQUI
COMPREFACE_SIMILARITY_THRESHOLD=0.92
COMPREFACE_TIMEOUT_MS=10000

# Servidor
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
TRUST_PROXY=1
CORS_ORIGINS=https://app.suaempresa.com

# Autenticação
AUTH_TOKEN_TTL_HOURS=12
AUTH_PASSWORD_SALT=defina_um_salt_longo_e_aleatorio
INITIAL_ADMIN_NAME=Viana Peixoto
INITIAL_ADMIN_USER=viana.peixoto
INITIAL_ADMIN_PASSWORD=defina_uma_senha_inicial_forte
ALLOW_BOOTSTRAP_ADMIN=false
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_AUTH_MAX=15
RATE_LIMIT_RECOGNIZE_WINDOW_MS=60000
RATE_LIMIT_RECOGNIZE_MAX=30

# Banco (Docker Compose)
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=rpvp
DB_USERNAME=vianapeixoto
DB_PASSWORD=defina_uma_senha_forte
DB_SCHEMA=public
```

## Como executar

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Para execucao local do backend fora do Docker, crie `backend/.env` (nao versionado) com as variaveis necessarias.

Observação: o `server.js` aplica criação/ajustes de estrutura necessários na inicialização (tabelas e colunas usadas pelo sistema).

### 2) Frontend

Use qualquer servidor estático apontando para `frontend` (ex.: Live Server ou HTTP simples):

```bash
cd frontend
python -m http.server 8080
```

Frontend esperado em `http://localhost:8080` e backend em `http://localhost:3000`.

## Fluxo de autenticação

- Login em `pages/login.html`
- No bootstrap Docker, o admin inicial é sincronizado a partir de `INITIAL_ADMIN_USER` e `INITIAL_ADMIN_PASSWORD`
- Se o usuário estiver com `reset_senha_primeiro_acesso=true`, é redirecionado para `pages/alterar-senha.html`
- Após trocar senha, fluxo volta ao módulo solicitado

## Endpoints principais (resumo)

- Auth:
  - `POST /auth/login`
  - `POST /auth/bootstrap-admin` (somente quando `ALLOW_BOOTSTRAP_ADMIN=true`)
  - `GET /auth/me`
  - `POST /auth/logout`
  - `POST /auth/alterar-senha`
- Presença e auditoria:
  - `POST /reconhecer`
  - `GET /presencas`
  - `GET /auditoria/registros`
  - `GET /auditoria/registros/export/pdf`
  - `GET /auditoria/registros/export/excel`
- Sessões:
  - `GET /sessoes`
  - `POST /sessoes`
  - `POST /sessoes/:id/iniciar`
  - `POST /sessoes/:id/encerrar`
  - `GET /sessoes/:id/acompanhamento`
- Usuários:
  - `GET /usuarios`
  - `POST /usuarios`
  - `PUT /usuarios/:id`
  - `DELETE /usuarios/:id`
  - `GET /usuarios/:id/face-collection`
  - `POST /usuarios/:id/face-collection/fotos`
  - `DELETE /usuarios/:id/face-collection`
  - `DELETE /usuarios/:id/face-collection/:imageId`
- Admin:
  - `GET /admin/configuracoes`
  - `PUT /admin/configuracoes`
  - `GET /tipos-sessao`
  - `POST /tipos-sessao`
  - `PUT /tipos-sessao/:id`
  - `DELETE /tipos-sessao/:id`

## Observações

- As imagens de auditoria sao persistidas no banco em `presencas_imagens` (`BYTEA`).
- Para produção, nunca use `CORS_ORIGINS=*` e mantenha `ALLOW_BOOTSTRAP_ADMIN=false`.
- Para produção, ajuste segredos e credenciais de banco com valores fortes e exclusivos por ambiente.
- Recomenda-se executar por trás de proxy reverso (Nginx/Traefik) e HTTPS.
