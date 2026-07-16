# Manual Tecnico Completo - Sistema Laboral (RPVP)

Documento consolidado para desenvolvedores, operadores tecnicos e manutencao da aplicacao.

Atualizado com base no estado atual do workspace em 16/07/2026.

---

## 1. Visao geral do sistema

### 1.1 Objetivo

O Sistema Laboral (RPVP) realiza **registro de presenca com reconhecimento facial**, com suporte a autenticacao de usuarios, gestao de sessoes, auditoria dos registros, administracao de usuarios, manutencao de colecao facial e parametrizacao operacional.

### 1.2 Estado de hospedagem

O estado atual da aplicacao e **self-hosted**.

Nao ha dependencia de plataforma externa gerenciada como deploy, banco, autenticacao, storage ou API. A stack atual usa:

- Docker Compose;
- PostgreSQL proprio da aplicacao;
- backend Node.js/Express;
- frontend servido por servidor Node proprio;
- servico facial interno em Python/FastAPI;
- `cloudflared` como tunel quando configurado por `TUNNEL_TOKEN`.

### 1.3 Principais funcionalidades

- login com sessao autenticada por token Bearer;
- hash de token persistido no banco;
- logout com revogacao de sessao;
- troca obrigatoria de senha no primeiro acesso;
- captura facial no navegador com deteccao de piscada;
- reconhecimento facial por servico interno `face-recognition`;
- criacao, acompanhamento, inicio e encerramento de sessoes;
- habilitacao/desabilitacao de check-out por sessao;
- controle de presenca com check-in e check-out;
- auditoria de registros com filtros, imagens e exportacao PDF/Excel;
- exportacao PDF/Excel do acompanhamento de sessao;
- cadastro, edicao, desativacao e exclusao definitiva opcional de usuarios;
- gestao de setores, gestores e perfis;
- importacao/exportacao de usuarios em ZIP;
- gerenciamento da colecao facial dos usuarios;
- configuracao de parametros do sistema sem reiniciar o backend.

### 1.4 Tecnologias utilizadas

Backend:

- Node.js 20;
- Express;
- PostgreSQL com `pg`;
- `dotenv`;
- `helmet`;
- `express-rate-limit`;
- `multer`;
- `axios`;
- `sharp`;
- `pdfkit`;
- `exceljs`;
- `jszip`;
- PBKDF2 via modulo nativo `crypto`.

Frontend:

- HTML;
- CSS;
- JavaScript puro;
- MediaPipe Face Mesh via CDN;
- APIs nativas do navegador (`fetch`, `FormData`, `localStorage`, `getUserMedia`).

Servico facial:

- Python;
- FastAPI;
- `face_recognition`;
- `numpy`;
- `Pillow`;
- `uvicorn`.

Infraestrutura:

- Docker Compose;
- PostgreSQL local da stack;
- Cloudflare Tunnel via `cloudflared`, quando configurado.

---

## 2. Arquitetura

### 2.1 Descricao geral

A arquitetura observada e uma aplicacao web em camadas, composta por:

- **frontend multipagina** com HTML, CSS e scripts por tela;
- **servidor frontend** que serve arquivos estaticos, injeta configuracao runtime e faz proxy `/api`;
- **backend HTTP** centralizado em Express;
- **camada de services** responsavel por regras de negocio, SQL e integracoes;
- **PostgreSQL** como persistencia principal;
- **face-recognition** como servico interno de reconhecimento facial, acessado apenas pelo backend.

Nao ha ORM. O acesso aos dados e feito por SQL direto na camada `services`.

### 2.2 Separacao de responsabilidades

| Camada | Responsabilidade |
|---|---|
| `frontend/pages` | Estrutura visual de cada tela. |
| `frontend/scripts` | Comportamento de UI, chamadas HTTP e estado da pagina. |
| `frontend/dev-server.js` | Servir frontend, proxy `/api` e injecao de base da API. |
| `backend/src/routes` | Registro dos endpoints e aplicacao de middlewares. |
| `backend/src/controllers` | Conversao entre HTTP e regras de negocio. |
| `backend/src/services` | Regras de negocio, SQL, exportacao, autenticacao e integracoes. |
| `backend/src/middleware` | Autenticacao, autorizacao e upload. |
| `backend/src/config` | Ambiente e conexao com banco. |
| `face-recognition/app.py` | API interna para encode e reconhecimento facial. |
| `db/init.sql` | Estrutura inicial do PostgreSQL. |
| `backend/server.js` | Bootstrap e reconciliacao estrutural do banco. |

### 2.3 Fluxo geral

1. O usuario acessa o frontend.
2. O frontend autentica via `/api/auth/login`.
3. O `dev-server.js` remove `/api` e encaminha a chamada ao backend.
4. O backend valida credenciais e cria uma sessao persistida.
5. O frontend armazena o token no `localStorage`.
6. Paginas protegidas usam `requireAuth()` para validar sessao e perfil.
7. Controllers delegam regras aos services.
8. Services acessam PostgreSQL e, quando necessario, chamam `face-recognition`.
9. O resultado retorna ao frontend para atualizacao da interface.

---

## 3. Estrutura do projeto

```text
backend/
  server.js
  Dockerfile
  package.json
  scripts/
    reprocessFaceEmbeddings.js
  src/
    config/
    controllers/
    middleware/
    routes/
    services/
  tests/

db/
  Dockerfile
  init.sql

face-recognition/
  app.py
  Dockerfile
  requirements.txt

frontend/
  dev-server.js
  index.html
  Dockerfile
  pages/
  scripts/
  styles/
  components/
  assets/

docs/
  manual-nao-tecnico.md
  documentacao-tecnica.md
  manual-tecnico-completo.md
```

### 3.1 Backend

Arquivos principais:

- `server.js`: inicializacao da API, middlewares globais, CORS, rate limits, health check e reconciliacao do banco.
- `src/routes/reconhecer.js`: roteamento principal.
- `src/controllers/reconhecerController.js`: auth, reconhecimento, sessoes, usuarios, auditoria e import/export.
- `src/controllers/adminController.js`: configuracoes administrativas e tipos de sessao.
- `src/config/env.js`: variaveis obrigatorias, parse e validacoes de seguranca.
- `src/config/database.js`: pool PostgreSQL.

Services principais:

| Service | Responsabilidade |
|---|---|
| `authService.js` | Login, bootstrap admin, sessoes autenticadas, logout e troca de senha. |
| `cryptoService.js` | Hash e verificacao de senha. |
| `presencaService.js` | Check-in/check-out, duplicidade, cooldown e imagem auditada. |
| `sessaoService.js` | Criacao, inicio, encerramento, checkout e acompanhamento de sessoes. |
| `sessaoExportService.js` | Exportacao de acompanhamento em PDF/Excel. |
| `usuarioService.js` | CRUD de usuarios, setores, gestores e perfis. |
| `usuarioFaceService.js` | Persistencia de fotos e embeddings em `usuarios_faces`. |
| `usuarioImportExportService.js` | Importacao/exportacao ZIP de usuarios e faces. |
| `configService.js` | Configuracoes administrativas tipadas e cache. |
| `tipoSessaoService.js` | Catalogo de tipos de sessao. |
| `auditoriaService.js` | Consulta filtrada/paginada da auditoria. |
| `auditoriaExportService.js` | Exportacao da auditoria em PDF/Excel. |
| `auditImageService.js` | Watermark em imagem de auditoria. |
| `faceRecognitionService.js` | Comunicacao com o motor facial interno. |

### 3.2 Frontend

Paginas:

- `login.html`
- `alterar-senha.html`
- `acesso-negado.html`
- `dashboard.html`
- `sessoes.html`
- `sessao.html`
- `registros.html`
- `usuarios.html`
- `configuracoes.html`
- `tipos-sessao.html`

Scripts relevantes:

- `auth.js`: sessao, token, redirecionamentos e chamadas autenticadas.
- `login.js`: fluxo de login.
- `alterar-senha.js`: troca obrigatoria de senha.
- `dashboard.js`: indicadores.
- `sessoes.js`: listagem e criacao de sessoes.
- `sessao.js`: tela operacional por sessao, camera, piscada, acompanhamento e exportacao.
- `app.js`: fluxo geral de reconhecimento facial.
- `registros.js`: auditoria, filtros e exportacao.
- `usuarios.js`: usuarios, colecao facial e import/export ZIP.
- `configuracoes.js`: parametros administrativos.
- `tipos-sessao.js`: catalogo de tipos.

### 3.3 Servico facial

`face-recognition/app.py` expoe:

- `GET /health`;
- `POST /encode`;
- `POST /recognize`.

O servico:

- carrega a imagem;
- exige exatamente uma face;
- gera embedding de 128 dimensoes;
- compara candidatos enviados pelo backend;
- retorna distancia e identificadores quando houver reconhecimento.

---

## 4. Banco de dados

### 4.1 Tabelas principais

- `usuarios`
- `usuarios_faces`
- `setores`
- `sessoes`
- `tipos_sessao`
- `presencas`
- `presencas_imagens`
- `configuracoes`
- `sessoes_autenticacao`

### 4.2 Pontos importantes

- `usuarios_faces` substitui dependencias externas de colecao facial; as fotos e embeddings ficam no PostgreSQL da propria aplicacao.
- `sessoes_autenticacao` armazena hash SHA-256 do token, expiracao e revogacao.
- `presencas` registra check-in e check-out no mesmo registro.
- `presencas_imagens` guarda imagem auditada por tipo de registro.
- `configuracoes` contem chaves tipadas editaveis em runtime.
- `db/init.sql` contem dump/schema inicial.
- `server.js` complementa a estrutura em runtime para manter compatibilidade.

### 4.3 Reconciliacao no bootstrap

Ao iniciar, o backend garante:

- tabela `setores`;
- colunas `setor_id`, `cpf`, `reset_senha_primeiro_acesso`;
- remocao de colunas legadas ligadas a CompreFace;
- tabela e indices de `usuarios_faces`;
- tabela e indices de `sessoes_autenticacao`;
- colunas de execucao em `sessoes`;
- tabela `tipos_sessao`;
- tabela `configuracoes` e seed das chaves padrao.

---

## 5. Fluxos importantes

### 5.1 Autenticacao

1. Usuario envia `usuario` e `senha` em `login.html`.
2. `login.js` chama `window.Auth.login()`.
3. Backend valida em `authService.login()`.
4. O token e retornado ao cliente.
5. O hash do token e persistido em `sessoes_autenticacao`.
6. Paginas protegidas chamam `requireAuth()`.
7. Se `reset_senha_primeiro_acesso=true`, o usuario e redirecionado para `alterar-senha.html`.

### 5.2 Registro facial de presenca

1. Usuario seleciona uma sessao.
2. `app.js` ou `sessao.js` acessa a camera.
3. MediaPipe Face Mesh calcula landmarks e EAR.
4. Apos piscada valida, uma imagem e enviada ao backend.
5. Backend consulta candidatos em `usuarios_faces`.
6. Backend chama `face-recognition`.
7. Backend gera imagem auditada com watermark quando possivel.
8. `presencaService.registrarBatidaFacial()` decide check-in/check-out.
9. Resposta retorna com status, horario, similaridade e mensagens operacionais.

### 5.3 Gestao de sessoes

- `POST /sessoes`: cria sessao do dia com nome automatico `DDMMAAAAHHMM`.
- `POST /sessoes/:id/iniciar`: inicia sessao.
- `POST /sessoes/:id/encerrar`: encerra sessao.
- `PATCH /sessoes/:id/checkout`: altera checkout habilitado.
- `GET /sessoes/:id/acompanhamento`: lista presencas reais da sessao.
- exports de acompanhamento geram PDF ou Excel.

### 5.4 Auditoria

- `registros.js` monta filtros.
- `auditoriaService.js` executa consulta SQL.
- imagens auditadas sao acessadas por `GET /auditoria/imagens/:presencaId`.
- `auditoriaExportService.js` gera PDF/Excel.
- `limite_exportacao` controla o volume maximo permitido.

### 5.5 Usuarios e colecao facial

- `usuarios.js` controla CRUD, filtros, setores, gestores e perfis.
- Cadastro pode enviar fotos junto com os dados.
- `usuarioFaceService.js` armazena fotos e embeddings.
- `GET /faces/:faceId/img` entrega a imagem facial ao admin.
- Exportacao ZIP inclui usuarios, hashes, metadados, fotos e embeddings.
- Importacao ZIP cria/atualiza usuarios e substitui faces dos usuarios importados.

---

## 6. Endpoints

### 6.1 Publicos

- `GET /health`
- `POST /auth/login`
- `POST /auth/bootstrap-admin` quando `ALLOW_BOOTSTRAP_ADMIN=true`
- `GET /config/publica`

### 6.2 Auth

- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/alterar-senha`

### 6.3 Presenca e auditoria

- `POST /reconhecer`
- `GET /presencas`
- `GET /auditoria/imagens/:presencaId`
- `GET /auditoria/registros`
- `GET /auditoria/registros/export/pdf`
- `GET /auditoria/registros/export/excel`

### 6.4 Sessoes

- `GET /sessoes`
- `POST /sessoes`
- `POST /sessoes/:id/iniciar`
- `POST /sessoes/:id/encerrar`
- `PATCH /sessoes/:id/checkout`
- `GET /sessoes/:id/acompanhamento`
- `GET /sessoes/:id/acompanhamento/export/pdf`
- `GET /sessoes/:id/acompanhamento/export/excel`

### 6.5 Usuarios

- `GET /setores`
- `GET /usuarios`
- `GET /usuarios/export`
- `POST /usuarios/import`
- `POST /usuarios`
- `PUT /usuarios/:id`
- `PATCH /usuarios/:id/perfil`
- `DELETE /usuarios/:id`
- `GET /usuarios/:id/face-collection`
- `POST /usuarios/:id/face-collection/fotos`
- `DELETE /usuarios/:id/face-collection`
- `DELETE /usuarios/:id/face-collection/:imageId`
- `GET /faces/:faceId/img`

### 6.6 Admin

- `GET /admin/configuracoes`
- `PUT /admin/configuracoes`
- `GET /tipos-sessao`
- `POST /tipos-sessao`
- `PUT /tipos-sessao/:id`
- `DELETE /tipos-sessao/:id`

---

## 7. Execucao e infraestrutura

### 7.1 Docker Compose

Servicos atuais no `docker-compose.yml`:

| Servico | Papel |
|---|---|
| `postgres` | Banco PostgreSQL da aplicacao. |
| `cloudflared` | Tunel Cloudflare quando `TUNNEL_TOKEN` esta configurado. |
| `face-recognition` | Motor facial interno. |
| `backend` | API Express. |
| `frontend` | Servidor estatico/proxy. |

Portas publicadas:

- `frontend`: `8080:8080`
- `postgres`: `55432:5432`

O backend nao publica porta no host pelo Compose atual. Ele fica disponivel para o frontend na rede interna como `http://backend:3000`.

### 7.2 Variaveis principais

Infra e app:

- `NODE_ENV`
- `PORT`
- `HOST`
- `APP_TIMEZONE`
- `TRUST_PROXY`
- `CORS_ORIGINS`
- `TUNNEL_TOKEN`

Banco:

- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_SCHEMA`

Auth:

- `AUTH_TOKEN_TTL_HOURS`
- `AUTH_PASSWORD_SALT`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_USER`
- `INITIAL_ADMIN_PASSWORD`
- `ALLOW_BOOTSTRAP_ADMIN`

Reconhecimento e limites:

- `FACE_RECOGNITION_URL`
- `FACE_RECOGNITION_THRESHOLD`
- `FACE_RECOGNITION_TIMEOUT_MS`
- `PRESENCE_COOLDOWN_MS`
- `RATE_LIMIT_AUTH_WINDOW_MS`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_RECOGNIZE_WINDOW_MS`
- `RATE_LIMIT_RECOGNIZE_MAX`

### 7.3 Comandos uteis

Subir stack:

```bash
docker compose up -d --build
```

Rodar backend local:

```bash
cd backend
npm install
npm run dev
```

Rodar frontend local:

```bash
cd frontend
npm install
node dev-server.js
```

Rodar servico facial local:

```bash
cd face-recognition
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Rodar testes do backend:

```bash
cd backend
npm test
```

Reprocessar embeddings faltantes:

```bash
cd backend
npm run faces:reprocess
```

---

## 8. Seguranca

### 8.1 Controles implementados

- `helmet()` global;
- CORS por allowlist;
- bloqueio de `CORS_ORIGINS=*` em producao;
- bloqueio de `ALLOW_BOOTSTRAP_ADMIN=true` em producao;
- rate limit para login;
- rate limit para reconhecimento facial;
- token Bearer com hash persistido;
- logout com revogacao;
- validacao de perfil por rota;
- upload em memoria com validacao de tipo de arquivo;
- senhas com PBKDF2.

### 8.2 Pontos sensiveis

- ZIP de exportacao de usuarios contem dados pessoais, hashes de senha, fotos e embeddings.
- Fotos faciais e imagens auditadas sao dados biometricos/sensiveis.
- `AUTH_PASSWORD_SALT`, senhas iniciais e credenciais de banco devem ser fortes e exclusivos por ambiente.
- O tunel Cloudflare deve apontar apenas para o frontend/proxy esperado.
- `CORS_ORIGINS` deve listar somente origens reais permitidas.

---

## 9. Configuracoes administrativas

Chaves atuais em `configService.DEFAULTS`:

- `checkout_obrigatorio`
- `min_checkout_intervalo_seg`
- `cooldown_entre_tentativas_ms`
- `limiar_similaridade`
- `ear_fechado`
- `ear_aberto`
- `area_minima_rosto`
- `frames_fechado_min`
- `frames_aberto_min`
- `atraso_pos_piscada_ms`
- `limite_exportacao`
- `ttl_token_horas`

Chaves publicas enviadas ao frontend sem autenticacao:

- `ear_fechado`
- `ear_aberto`
- `area_minima_rosto`
- `frames_fechado_min`
- `frames_aberto_min`
- `cooldown_entre_tentativas_ms`
- `atraso_pos_piscada_ms`

Essas chaves alimentam o comportamento de captura/piscada no navegador.

---

## 10. Pontos criticos de manutencao

### 10.1 Arquivos mais sensiveis

1. `backend/src/services/presencaService.js`
   - decide check-in/check-out, duplicidade, cooldown e regras por sessao.

2. `backend/src/services/authService.js`
   - controla login, sessoes, token, logout e troca de senha.

3. `backend/src/services/usuarioFaceService.js`
   - controla persistencia de faces e embeddings.

4. `backend/src/services/faceRecognitionService.js`
   - ponte com o motor facial interno.

5. `backend/server.js`
   - concentra reconciliacao estrutural do banco.

6. `frontend/scripts/auth.js`
   - controla sessao e autorizacao no cliente.

7. `frontend/scripts/app.js` e `frontend/scripts/sessao.js`
   - contem o fluxo de camera, piscada e envio de imagem.

### 10.2 Cuidados ao alterar

- Alteracoes de banco devem revisar `db/init.sql` e o bootstrap em `server.js`.
- Alteracoes no reconhecimento devem ser testadas com `face-recognition` ativo.
- Alteracoes em upload devem revisar imagens de faces, imagens auditadas e ZIP de importacao.
- Alteracoes em perfis devem revisar `routes/reconhecer.js` e as telas do frontend.
- Alteracoes em exportacao devem respeitar `limite_exportacao`.

---

## 11. Riscos e inconsistencias observadas

- O projeto ainda mistura schema inicial em `db/init.sql` com reconciliacao em runtime no `server.js`.
- `backend/package.json` declara `npm run migrate`, mas `backend/scripts/runMigrations.js` nao existe no workspace atual.
- A funcao legada `registrarPresenca()` ainda existe em `presencaService.js`, mas o fluxo ativo usa `registrarBatidaFacial()`.
- Ha comentarios antigos em alguns arquivos que mencionam contexto historico de desenvolvimento/tunel; eles nao devem ser lidos como dependencia de plataforma externa gerenciada.
- A aplicacao depende de MediaPipe via CDN nas telas de captura; ambientes sem acesso a esse CDN podem afetar a deteccao de piscada.
- Exportacoes grandes podem ter custo operacional relevante, apesar do limite configuravel.

---

## 12. Melhorias sugeridas

1. Consolidar evolucao de schema em um fluxo unico de migrations versionadas.
2. Remover ou ajustar scripts declarados que nao existem, como `npm run migrate`.
3. Remover codigo legado nao usado, especialmente caminhos antigos de presenca.
4. Ampliar cobertura de testes nos fluxos de auth, sessoes, import/export e presenca.
5. Padronizar logs estruturados para operacao self-hosted.
6. Documentar procedimento operacional de backup/restauracao do PostgreSQL e dos ZIPs sensiveis.
7. Avaliar hospedagem local dos assets MediaPipe se o ambiente precisar funcionar sem CDN externo.

---

## Anexo - Referencia rapida

### Backend

- `backend/server.js`: inicializacao e compatibilidade estrutural.
- `backend/src/routes/reconhecer.js`: rotas principais.
- `backend/src/controllers/reconhecerController.js`: handlers operacionais.
- `backend/src/controllers/adminController.js`: handlers administrativos.
- `backend/src/services/*.js`: regras de negocio e integracoes.
- `backend/tests/*.test.js`: testes existentes.

### Frontend

- `frontend/dev-server.js`: servidor/proxy.
- `frontend/index.html`: redirecionamento inicial.
- `frontend/pages/login.html`: login.
- `frontend/pages/alterar-senha.html`: troca obrigatoria de senha.
- `frontend/pages/dashboard.html`: visao operacional.
- `frontend/pages/sessoes.html`: gestao de sessoes.
- `frontend/pages/sessao.html`: operacao por sessao.
- `frontend/pages/registros.html`: auditoria.
- `frontend/pages/usuarios.html`: usuarios e colecao facial.
- `frontend/pages/configuracoes.html`: parametros administrativos.
- `frontend/pages/tipos-sessao.html`: tipos de sessao.

### Infra

- `docker-compose.yml`: orquestracao self-hosted.
- `db/init.sql`: schema/dump inicial.
- `face-recognition/app.py`: motor facial interno.

---

## Observacao final

Este manual descreve o estado atual da aplicacao no workspace. Deploy externo gerenciado, banco hospedado externo e autenticacao externa gerenciada nao fazem parte da arquitetura vigente deste projeto.
