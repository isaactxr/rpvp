# Manual Técnico Completo — Sistema Laboral (RPVP)

> Documento consolidado para desenvolvedores com base na documentação já gerada e nos arquivos do workspace analisados.
>
> Quando alguma informação não pôde ser confirmada diretamente no código, ela foi marcada como **Não identificado claramente**.

---

## 1. Visão Geral do Sistema

### 1.1 Objetivo do sistema

O sistema identificado no workspace tem como objetivo realizar **registro de presença com reconhecimento facial**, com suporte a autenticação de usuários, gestão de sessões, auditoria dos registros, administração de usuários e parametrização operacional.

### 1.2 Principais funcionalidades

Com base nos arquivos analisados, foram identificadas as seguintes funcionalidades principais:

- login com sessão autenticada por token;
- troca obrigatória de senha no primeiro acesso;
- verificação facial com câmera do navegador e detecção de piscada;
- reconhecimento facial pelo servico interno `face-recognition`;
- criação, acompanhamento, início e encerramento de sessões;
- controle de presença com `check-in` e `check-out` por sessão;
- auditoria de registros com filtros e exportação em PDF/Excel;
- cadastro e manutenção de usuários;
- gerenciamento da coleção facial dos usuários;
- configuração de parâmetros do sistema sem reiniciar o backend.

### 1.3 Tecnologias utilizadas

Somente tecnologias claramente identificadas no código:

#### Backend
- `Node.js`
- `Express`
- `PostgreSQL` com `pg`
- `dotenv`
- `helmet`
- `express-rate-limit`
- `multer`
- `axios`
- `sharp`
- `pdfkit`
- `exceljs`

#### Frontend
- `HTML`
- `CSS`
- `JavaScript` puro (sem framework identificado)
- `MediaPipe Face Mesh` via CDN

#### Integrações internas
- `face-recognition` para reconhecimento facial

---

## 2. Arquitetura do Sistema

### 2.1 Descrição da arquitetura

A arquitetura observada é compatível com um **monólito web em camadas**, composto por:

- **frontend estático** com múltiplas páginas HTML e scripts específicos por tela;
- **backend HTTP** centralizado em Express;
- **camada de serviços** responsável pelas regras de negócio e acesso a banco/integrações;
- **PostgreSQL** como persistência principal;
- **face-recognition** como serviço interno de reconhecimento facial, acessado apenas pelo backend na rede Docker.

Não foi identificada uma camada formal de `models/` ou ORM. O acesso aos dados é feito diretamente por SQL na camada `services`.

### 2.2 Separação de responsabilidades

| Camada | Responsabilidade |
|---|---|
| `frontend/pages` | Estrutura visual de cada tela. |
| `frontend/scripts` | Comportamento de UI, chamadas HTTP e controle do estado da página. |
| `backend/src/routes` | Registro dos endpoints e aplicação dos middlewares. |
| `backend/src/controllers` | Conversão entre HTTP e regras de negócio. |
| `backend/src/services` | Regras de negócio, SQL, exportação, autenticação e integrações externas. |
| `backend/src/middleware` | Autenticação/autorização e upload de arquivos. |
| `backend/src/config` | Ambiente e conexão com banco. |
| `db/init.sql` + bootstrap do `server.js` | Estrutura inicial e compatibilidade evolutiva do banco. |

### 2.3 Fluxo geral de funcionamento

De forma consolidada, o fluxo observado é:

1. o frontend autentica o usuário e armazena o token em `localStorage`;
2. páginas protegidas usam `window.Auth.requireAuth()` para validar sessão e perfil;
3. o backend recebe chamadas HTTP e passa por middlewares de autenticação e upload quando necessário;
4. os controllers delegam a lógica aos services;
5. os services acessam o banco com SQL direto e, quando necessario, chamam o servico interno `face-recognition`;
6. as respostas retornam ao frontend para atualização da interface.

---

## 3. Estrutura do Projeto

### 3.1 Organização de pastas

```text
backend/
  server.js
  src/
    config/
    controllers/
    middleware/
    routes/
    services/

frontend/
  index.html
  pages/
  scripts/
  styles/
  assets/

docs/
  documentacao-tecnica.md
  manual-tecnico-completo.md
```

### 3.2 Responsabilidade de cada diretório

| Diretório | Responsabilidade |
|---|---|
| `backend/` | API, regras de negócio, integrações e persistência. |
| `backend/src/config/` | Configuração de ambiente e pool do PostgreSQL. |
| `backend/src/controllers/` | Handlers HTTP da aplicação. |
| `backend/src/services/` | Núcleo funcional do sistema. |
| `backend/src/middleware/` | Segurança e upload. |
| `backend/src/routes/` | Mapeamento das rotas. |
| `frontend/pages/` | Telas internas e públicas. |
| `frontend/scripts/` | Lógica de cada módulo do frontend. |
| `frontend/styles/` | Estilos compartilhados e específicos. |
| `db/` | Estrutura inicial do banco. |
| `docs/` | Documentação consolidada do sistema. |

### 3.3 Relação entre os módulos

- `pages/*.html` carregam scripts específicos em `frontend/scripts/`.
- `frontend/scripts/auth.js` é o módulo compartilhado entre as telas autenticadas.
- `backend/src/routes/reconhecer.js` é o ponto central de roteamento do backend.
- `reconhecerController.js` e `adminController.js` distribuem as requisições para services especializados.
- os services se conectam entre si por composição, por exemplo:
  - `reconhecerController` → `faceRecognitionService` + `presencaService` + `auditImageService`;
  - `adminController` → `configService` + `tipoSessaoService`.

---

## 4. Principais Componentes

### 4.1 Configuração (`backend/src/config`)

#### Responsabilidade
Carregar o ambiente, validar variáveis obrigatórias e criar o pool PostgreSQL.

#### Como funciona
- `env.js` carrega `.env`, define timezone e valida chaves obrigatórias.
- `database.js` expõe `query()`, `getClient()` e `validarConexao()`.

#### Como se conecta
Todos os serviços que consultam o banco dependem de `database.js`.

---

### 4.2 Middlewares (`backend/src/middleware`)

#### Responsabilidade
Aplicar segurança de acesso e validação de uploads.

#### Como funciona
- `auth.js` extrai o token Bearer, valida a sessão ativa e autoriza por perfil.
- `upload.js` usa `multer.memoryStorage()` e restringe tipos de imagem.

#### Como se conecta
São aplicados no arquivo de rotas antes da execução dos controllers.

---

### 4.3 Rotas (`backend/src/routes`)

#### Responsabilidade
Registrar os endpoints HTTP do sistema.

#### Como funciona
O arquivo `reconhecer.js` centraliza as rotas por domínio:

- autenticação;
- reconhecimento facial;
- presenças/auditoria;
- sessões;
- usuários;
- configurações e tipos de sessão.

#### Como se conecta
Encaminha cada rota para `reconhecerController` ou `adminController`, aplicando `autenticar`, `autorizar`, `upload` e `tratarErroUpload` quando necessário.

---

### 4.4 Controllers (`backend/src/controllers`)

#### Responsabilidade
Traduzir HTTP em chamadas de negócio e formatar as respostas JSON.

#### Como funciona
- `reconhecerController.js` concentra os handlers operacionais.
- `adminController.js` trata configurações administrativas e tipos de sessão.

#### Como se conecta
Recebe a requisição já validada pelos middlewares e delega a maior parte das regras aos `services`.

---

### 4.5 Services (`backend/src/services`)

#### Responsabilidade
Implementar as regras de negócio do sistema.

#### Como funciona
Os services identificados são:

| Serviço | Função principal |
|---|---|
| `authService.js` | login, bootstrap de admin, persistência/revogação de sessões autenticadas e alteração de senha. |
| `cryptoService.js` | hash e verificação de senha via PBKDF2. |
| `presencaService.js` | check-in/check-out, regras de presença e auditoria de imagem. |
| `sessaoService.js` | criação e controle de sessões. |
| `usuarioService.js` | CRUD de usuários, perfis, gestores e setores. |
| `configService.js` | armazenamento e cache das configurações do sistema. |
| `tipoSessaoService.js` | CRUD do catálogo de tipos de sessão. |
| `auditoriaService.js` | consulta filtrada e paginada da trilha histórica. |
| `auditoriaExportService.js` | exportação da auditoria para PDF e Excel. |
| `auditImageService.js` | inserção de watermark em imagem de auditoria. |
| `faceRecognitionService.js` | comunicação com o serviço interno de reconhecimento facial. |

#### Como se conecta
Os services são chamados pelos controllers e compartilham `database.js` e, em alguns casos, outros services auxiliares.

---

### 4.6 Frontend (`frontend/pages`, `frontend/scripts`, `frontend/styles`)

#### Responsabilidade
Fornecer a interface operacional e administrativa do sistema.

#### Como funciona
- cada tela HTML carrega seu script dedicado;
- `auth.js` centraliza autenticação, sessão e chamadas autenticadas;
- o módulo `app.js` executa o fluxo de reconhecimento facial;
- as folhas de estilo são compartilhadas entre as áreas internas e públicas.

#### Como se conecta
O frontend consome a API do backend via `fetch`, normalmente por meio de `window.Auth.apiJson()` ou `window.Auth.authFetch()`.

---

## 5. Fluxos Importantes do Sistema

### 5.1 Autenticação

Fluxo claramente identificado:

1. usuário preenche `usuario` e `senha` em `login.html`;
2. `login.js` chama `window.Auth.login()`;
3. o backend valida a credencial em `authService.login()`;
4. o token é armazenado no navegador e seu hash é persistido no banco em `sessoes_autenticacao`;
5. ao acessar telas protegidas, `requireAuth()` valida sessão e perfil;
6. se `reset_senha_primeiro_acesso=true`, o acesso é redirecionado para `alterar-senha.html`.

### 5.2 Registro facial de presença

Fluxo claramente identificado:

1. o usuário acessa a tela operacional de presença e seleciona uma sessão;
2. `app.js` ou `sessao.js` captura a câmera e processa os landmarks faciais;
3. a piscada é detectada pelo cálculo de `EAR`;
4. uma imagem é capturada e enviada ao backend;
5. o backend consulta o serviço interno `face-recognition` e tenta gerar a imagem de auditoria;
6. `presencaService.registrarBatidaFacial()` decide se o evento será `check-in` ou `check-out`;
7. o resultado volta ao frontend com mensagem operacional.

### 5.3 Gestão de sessões

Fluxo identificado:

- criação de sessão via `POST /sessoes`;
- início efetivo via `POST /sessoes/:id/iniciar`;
- encerramento efetivo via `POST /sessoes/:id/encerrar`;
- consulta de acompanhamento via `GET /sessoes/:id/acompanhamento`.

### 5.4 Auditoria e exportação

Fluxo identificado:

- filtros são montados no frontend em `registros.js`;
- `auditoriaService.js` executa a consulta SQL;
- os resultados podem ser exportados por `auditoriaExportService.js` em PDF e Excel.

### 5.5 Gestão de usuários e coleção facial

Fluxo identificado:

- cadastro/edição de usuários em `usuarios.js`;
- persistência em `usuarioService.js`;
- envio, consulta e remoção de fotos pela coleção facial do usuário;
- processamento das fotos pelo serviço interno `face-recognition`.

---

## 6. Padrões e Convenções

### 6.1 Padrões de código identificados

- uso recorrente de `'use strict'`;
- separação entre `routes`, `controllers` e `services`;
- tratamento de erros com respostas JSON padronizadas;
- uso de `async/await` para chamadas assíncronas;
- SQL escrito diretamente na camada de serviço;
- frontend organizado por tela, sem framework SPA identificado.

### 6.2 Convenções de nomenclatura

Padrões observados no código:

- **backend / banco:** forte uso de `snake_case` (`perfil_acesso`, `check_in_em`, `tipo_sessao`);
- **frontend / JS:** nomes em `camelCase` (`carregarDados`, `carregarUsuarios`, `getRedirectTarget`);
- arquivos seguem nomes funcionais diretos (`usuarios.js`, `sessoes.js`, `reconhecerController.js`).

### 6.3 Padrões arquiteturais

Padrões evidentes:

- backend em camadas;
- frontend multipágina com scripts independentes;
- módulo compartilhado de autenticação no cliente;
- centralização das regras mais sensíveis na camada de services.

Não foi identificada claramente a adoção formal de DDD, Clean Architecture ou outro padrão mais rígido.

---

## 7. Dependências e Integrações

### 7.1 Bibliotecas e frameworks identificados

#### Backend
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
- `nodemon` (desenvolvimento)

#### Frontend
- `MediaPipe Face Mesh` via CDN
- APIs nativas do navegador (`fetch`, `FormData`, `localStorage`, `getUserMedia`)

### 7.2 Serviços externos ou internos

| Integração | Papel |
|---|---|
| `PostgreSQL` | Persistência principal de usuários, sessões, presenças, configurações e auditoria. |
| `face-recognition` | Reconhecimento facial interno; as fotos da coleção ficam no banco do RPVP. |
| `MediaPipe Face Mesh` | Detecção local de landmarks faciais no navegador. |

---

## 8. Pontos de Atenção (Críticos)

### 8.1 Partes sensíveis do sistema

1. **`presencaService.js`**
   - concentra a regra mais sensível do domínio;
   - decide entre check-in, check-out, cooldown e duplicidade.

2. **`authService.js`**
   - controla login, revogação e expiração de sessão;
   - depende da tabela `sessoes_autenticacao` para autorização.

3. **Serviço interno de reconhecimento facial**
   - o backend depende de `face-recognition` para processar os registros faciais.

4. **Fluxo de schema e compatibilidade**
   - há lógica estrutural em `db/init.sql` e também no bootstrap de compatibilidade em `server.js`, o que exige cuidado para não divergir ambientes.

### 8.2 Possíveis gargalos ou riscos identificados

- comentários antigos ainda citam sessão em memória, embora o comportamento real já esteja persistido no banco;
- ausência de camada de testes automatizados identificada no workspace analisado;
- dependência forte de SQL manual em vários pontos críticos;
- regras de domínio concentradas em poucos arquivos extensos;
- exportações podem crescer em custo conforme o volume da auditoria.

### 8.3 Inconsistências observadas

Foram observados pontos que merecem atenção:

- `frontend/scripts/configuracoes.js` e `frontend/scripts/tipos-sessao.js` fazem referência a `window.Auth.logout()`, mas o módulo compartilhado expõe explicitamente `limparSessao()` e não há evidência direta, no trecho exportado, de um método `logout` público equivalente;
- a função `registrarPresenca()` em `presencaService.js` aparenta usar uma variável `data` fora da ordem ideal, o que pode gerar problema caso essa função volte a ser utilizada no fluxo ativo;
- o `backend/package.json` declara `npm run migrate`, mas não há `backend/scripts/runMigrations.js` no workspace atual;
- o manual técnico anterior fazia referência a `migrations/`, `scripts/` e `index.html` como pontos ativos do fluxo principal, mas o estado atual do projeto não confirma esses pontos como parte do fluxo vigente.

---

## 9. Guia de Manutenção

### 9.1 Como adicionar novas funcionalidades

Com base na estrutura atual, o fluxo recomendado de manutenção é:

1. **definir a necessidade de backend**;
2. criar/ajustar a rota em `backend/src/routes/reconhecer.js`;
3. implementar o handler no controller adequado;
4. concentrar a regra de negócio em um service;
5. se houver persistência, incluir migration SQL e ajustar compatibilidade existente;
6. atualizar a tela e o script correspondente no frontend;
7. validar autenticação/perfil quando aplicável.

### 9.2 Onde realizar alterações comuns

| Alteração | Local principal |
|---|---|
| Regra de autenticação | `backend/src/services/authService.js` e `frontend/scripts/auth.js` |
| Regra de reconhecimento/presença | `frontend/scripts/app.js` e `backend/src/services/presencaService.js` |
| Sessões | `backend/src/services/sessaoService.js`, `frontend/scripts/sessoes.js` e `frontend/scripts/sessao.js` |
| Usuários/perfis | `backend/src/services/usuarioService.js` e `frontend/scripts/usuarios.js` |
| Tipos de sessão | `backend/src/services/tipoSessaoService.js`, `adminController.js`, `frontend/scripts/tipos-sessao.js` |
| Auditoria/exportação | `backend/src/services/auditoriaService.js`, `auditoriaExportService.js`, `frontend/scripts/registros.js` |
| Configurações dinâmicas | `backend/src/services/configService.js` e `frontend/scripts/configuracoes.js` |
| Banco de dados | `db/init.sql` e pontos de compatibilidade em `server.js` |

### 9.3 Cuidados ao modificar partes críticas

- alterar `presencaService.js` com atenção, pois ele impacta diretamente o comportamento operacional do sistema;
- validar qualquer mudança de autenticação em conjunto com o frontend;
- ao adicionar campos de banco, revisar tanto `db/init.sql` quanto o bootstrap/compatibilidade do `server.js`;
- testar a integração com `face-recognition` sempre que houver mudança no upload ou na coleção facial do usuário;
- revisar permissões por perfil ao adicionar rotas novas.

---

## 10. Melhorias Sugeridas

As sugestões abaixo são suportadas por evidências observadas no código:

1. **Consolidar a evolução de schema**
   - motivação: parte da estrutura está em `db/init.sql` e parte no bootstrap do servidor.

2. **Adicionar testes automatizados**
   - motivação: não foram encontrados testes no workspace analisado.

3. **Reduzir acoplamento de módulos extensos**
   - motivação: alguns services acumulam múltiplas responsabilidades operacionais.

4. **Revisar comentários, scripts e referências legadas**
   - motivação: há drift entre parte da documentação histórica, comentários internos e o comportamento real atual.

5. **Padronizar observabilidade**
   - motivação: o sistema usa majoritariamente `console.log` e `console.error`.

6. **Monitorar o serviço interno de reconhecimento facial**
   - motivação: indisponibilidades de `face-recognition` afetam diretamente o registro de presença.

---

## 11. Execução com Docker e face-recognition

### 11.1 Fluxo operacional identificado

O `face-recognition` é um serviço interno da mesma stack Docker do Sistema Laboral (RPVP), acessado apenas pelo backend.

O `docker-compose.yml` do RPVP sobe os serviços:

- `postgres`;
- `face-recognition`;
- `backend`;
- `frontend`.

Nesse compose, o backend fica acessível internamente como `backend:3000`, e o frontend consome a API por `BACKEND_TARGET=http://backend:3000`.

### 11.2 Comunicação entre backend e face-recognition

O backend usa `FACE_RECOGNITION_URL=http://face-recognition:8000` por padrão. O Compose inicia o serviço antes do backend; não é necessária conexão manual a outra rede Docker.

### 11.3 Ponto de atenção

O requisito operacional é manter `face-recognition` disponível na rede interna do Compose e preservar as variáveis `FACE_RECOGNITION_*` no ambiente do backend.

---

## Anexo — Referência rápida dos arquivos principais

### Backend
- `server.js`: inicialização do servidor e compatibilidade estrutural;
- `src/routes/reconhecer.js`: rotas principais;
- `src/controllers/reconhecerController.js`: handlers operacionais;
- `src/controllers/adminController.js`: handlers administrativos;
- `src/services/*.js`: regras de negócio e integrações;
- `../db/init.sql`: estrutura inicial do banco.

### Frontend
- `index.html`: redirecionamento para a área principal;
- `pages/login.html`: autenticação;
- `pages/alterar-senha.html`: troca obrigatória de senha;
- `pages/dashboard.html`: visão operacional resumida;
- `pages/sessoes.html`: gestão e acompanhamento de sessões;
- `pages/sessao.html`: operação e acompanhamento por sessão;
- `pages/registros.html`: auditoria;
- `pages/usuarios.html`: administração de usuários e face collection;
- `pages/configuracoes.html`: parâmetros administrativos.

---

## Observação final

Este manual foi consolidado exclusivamente com base no material disponível no workspace e na documentação previamente gerada. Onde o comportamento não pôde ser confirmado diretamente, foi marcado como **Não identificado claramente** para evitar inferências indevidas.
