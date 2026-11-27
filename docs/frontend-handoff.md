# Handoff: reformulação do frontend Laboral

Data: 26/11/2026. Branch de trabalho pretendida: `codex/frontend-reformulacao-handoff`.

Continuação: [relatório de homologação e evidências](frontend-homologacao.md). A validação biométrica com câmera real e a medição de desempenho permanecem pendentes; o relatório distingue os testes executados das limitações.

## Objetivo e limites

Melhorar aparência, responsividade e feedback da interface sem alterar contratos de API, banco, backend, regras de permissão ou o fluxo funcional de check-in/check-out. Não foi iniciado container nem serviço nesta etapa.

## O que já foi alterado no código

- **Navegação por perfil:** `frontend/scripts/auth.js` agora filtra tanto `.sidebar-link[data-roles]` quanto `.role-nav-item[data-roles]`. As páginas internas receberam nova versão do script para evitar cache antigo. Isso altera somente a visibilidade do menu; autorização de rotas permanece como antes.
- **Sessão e câmera:** `frontend/scripts/sessao.js` mantém o limite preexistente de 100 ms entre processamentos do FaceMesh e o bloqueio de chamadas `send()` simultâneas. Foram retiradas limpezas redundantes do canvas, já que o overlay dinâmico estava desativado. O texto do status só é escrito no DOM quando muda. Há métricas opcionais de duração média do `faceMesh.send()` e FPS processado, emitidas no console a cada cinco segundos quando `window.__LABORAL_DEBUG_PERF__` é verdadeiro.
- **Recuperação e feedback:** `frontend/pages/sessao.html` ganhou botão para tentar abrir a câmera novamente após falha inicial e `role="status"`/`aria-live="polite"` na barra de estado. O código impede inicializar dois detectores pela mesma página.
- **Carregamento:** na abertura de `sessao.html`, os dados da sessão e o acompanhamento são buscados em paralelo. As linhas do acompanhamento são inseridas com `DocumentFragment`, reduzindo atualizações separadas da tabela.
- **Modal de sessão:** `frontend/scripts/sessoes.js` fecha o modal de criação com Esc e restaura o foco ao controle de origem.
- **Visual:** `frontend/styles/refresh.css` é uma camada nova aplicada às sete páginas internas. Ela cria navegação lateral no desktop e navegação horizontal rolável em telas menores, fundo claro, cartões e tabelas mais discretos, ações com laranja reservado, foco visível e suporte a movimento reduzido. `frontend/styles/login.css` e `frontend/components/auth-layout.js` alinham login e troca de senha ao novo visual usando a marca para fundo claro. As classes e IDs existentes foram preservados.

## Verificação já feita e limites

- `node --check` passou para os 14 arquivos JavaScript de `frontend/scripts` e `frontend/components`.
- `npm test` em `backend` passou (3 testes); não valida o visual nem a câmera.
- `git diff --check` passou.
- As referências locais de CSS, JS e imagens nas dez páginas HTML apontam para arquivos existentes.
- A contagem de chaves dos arquivos CSS editados está equilibrada. Isso não substitui um parser CSS nem inspeção visual.
- **Não houve teste visual ou funcional no navegador**, medição real de CPU/FPS, login por perfil, câmera, check-in/check-out nem homologação mobile. O navegador do ambiente de origem bloqueou `file://` por política; não se tentou contornar. Nenhum ganho de desempenho foi comprovado.

## Próximas tarefas, em ordem

### 1. Validar e ajustar a reformulação visual

No ambiente de desenvolvimento, abrir `login.html`, `alterar-senha.html`, `dashboard.html`, `sessoes.html`, `sessao.html`, `registros.html`, `usuarios.html`, `tipos-sessao.html` e `configuracoes.html` em larguras desktop, tablet e celular. Comparar legibilidade, contraste, rolagem, tabelas, modais, foco e enquadramento do vídeo. Ajustar `refresh.css` e `login.css` conforme os problemas observados. Priorizar `usuarios.html` e `configuracoes.html`, que têm componentes próprios e muitos estados. Conferir console e rede para CSS/JS faltando.

### 2. Validar navegação e fluxos

Entrar com `admin`, `gestor`, `instrutor` e `colaborador`. Conferir itens do menu, dashboard, sessões e acesso negado. Verificar criação/encerramento de sessão onde permitido, exportações, modal com teclado, câmera frontal/traseira, falha e recuperação da câmera, piscada, check-in e check-out. Não mudar regras de autorização para resolver problemas de menu.

### 3. Medir o travamento antes de novas otimizações

Em Chrome DevTools Performance, medir sessão com câmera real em máquina comum e celular: duração/frequência de `FaceMesh.send`, FPS do vídeo e do processamento, long tasks, resposta dos botões, chamadas de reconhecimento/API, renderização da lista e reconfiguração por orientação. Ativar `window.__LABORAL_DEBUG_PERF__ = true` antes de iniciar a detecção para coletar a métrica opcional. Registrar números e dispositivo no PR. O limite já é ~10 FPS; alterá-lo somente se as medições sustentarem a decisão e a piscada continuar confiável.

### 4. Completar estados da sessão

Padronizar carregando câmera, aguardando rosto/piscada, capturando, enviando, sucesso, erro e recuperação. Fazer mensagens de resultado permanecerem tempo suficiente para leitura sem travar novas ações. Verificar `disabled` e `aria-busy` em ações assíncronas e erro recuperável se a troca ou reconfiguração de câmera falhar. Preservar cooldown e regras de check-in/check-out.

### 5. Melhorias estruturais depois da validação

Refatorar `sessao.js` gradualmente, começando por funções puras. Separar câmera, FaceMesh, API e UI somente com testes e carregamento compatível com o servidor de arquivos atual. Migrar CSS aos poucos para responsabilidades claras (base, layout, componentes e sessão), eliminando regras antigas após comparação visual. Revisar acessibilidade de todos os modais, mensagens de campo e controles. Fazer polimento visual geral apenas após as telas operacionais estarem estáveis.

## Critérios de entrega em homologação

- Sem erros novos no console; recursos locais carregam.
- Menu correto para cada perfil, sem mudança em acesso a rotas.
- Login, dashboard, sessões e sessão utilizáveis em desktop e celular.
- Câmera e reconhecimento preservados, incluindo piscada e check-in/check-out.
- Medidas antes/depois para qualquer alegação de redução de CPU ou travamento.
- Mudanças pequenas e revisáveis, sem alterações no backend, banco ou contratos de API.

## Arquivos fora deste trabalho

`Plano_de_Evolucao_Tecnica_RPVP_Laboral.docx` e `rpvp_plano_melhorias_tecnicas.docx` já estavam soltos no workspace. Não foram editados e não devem entrar no commit desta branch.
