# Documentacao Tecnica - Sistema Laboral (RPVP)

## 1. Visao geral

Sistema web para controle de presenca com reconhecimento facial, composto por:

- backend em Node.js + Express + PostgreSQL;
- frontend em HTML/CSS/JavaScript sem framework, servido por um dev-server proprio;
- reconhecimento facial por servico interno `face-recognition`, acessado apenas pelo backend na rede Docker;
- validacao local de piscada com MediaPipe Face Mesh nas telas operacionais de captura.

Principais capacidades implementadas atualmente:

- autenticacao Bearer com sessoes persistidas no banco de dados;
- troca obrigatoria de senha no primeiro acesso;
- criacao, inicio, encerramento e acompanhamento de sessoes;
- registro facial com logica de check-in/check-out por sessao;
- auditoria com filtros, imagem por registro e exportacao PDF/Excel;
- dashboard operacional com indicadores do dia;
- gestao de usuarios, setores, tipos de sessao e configuracoes administrativas;
- gestao de colecao facial para cadastro e manutencao de fotos.

## 2. Estrutura do projeto

### 2.1 Raiz

- `docker-compose.yml`: sobe `postgres`, `backend` e `frontend`.
- `db/init.sql`: schema inicial do banco usado no container Postgres.
- `docs/`: documentacao funcional e tecnica.

### 2.2 Backend

- `backend/server.js`: bootstrap da API, seguranca HTTP, CORS, rate limit, rotas, validacao do banco e reconciliacao estrutural.
- `backend/src/config/env.js`: leitura e validacao das variaveis de ambiente.
- `backend/src/config/database.js`: pool e acesso ao PostgreSQL.
- `backend/src/routes/reconhecer.js`: registro central de endpoints HTTP.
- `backend/src/controllers/`: handlers HTTP por dominio (`reconhecerController.js`, `adminController.js`).
- `backend/src/services/`: regras de negocio, exportacoes, autenticacao, auditoria, sessoes, usuarios e integracao com o servico facial interno.
- `backend/src/middleware/`: autenticacao/autorizacao e upload multipart.

### 2.3 Frontend

- `frontend/dev-server.js`: servidor HTTP para arquivos estaticos, proxy de `/api` para o backend e injecao de `window.__LABORAL_API_BASE__`.
- `frontend/index.html`: redireciona para `pages/sessoes.html`.
- `frontend/pages/`: telas da aplicacao.
- `frontend/scripts/`: logica por modulo e autenticacao compartilhada.
- `frontend/components/`: layouts reutilizaveis.
- `frontend/styles/`: estilos base e especificos.

Paginas atualmente presentes no frontend:

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

## 3. Arquitetura e comportamento atual

### 3.1 Backend

Fluxo efetivo de inicializacao em `backend/server.js`:

1. carrega e valida variaveis de ambiente;
2. configura `trust proxy`;
3. aplica `helmet()` globalmente;
4. aplica rate limiting em `POST /auth/login` e `POST /reconhecer`;
5. configura CORS por allowlist definida em `CORS_ORIGINS`;
6. registra `express.json()` e log simples de requisicoes;
7. monta o roteador principal em `/`;
8. expoe `GET /health`;
9. valida a conexao com PostgreSQL;
10. garante tabelas, colunas e indices complementares em runtime;
11. semeia configuracoes padrao e sincroniza o admin inicial configurado via ambiente.

Reconciliacoes estruturais feitas no bootstrap:

- criacao da tabela `setores` quando ausente;
- adicao de `setor_id`, `cpf` e `reset_senha_primeiro_acesso` em `usuarios`;
- criacao de indice unico parcial para CPF;
- criacao da tabela `sessoes_autenticacao` e indices de apoio;
- adicao de `inicio_efetivo_em`, `fim_efetivo_em`, `tipo_sessao` e `checkout_habilitado` em `sessoes`;
- criacao da tabela `tipos_sessao` e migracao dos tipos ja existentes em sessoes;
- criacao da tabela `configuracoes`.

### 3.2 Frontend

O frontend nao consome o backend diretamente por host fixo. O fluxo atual e:

1. `frontend/dev-server.js` serve os arquivos estaticos;
2. o mesmo servidor encaminha `/api/*` para o backend configurado em `BACKEND_TARGET`;
3. a base de API injetada no navegador e, por padrao, `/api`;
4. `frontend/scripts/auth.js` persiste a sessao em `localStorage` e centraliza redirecionamentos;
5. cada pagina chama `requireAuth()` para validar autenticacao, perfil e obrigacao de troca de senha.

### 3.3 Telas e modulos relevantes

- `dashboard.js`: consolida indicadores e consultas operacionais do dia.
- `sessoes.js`: lista sessoes, filtra sessoes ativas e cria novas sessoes.
- `sessao.js`: pagina operacional por sessao, com captura facial, acompanhamento, controle de inicio/encerramento, exportacao e alternancia de camera em dispositivos moveis.
- `app.js`: pagina operacional geral de reconhecimento facial com selecao de sessao.
- `registros.js`: filtros de auditoria, exportacao e visualizacao de imagens auditadas.
- `usuarios.js`: CRUD de usuarios, setor/gestor, reset de senha e manutencao da colecao facial.
- `configuracoes.js`: edicao de configuracoes administrativas e manutencao de tipos de sessao.
- `tipos-sessao.js`: gestao dedicada de tipos de sessao.

## 4. Banco de dados

Estruturas persistidas encontradas em `db/init.sql` e/ou garantidas no bootstrap do backend:

- `usuarios`
- `setores`
- `sessoes`
- `tipos_sessao`
- `presencas`
- `presencas_imagens`
- `configuracoes`
- `sessoes_autenticacao` (criada em runtime pelo backend)

Pontos importantes do modelo atual:

- `usuarios` contem `cpf`, `usuario`, `senha_hash`, `perfil_acesso`, `ativo`, `gestor_id`, `setor_id`, `ultimo_login_em`, `reset_senha_primeiro_acesso` e o identificador de reconhecimento facial.
- `sessoes` contem `tipo_sessao`, `checkout_habilitado`, `inicio_efetivo_em` e `fim_efetivo_em`.
- `presencas` grava `check_in_em` e `check_out_em` no mesmo registro.
- `presencas_imagens` guarda a foto em `BYTEA` com `tipo_registro` (`checkin` ou `checkout`).
- `configuracoes` guarda chaves tipadas editaveis em runtime.
- `sessoes_autenticacao` persiste o hash SHA-256 do token, expiracao e revogacao de sessoes.

## 5. Seguranca

### 5.1 Autenticacao da aplicacao

- login em `POST /auth/login`;
- token Bearer retornado ao frontend e persistido em `localStorage`;
- backend armazena apenas o hash do token em `sessoes_autenticacao`;
- logout revoga a sessao via `revogado_em`;
- `GET /auth/me` revalida o usuario no banco a cada uso relevante;
- quando `reset_senha_primeiro_acesso=true`, o usuario fica restrito ao fluxo de troca de senha.

### 5.2 Seguranca HTTP

- `helmet()` habilitado globalmente;
- rate limit dedicado para autenticacao;
- rate limit dedicado para reconhecimento facial;
- CORS por allowlist, com bloqueio explicito de `*` em producao;
- validacao obrigatoria de variaveis sensiveis no startup.

### 5.3 O que nao faz mais parte da aplicacao atual

- nao ha middleware de HTTP Basic Auth no backend;
- nao ha gate de Basic Auth no frontend;
- a autenticacao nao e mais volatil em memoria.

## 6. Endpoints atuais

Base: o backend registra rotas diretamente em `/`, e o frontend as consome via proxy `/api`.

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
3. o backend envia a imagem ao servico interno `face-recognition`;
4. tenta gerar imagem auditada com watermark do tipo/nome da sessao;
5. `presencaService.registrarBatidaFacial()` decide o resultado final.

Regras vigentes em `presencaService`:

- exige `sessaoId` valido;
- bloqueia registros em sessao encerrada;
- inicia `inicio_efetivo_em` automaticamente no primeiro registro, se necessario;
- `tipoRegistro=auto` alterna para `checkout` quando a sessao permite checkout e ja existe check-in aberto;
- checkout respeita `min_checkout_intervalo_seg` em configuracoes;
- sessao sem checkout habilitado bloqueia duplicidade na propria sessao;
- sessao sem checkout habilitado tambem bloqueia duplicidade no mesmo dia para outra sessao do mesmo `tipo_sessao`;
- imagens de auditoria sao gravadas por `tipo_registro`.

### 7.2 Sessoes

Regras ativas em `sessaoService`:

- criacao gera nome automatico no formato `DDMMAAAAHHMM`;
- a data da sessao e sempre o dia local em `America/Sao_Paulo`;
- apenas `admin` e o instrutor responsavel podem iniciar, encerrar ou alterar checkout da sessao;
- nao e possivel encerrar antes de iniciar;
- `GET /sessoes?ativo=true` retorna sessoes sem `fim_efetivo_em`;
- acompanhamento usa os registros reais de presenca, sem dependencia de convocacoes.

### 7.3 Usuarios e setores

Regras ativas em `usuarioService`:

- valida perfil, login/usuario, CPF e senha minima;
- cria setores sob demanda a partir do nome informado no cadastro/edicao;
- valida que `gestor_id` aponte para usuario com perfil `gestor`;
- permite resetar obrigacao de troca de senha no primeiro acesso;
- usa `nome_completo` como identificador facial padrao, salvo override explicito.

### 7.4 Configuracoes administrativas

Chaves definidas em `configService.DEFAULTS`:

- `checkout_obrigatorio`
- `min_checkout_intervalo_seg`
- `cooldown_entre_tentativas_ms`
- `limiar_similaridade`: distancia maxima aceita pelo `face_recognition` (0.30 a 0.80, padrao 0.60)
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

## 8. Execucao e deploy

### 8.1 Docker Compose

Servicos atuais:

- `postgres` com imagem `postgres:16`;
- `backend` em Node 20 (`node:20-bookworm-slim`), porta interna 3000;
- `frontend` em Node 20 (`node:20-alpine`), porta 8080.

Mapeamentos publicados:

- `frontend`: `8080:8080`
- `postgres`: `55433:5432`

Observacao: no compose atual o backend nao publica `ports`; ele e acessado pelo frontend via rede interna Docker (`http://backend:3000`).

### 8.2 Integracao Docker com face-recognition

O `docker-compose.yml` sobe o servico interno `face-recognition` na mesma rede do backend. O backend o acessa por `FACE_RECOGNITION_URL`, cujo valor padrao no Compose e `http://face-recognition:8000`; nao ha dependencia de uma rede Docker externa.

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

Observacao importante: a execucao local atual do frontend depende do `dev-server.js` para servir arquivos e fazer proxy de `/api`. Servir a pasta `frontend/` como estatico puro nao reproduz o comportamento padrao da aplicacao.

## 9. Dependencias relevantes

### 9.1 Backend

Dependencias de runtime atualmente declaradas:

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

Dependencia de desenvolvimento:

- `nodemon`

### 9.2 Frontend

- o frontend em navegador nao usa framework;
- o servidor frontend declara `dotenv` em `package.json`;
- MediaPipe Face Mesh e carregado via CDN nas telas de captura.

## 10. Observacoes tecnicas

- A fonte de verdade de autenticacao e a tabela `sessoes_autenticacao`; comentarios antigos em codigo ainda mencionam sessao em memoria, mas nao refletem mais o comportamento real.
- O projeto continua sem pasta de migrations versionadas no workspace; a evolucao estrutural ocorre por `db/init.sql` e reconciliacao no bootstrap do backend.
- `backend/package.json` declara o script `npm run migrate`, mas nao existe `backend/scripts/runMigrations.js` no workspace atual.
- Existe uma funcao legada `registrarPresenca` em `presencaService` com referencia a `data` antes da declaracao; a regra efetivamente usada hoje pelo endpoint `/reconhecer` e `registrarBatidaFacial`.

---

Documento atualizado com base no codigo presente no workspace em 27/04/2026.
