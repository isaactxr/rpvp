# Homologação do frontend Laboral — 26/11/2026

Branch: `codex/frontend-reformulacao-handoff`. Base: `c4e1a08`.

**Resultado: validação visual e dos fluxos administrativos realizada; homologação biométrica e de desempenho pendente.** O usuário informou que não consegue disponibilizar a câmera/dispositivo agora. Não há evidência para afirmar que o travamento foi resolvido.

## Ambiente e limites

- Windows; placa B450M GAMING, AMD Ryzen 5 5600 (12 processadores lógicos), 34.279.792.640 bytes de RAM instalada.
- Navegador integrado do Codex; viewports de 1440×900, 768×1024 e 390×844. Tablet e celular são simulações de largura, não dispositivos físicos.
- Frontend: `node frontend/dev-server.js`, porta 8080; backend original via Node, porta 3000.
- PostgreSQL 17.7 em `laboral-homologacao-db`, porta local 55432; serviço real de reconhecimento em `laboral-homologacao-face`, porta local 8001. `/health` respondeu `success: true`, engine `face_recognition`.
- Banco descartável com esquema existente e usuários fictícios. Nenhum registro pessoal do dump foi importado. Não houve alteração de esquema, backend, contratos ou permissões no código.
- Cloudflare não foi iniciado. Nenhum serviço foi exposto por túnel.
- Windows identifica Iriun Webcam, mas não houve vídeo utilizável. O navegador integrado retornou permissão negada; a janela do Edge estava minimizada e não pôde ser restaurada pela automação disponível.

## 1. Inspeção e correções visuais

As nove telas foram abertas em desktop, tablet e celular: login, alterar senha, dashboard, sessões, sessão, registros, usuários, tipos de sessão e configurações. Conferidos os estados vazios, dados fictícios de usuários e sessões, modal de criação, reset de senha (abertura/fechamento), edição de tipo e prévia estática de olhos abertos/fechados.

Problemas reproduzidos e corrigidos:

- `.sidebar.card` recebia o fundo branco de `.card`, com links claros quase ilegíveis. O seletor agora preserva o fundo escuro. Contraste calculado dos links `#d0dce3`: **1,40:1 antes → 10,73:1 depois**.
- Menu mobile quebrava em várias linhas; agora permanece em uma linha com rolagem horizontal.
- Cabeçalho do modal de usuários mantinha fundo escuro com título escuro. Agora usa superfície branca e não encobre campos focados durante a rolagem.
- Tab/Shift+Tab ficam dentro dos modais; Esc e fechamento devolvem o foco ao controle de origem. Edição de tipo também recupera o foco depois que a tabela recria suas linhas.
- Switches têm indicação de foco no controle visual. Modais de sessão e tipo receberam nomes acessíveis, e autenticação anuncia feedback.
- Removido o bloqueio de zoom das nove páginas verificadas.
- Aviso da câmera aparece no topo do quadro e preserva o subtítulo com os dados da sessão. Quadros sem vídeo foram inspecionados; enquadramento com vídeo real continua pendente.

Regressão encontrada durante a retomada: declaração duplicada de `editFocus` impedia carregar tipos de sessão. Corrigida, seguida por verificação sintática e edição/salvamento real no navegador. A revisão independente também encontrou perda de foco após atualizar a tabela; corrigida com teste e repetição no navegador.

As tabelas verificadas mantêm a rolagem dentro dos cartões. Não foi observado alargamento horizontal do documento nos sete módulos internos em 390 px. Auditoria e acompanhamento foram exercitados sem presenças reais; volume elevado de registros ainda não foi homologado.

## 2. Perfis, rotas e fluxos

Login real dos quatro perfis e matriz de 28 acessos pelo navegador, preservando a política atual:

| Perfil | Dashboard | Sessões/sessão | Registros | Usuários | Tipos | Configurações |
|---|---|---|---|---|---|---|
| Admin | Sim | Sim | Sim | Sim | Sim | Sim |
| Gestor | Sim | Sim | Sim | Negado | Negado | Negado |
| Instrutor | Sim | Sim | Negado | Negado | Negado | Negado |
| Colaborador | Negado | Sim | Negado | Negado | Negado | Negado |

Menus: admin com módulos administrativos; gestor com dashboard, sessões e auditoria; instrutor com dashboard e sessões; colaborador apenas com sessões. Tipos mantém a navegação específica já existente. Evidência estruturada em [rotas-perfis.json](evidencias-frontend/rotas-perfis.json).

- Admin e instrutor criaram sessões pela interface.
- Admin e instrutor encerraram suas sessões pela interface; data de encerramento foi preenchida e a área facial desativada. **Para preparar esses testes, o início foi acionado pela API existente; isso não comprova o início automático pelo primeiro reconhecimento.**
- A opção de sessões encerradas exibiu as duas sessões concluídas e seus filtros.
- PDF e Excel da auditoria e do acompanhamento foram acionados no navegador. Requisições diretas adicionais autenticadas como admin, gestor e instrutor retornaram arquivos com assinaturas PDF/ZIP válidas: PDF do acompanhamento com aproximadamente 170 KB e Excel com 6.874 bytes, sem presenças. Conteúdo com presenças/fotos reais permanece pendente.
- A API negou criação de sessão por gestor/colaborador com HTTP 403, sem mudança de regras.
- Primeiro acesso: redirecionamento e layout de troca de senha verificados no navegador. Em conta descartável, a troca pela API retornou HTTP 200 e mudou `reset_senha_primeiro_acesso` de true para false. Submissão de nova senha pela interface não foi automatizada.
- Prévia de configurações alternou olhos abertos/fechados. Não foram modificados parâmetros de presença/biometria para facilitar testes.

## 3. Desempenho e travamento

| Medida com câmera real | Antes | Depois |
|---|---|---|
| Duração/frequência de `FaceMesh.send()` | Não coletada | Não coletada |
| FPS de vídeo e processamento | Não coletado | Não coletado |
| CPU, long tasks e latência de interação | Não coletados | Não coletados |
| Latência de reconhecimento e renderização de lista populada | Não coletada | Não coletada |
| Orientação em celular físico | Não testada | Não testada |

Não foi feita gravação no Chrome DevTools Performance. **Intervalo do FaceMesh preservado em 100 ms (~10 FPS máximos teóricos); nenhum ganho de CPU/FPS foi alegado.** A existência do serviço de reconhecimento saudável não substitui câmera, piscada ou medição no cliente.

Para fechar esta etapa: capturar trace de pelo menos 30 s no commit base e no candidato, usando o mesmo computador/celular, câmera, resolução, dados e parâmetros. Habilitar `window.__LABORAL_DEBUG_PERF__ = true` antes da detecção; registrar média de send, FPS do vídeo/processamento, long tasks, latência dos botões e API, tamanho da lista e orientação. Confirmar piscada antes de considerar qualquer mudança de intervalo.

## 4. Estados da sessão

- Erros de permissão, câmera ausente/ocupada e falha genérica têm mensagem de recuperação em português. Permissão negada e repetição da tentativa foram reproduzidas no navegador.
- Falha ao restaurar câmera ou reconfigurar orientação também disponibiliza recuperação; esses caminhos não foram exercitados em dispositivo físico.
- A abertura da câmera sinaliza `aria-busy` e desabilita seus controles enquanto aguarda, liberando-os em `finally`.
- Resultado de captura/envio não é apagado por um frame sem rosto durante o cooldown existente. Teste de regressão cobre esse comportamento. Temporização, piscada, reconhecimento e regras de presença não foram alterados.

## 5. Verificações e entrega

- `node --check`: 15 scripts de produção aprovados.
- `node --test frontend/tests/*.test.js`: 6 testes aprovados (foco, origem removida e feedback da sessão).
- `npm test` em backend: 3 testes aprovados, sem alterações no backend.
- 23 recursos locais referenciados pelas páginas responderam HTTP 200; `git diff --check` aprovado.
- Sem erros capturados no console nas verificações finais. Revisão independente realizada sobre o diff e amostras de capturas; limitações de câmera mantidas explícitas.
- Refatorações amplas de câmera/FaceMesh/CSS foram adiadas até existir validação biométrica real, conforme a ordem do handoff.
- Os dois `.docx` citados no handoff não foram incluídos.

### Capturas

| Tela | Desktop | Tablet | Celular |
|---|---|---|---|
| Login | [ver](evidencias-frontend/login-desktop.jpg) | [ver](evidencias-frontend/login-tablet.jpg) | [ver](evidencias-frontend/login-mobile.jpg) |
| Troca de senha | [ver](evidencias-frontend/alterar-senha-desktop.jpg) | [ver](evidencias-frontend/alterar-senha-tablet.jpg) | [ver](evidencias-frontend/alterar-senha-mobile.jpg) |
| Dashboard | [ver](evidencias-frontend/dashboard-desktop.jpg) | [ver](evidencias-frontend/dashboard-tablet.jpg) | [ver](evidencias-frontend/dashboard-mobile.jpg) |
| Sessões | [ver](evidencias-frontend/sessoes-desktop.jpg) | [ver](evidencias-frontend/sessoes-tablet.jpg) | [ver](evidencias-frontend/sessoes-mobile.jpg) |
| Sessão | [ver](evidencias-frontend/sessao-desktop.jpg) | [ver](evidencias-frontend/sessao-tablet.jpg) | [ver](evidencias-frontend/sessao-mobile.jpg) |
| Registros | [ver](evidencias-frontend/registros-desktop.jpg) | [ver](evidencias-frontend/registros-tablet.jpg) | [ver](evidencias-frontend/registros-mobile.jpg) |
| Usuários | [ver](evidencias-frontend/usuarios-desktop.jpg) | [ver](evidencias-frontend/usuarios-tablet.jpg) | [ver](evidencias-frontend/usuarios-mobile.jpg) |
| Tipos | [ver](evidencias-frontend/tipos-sessao-desktop.jpg) | [ver](evidencias-frontend/tipos-sessao-tablet.jpg) | [ver](evidencias-frontend/tipos-sessao-mobile.jpg) |
| Configurações | [ver](evidencias-frontend/configuracoes-desktop.jpg) | [ver](evidencias-frontend/configuracoes-tablet.jpg) | [ver](evidencias-frontend/configuracoes-mobile.jpg) |

Comparação do modal de usuários: [antes](evidencias-frontend/antes-modal-usuarios-mobile.jpg), [depois](evidencias-frontend/modal-usuarios-mobile.jpg). As capturas da sessão exibem falha de permissão, não um teste bem-sucedido de reconhecimento.

### Pendências para aceite completo

1. Câmera física com permissão concedida; frontal/traseira, ausência/retorno do dispositivo e mudança de orientação.
2. Piscada, check-in/check-out, primeiro reconhecimento iniciando sessão, cooldown e tempos mínimos, com pessoas e coleção autorizadas.
2. Exportações com presenças e fotos; listas com volume realista.
3. Trace Chrome DevTools e comparação antes/depois em computador e celular físico.
4. Submissão da troca de senha pela interface com operador humano.
