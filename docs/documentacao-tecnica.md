# Documentacao Tecnica - Sistema Laboral (RPVP)

Documento tecnico atualizado de acordo com o estado atual do workspace em 16/07/2026.

---

## 1. Visao geral

Sistema web self-hosted para controle de presenca com reconhecimento facial, composto por:

- backend em Node.js + Express + PostgreSQL;
- frontend multipagina em HTML/CSS/JavaScript sem framework;
- servidor proprio do frontend para arquivos estaticos, proxy `/api` e injecao de configuracao runtime;
- banco PostgreSQL na propria stack Docker;
- servico interno `face-recognition` em Python/FastAPI, acessado pelo backend na rede Docker;
- validacao local de piscada com MediaPipe Face Mesh nas telas operacionais de captura;
- `cloudflared` no `docker-compose.yml` para exposicao por tunel quando configurado.

A aplicacao atual nao depende de plataforma externa gerenciada para deploy, banco, autenticacao ou storage. O estado atual e de execucao em infraestrutura propria com Docker Compose.

Principais capacidades implementadas:

- autenticacao Bearer com sessoes persistidas no PostgreSQL;
- troca obrigatoria de senha no primeiro acesso;
- criacao, inicio, encerramento, checkout e acompanhamento de sessoes;
- registro facial com logica de check-in/check-out por sessao;
- auditoria com filtros, imagem por registro e exportacao PDF/Excel;
- exportacao PDF/Excel do acompanhamento de sessoes;
- dashboard operacional com indicadores do dia;
- gestao de usuarios, setores, gestores, tipos de sessao e configuracoes administrativas;
- importacao/exportacao de usuarios em ZIP, incluindo faces e embeddings;
- gestao de colecao facial em tabela local `usuarios_faces`.

## 2. Estrutura do projeto

### 2.1 Raiz

- `docker-compose.yml`: sobe `postgres`, `cloudflared`, `face-recognition`, `backend` e `frontend`.
- `db/init.sql`: dump/schema inicial do PostgreSQL usado pelo container de banco.
- `README.md`: resumo operacional do projeto.
- `docs/`: documentacao funcional e tecnica.

### 2.2 Backend

- `backend/server.js`: bootstrap da API, seguranca HTTP, CORS, rate limits, rotas, validacao do banco e reconciliacao estrutural.
- `backend/src/config/env.js`: leitura, parse e validacao das variaveis de ambiente.
- `backend/src/config/database.js`: pool e acesso ao PostgreSQL.
- `backend/src/routes/reconhecer.js`: registro central de endpoints HTTP.
- `backend/src/controllers/reconhecerController.js`: handlers de auth, reconhecimento, sessoes, usuarios, auditoria e import/export.
- `backend/src/controllers/adminController.js`: handlers de configuracoes e tipos de sessao.
- `backend/src/services/`: regras de negocio, SQL, exportacoes, autenticacao, auditoria, sessoes, usuarios e integracao com o servico facial interno.
- `backend/src/middleware/auth.js`: autenticacao Bearer e autorizacao por perfil.
- `backend/src/middleware/upload.js`: uploads de imagem e ZIP de importacao.
- `backend/scripts/reprocessFaceEmbeddings.js`: rotina para preencher embeddings faltantes em faces ja importadas/cadastradas.
- `backend/tests/`: testes unitarios/servico existentes.

### 2.3 Frontend

- `frontend/dev-server.js`: servidor HTTP para arquivos estaticos, proxy de `/api` para o backend e injecao de `window.__LABORAL_API_BASE__`.
- `frontend/index.html`: redireciona para `pages/sessoes.html`.
- `frontend/pages/`: telas da aplicacao.
- `frontend/scripts/`: logica por modulo e autenticacao compartilhada.
- `frontend/components/`: layouts reutilizaveis.
- `frontend/styles/`: estilos base e especificos.
- `frontend/assets/`: imagens de marca e apoio visual.

Paginas presentes:

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

### 2.4 Servico facial

- `face-recognition/app.py`: API FastAPI com `/health`, `/encode` e `/recognize`.
- `face-recognition/requirements.txt`: dependencias Python (`fastapi`, `uvicorn`, `face_recognition`, `numpy`, `Pillow`, `python-multipart`).
- `face-recognition/Dockerfile`: imagem do motor facial interno.

## 3. Arquitetura e comportamento atual

### 3.1 Backend

Fluxo efetivo de inicializacao em `backend/server.js`:

1. carrega e valida variaveis de ambiente;
2. define timezone da aplicacao;
3. configura `trust proxy`;
4. aplica `helmet()` globalmente;
5. aplica rate limiting em `POST /auth/login` e `POST /reconhecer`;
6. configura CORS por allowlist definida em `CORS_ORIGINS`;
7. registra `express.json()` e log simples de requisicoes;
8. monta o roteador principal em `/`;
9. expoe `GET /health`;
10. valida a conexao com PostgreSQL;
11. garante tabelas, colunas, indices e sequencias complementares em runtime;
12. semeia configuracoes padrao;
13. sincroniza o admin inicial configurado via ambiente;
14. inicia a API em `HOST:PORT`.

Reconciliacoes estruturais feitas no bootstrap:

- criacao/ajuste de `setores`;
- adicao de `setor_id`, `cpf` e `reset_senha_primeiro_acesso` em `usuarios`;
- remocao de colunas legadas `subject_compreface` e `subject`;
- criacao de indice unico parcial para CPF;
- criacao/ajuste de `usuarios_faces`;
- criacao de indices para faces e embeddings;
- criacao de `sessoes_autenticacao`;
- limpeza de sessoes autenticadas expiradas ha mais de 7 dias;
- adicao de `inicio_efetivo_em`, `fim_efetivo_em`, `tipo_sessao` e `checkout_habilitado` em `sessoes`;
- criacao de `tipos_sessao` e migracao de tipos ja existentes em sessoes;
- criacao/seed de `configuracoes`.

### 3.2 Frontend

O frontend nao consome o backend por host fixo. O fluxo atual e:

1. `frontend/dev-server.js` serve os arquivos estaticos;
2. o mesmo servidor encaminha `/api/*` para `BACKEND_TARGET`;
3. a base de API injetada no navegador e, por padrao, `/api`;
4. `frontend/scripts/auth.js` persiste a sessao em `localStorage`;
5. cada pagina protegida chama `requireAuth()` para validar autenticacao, perfil e obrigacao de troca de senha.

### 3.3 Telas e modulos relevantes

- `dashboard.js`: consolida indicadores e consultas operacionais do dia.
- `sessoes.js`: lista sessoes, filtra sessoes ativas e cria novas sessoes.
- `sessao.js`: pagina operacional por sessao, com captura facial, acompanhamento, inicio/encerramento, checkout, exportacao e alternancia de camera em dispositivos moveis.
- `app.js`: fluxo operacional geral de reconhecimento facial com selecao de sessao.
- `registros.js`: filtros de auditoria, paginacao, exportacao e visualizacao de imagens auditadas.
- `usuarios.js`: CRUD de usuarios, setor/gestor, reset de senha, import/export ZIP e manutencao da colecao facial.
- `configuracoes.js`: edicao de configuracoes administrativas.
- `tipos-sessao.js`: gestao dedicada de tipos de sessao.

## 4. Banco de dados

Estruturas persistidas encontradas em `db/init.sql` e/ou garantidas no bootstrap:

- `usuarios`
- `usuarios_faces`
- `setores`
- `sessoes`
- `tipos_sessao`
- `presencas`
- `presencas_imagens`
- `configuracoes`
- `sessoes_autenticacao` (criada em runtime pelo backend)

Pontos importantes do modelo atual:

- `usuarios` contem `cpf`, `usuario`, `senha_hash`, `perfil_acesso`, `ativo`, `gestor_id`, `setor_id`, `ultimo_login_em` e `reset_senha_primeiro_acesso`.
- `usuarios_faces` armazena a imagem facial (`BYTEA`), `embedding` de 128 dimensoes e `content_type`.
- `sessoes` contem `tipo_sessao`, `checkout_habilitado`, `inicio_efetivo_em` e `fim_efetivo_em`.
- `presencas` grava `check_in_em` e `check_out_em` no mesmo registro.
- `presencas_imagens` guarda a foto auditada em `BYTEA` com `tipo_registro` (`checkin` ou `checkout`).
- `configuracoes` guarda chaves tipadas editaveis em runtime.
- `sessoes_autenticacao` persiste o hash SHA-256 do token, expiracao e revogacao de sessoes.

## 5. Seguranca

### 5.1 Autenticacao da aplicacao

- login em `POST /auth/login`;
- token Bearer retornado ao frontend e persistido em `localStorage`;
- backend armazena apenas o hash do token em `sessoes_autenticacao`;
- logout revoga a sessao via `revogado_em`;
- `GET /auth/me` revalida o usuario no banco;
- quando `reset_senha_primeiro_acesso=true`, o usuario fica restrito ao fluxo de troca de senha;
- senhas usam PBKDF2 via `cryptoService.js`.

### 5.2 Seguranca HTTP

- `helmet()` habilitado globalmente;
- rate limit dedicado para autenticacao;
- rate limit dedicado para reconhecimento facial;
- CORS por allowlist, com bloqueio explicito de `*` em producao;
- validacao obrigatoria de variaveis sensiveis no startup;
- backend nao expoe diretamente a porta no host pelo Compose atual.

### 5.3 Arquivos sensiveis

- exportacao de usuarios gera ZIP com `usuarios.json`, hashes de senha e imagens faciais;
- importacao de usuarios substitui a colecao facial dos usuarios importados;
- esses arquivos devem ser tratados como sensiveis e armazenados/transmitidos apenas por canais controlados.

### 5.4 O que nao faz parte do estado atual

- nao ha plataforma externa gerenciada como dependencia de deploy;
- nao ha BaaS externo como banco, Auth, Storage ou API;
- nao ha middleware de HTTP Basic Auth no backend;
- nao ha gate de Basic Auth no frontend;
- a autenticacao nao e volatil em memoria.

## 6. Endpoints atuais

Base real do backend: rotas registradas diretamente em `/`.

Base usada pelo navegador: o frontend consome via proxy `/api`, removido pelo `frontend/dev-server.js` antes de encaminhar ao backend.

### 6.1 Publicos

- `GET /health`
- `POST /auth/login`
- `POST /auth/bootstrap-admin` (somente quando `ALLOW_BOOTSTRAP_ADMIN=true`)
- `GET /config/publica`

### 6.2 Autenticados

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

### 6.5 Usuarios, setores e colecao facial

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

### 6.6 Administracao

- `GET /admin/configuracoes`
- `PUT /admin/configuracoes`
- `GET /tipos-sessao`
- `POST /tipos-sessao`
- `PUT /tipos-sessao/:id`
- `DELETE /tipos-sessao/:id`

## 7. Regras de negocio principais

### 7.1 Reconhecimento e presenca facial

Fluxo atual:

1. o frontend captura imagem apos detectar piscada;
2. envia `multipart/form-data` para `POST /reconhecer` com `file`, `sessaoId` e `tipoRegistro`;
3. o backend carrega candidatos de `usuarios_faces`;
4. o backend envia a imagem e candidatos ao servico interno `face-recognition`;
5. tenta gerar imagem auditada com watermark do tipo/nome da sessao;
6. `presencaService.registrarBatidaFacial()` decide o resultado final.

Regras vigentes:

- exige `sessaoId` valido;
- bloqueia registros em sessao encerrada;
- inicia `inicio_efetivo_em` automaticamente no primeiro registro, se necessario;
- `tipoRegistro=auto` alterna para `checkout` quando a sessao permite checkout e ja existe check-in aberto;
- checkout respeita `min_checkout_intervalo_seg`;
- sessao sem checkout habilitado bloqueia duplicidade na propria sessao;
- sessao sem checkout habilitado tambem bloqueia duplicidade no mesmo dia para outra sessao do mesmo `tipo_sessao`;
- imagens de auditoria sao gravadas por `tipo_registro`.

### 7.2 Motor facial interno

O servico `face-recognition`:

- roda em FastAPI;
- expoe `GET /health`;
- expoe `POST /encode` para gerar embedding de uma imagem;
- expoe `POST /recognize` para comparar uma imagem contra candidatos enviados pelo backend;
- valida exatamente uma face por imagem;
- usa embeddings de 128 dimensoes;
- usa tolerancia configurada por `limiar_similaridade` ou fallback `FACE_RECOGNITION_THRESHOLD`.

### 7.3 Sessoes

Regras ativas em `sessaoService`:

- criacao gera nome automatico no formato `DDMMAAAAHHMM`;
- a data da sessao e sempre o dia local em `America/Sao_Paulo`;
- tipo de sessao precisa existir e estar ativo;
- apenas `admin` e o instrutor responsavel podem iniciar, encerrar ou alterar checkout da sessao;
- nao e possivel encerrar antes de iniciar;
- `GET /sessoes?ativo=true` retorna sessoes sem `fim_efetivo_em`;
- acompanhamento usa os registros reais de presenca, sem dependencia de convocacoes.

### 7.4 Usuarios, setores e import/export

Regras ativas:

- valida perfil, login/usuario, CPF e senha minima;
- cria setores sob demanda a partir do nome informado;
- valida que `gestor_id` aponte para usuario com perfil `gestor`;
- permite resetar obrigacao de troca de senha no primeiro acesso;
- cadastro de usuario pode receber ate 10 fotos;
- exportacao de usuarios gera ZIP com manifest `usuarios.json`, fotos e embeddings;
- importacao aceita ZIP exportado pelo proprio sistema, cria/atualiza usuarios e substitui faces dos usuarios importados;
- rotina `faces:reprocess` pode preencher embeddings ausentes.

### 7.5 Configuracoes administrativas

Chaves definidas em `configService.DEFAULTS`:

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

Chaves publicas expostas em `GET /config/publica`:

- `ear_fechado`
- `ear_aberto`
- `area_minima_rosto`
- `frames_fechado_min`
- `frames_aberto_min`
- `cooldown_entre_tentativas_ms`
- `atraso_pos_piscada_ms`

## 8. Execucao self-hosted

### 8.1 Docker Compose

Servicos atuais:

- `postgres`: banco PostgreSQL criado a partir de `db/Dockerfile` e `db/init.sql`;
- `cloudflared`: tunel Cloudflare, dependente de `TUNNEL_TOKEN`;
- `face-recognition`: motor facial interno em FastAPI, porta interna 8000 exposta apenas na rede Docker;
- `backend`: API Node.js, porta interna 3000;
- `frontend`: servidor estatico/proxy, porta 8080 publicada no host.

Mapeamentos publicados no host:

- `frontend`: `8080:8080`
- `postgres`: `55432:5432`

Observacoes:

- no Compose atual o backend nao publica `ports`; ele e acessado pelo frontend via rede interna Docker (`http://backend:3000`);
- o `cloudflared` nao substitui a aplicacao, apenas fornece o tunel quando configurado;
- o projeto nao contem artefatos de deploy para plataforma externa gerenciada;
- o banco usado pela aplicacao e o PostgreSQL da propria stack.

### 8.2 Variaveis de ambiente principais

Variaveis obrigatorias ou relevantes:

- `TUNNEL_TOKEN`
- `FACE_RECOGNITION_URL`
- `FACE_RECOGNITION_THRESHOLD`
- `FACE_RECOGNITION_TIMEOUT_MS`
- `NODE_ENV`
- `PORT`
- `HOST`
- `APP_TIMEZONE`
- `TRUST_PROXY`
- `CORS_ORIGINS`
- `AUTH_TOKEN_TTL_HOURS`
- `AUTH_PASSWORD_SALT`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_USER`
- `INITIAL_ADMIN_PASSWORD`
- `ALLOW_BOOTSTRAP_ADMIN`
- `PRESENCE_COOLDOWN_MS`
- `RATE_LIMIT_AUTH_WINDOW_MS`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_RECOGNIZE_WINDOW_MS`
- `RATE_LIMIT_RECOGNIZE_MAX`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_SCHEMA`

### 8.3 Execucao local sem Docker

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
node dev-server.js
```

Servico facial:

```bash
cd face-recognition
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Observacao: a execucao local do frontend depende do `dev-server.js` para servir arquivos e fazer proxy de `/api`. Servir a pasta `frontend/` como estatico puro nao reproduz o comportamento padrao da aplicacao.

## 9. Dependencias relevantes

### 9.1 Backend

Dependencias de runtime:

- `express`
- `cors`
- `helmet`
- `express-rate-limit`
- `dotenv`
- `pg`
- `axios`
- `multer`
- `form-data`
- `sharp`
- `pdfkit`
- `exceljs`
- `jszip`

Dependencia de desenvolvimento:

- `nodemon`

### 9.2 Frontend

- navegador sem framework;
- servidor frontend declara `dotenv`;
- MediaPipe Face Mesh e carregado via CDN nas telas de captura;
- APIs nativas do navegador: `fetch`, `FormData`, `localStorage`, `getUserMedia`.

### 9.3 Face-recognition

- `fastapi`
- `uvicorn[standard]`
- `python-multipart`
- `numpy`
- `face_recognition`
- `Pillow`

## 10. Testes e comandos uteis

Backend:

```bash
cd backend
npm test
```

Reprocessar embeddings:

```bash
cd backend
npm run faces:reprocess
```

Build self-hosted:

```bash
docker compose build
docker compose up -d
```

## 11. Observacoes tecnicas

- A fonte de verdade de autenticacao e `sessoes_autenticacao`.
- O projeto nao usa ORM; o acesso ao banco e feito por SQL direto nos services.
- A evolucao estrutural ocorre por `db/init.sql` e reconciliacao no bootstrap do backend.
- `backend/package.json` ainda declara `npm run migrate`, mas `backend/scripts/runMigrations.js` nao existe no workspace atual.
- A funcao legada `registrarPresenca` em `presencaService` existe, mas o endpoint `/reconhecer` usa `registrarBatidaFacial`.
- Existem testes em `backend/tests`, portanto a documentacao nao deve afirmar ausencia total de testes automatizados.
- Comentarios antigos em alguns arquivos podem falar em tunel/desenvolvimento, mas o estado operacional documentado aqui e self-hosted via Docker Compose.
