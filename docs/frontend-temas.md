# Temas claro e escuro do Laboral

## Decisão de interface

O tema escuro volta a ser o padrão para quem não tem uma preferência salva. O claro continua disponível pelo botão **Escuro/Claro**, no cabeçalho interno, login, troca de senha e acesso negado. A preferência é local ao navegador e permanece entre páginas, recargas e logout; mudanças também são sincronizadas entre abas.

A implementação usa a estrutura HTML/CSS/JavaScript existente. As cores ficam em `frontend/styles/theme.css`, com tokens compartilhados pelos componentes, sem duplicar os layouts. `frontend/scripts/theme.js` aplica a preferência no `head`, antes dos estilos, e conecta os controles montados pelos layouts. Storage bloqueado usa escuro como padrão e ainda permite alternar na página atual. A marca da autenticação acompanha o fundo.

Foi escolhida uma paleta de azul escuro com cartões de superfície ligeiramente mais clara, texto claro e laranja nas ações principais. No tema claro, os mesmos componentes usam superfícies brancas. IDs, classes funcionais, autenticação, permissões, backend e fluxo de presença foram preservados.

## Ajustes observados na revisão

- O formulário compartilhado criava quatro colunas no modal estreito de sessão, comprimindo o texto do check-out. Os campos desse diálogo agora ocupam a largura disponível.
- Em celular, identificação/perfil e tema/sair ficam em duas linhas organizadas.
- A revisão independente encontrou divergência entre o nome acessível do seletor e seu texto no claro. O nome agora acompanha o estado visível e há teste de regressão.

## Validação em 26/11/2026

- `node --test frontend/tests/*.test.js`: **12 testes aprovados**, dos quais seis cobrem tema padrão, troca, persistência, storage indisponível, valor inválido e sincronização entre abas.
- `node --check`: **16 scripts de produção aprovados**.
- Login, troca de senha e os sete módulos internos inspecionados no escuro em desktop e celular (390×844). Acesso negado conferido nos dois temas.
- Troca claro → outra página → recarga manteve a preferência. Alternância por Espaço no login e sincronização real em segunda aba também verificadas.
- Trocar o tema preservou o texto digitado no login. Login de admin e colaborador e navegação de retorno de acesso negado continuaram funcionais.
- Formulários, modais de criação/edição e tabelas conferidos. Nas sete páginas internas em 390 px, a largura do documento não excedeu a viewport.
- Contraste calculado de amostras no escuro: ação principal **7,58:1**; texto secundário sobre cartão **7,69:1**. São amostras, não uma auditoria automatizada de todos os estados.
- Nenhum erro/aviso capturado no console na verificação final; `git diff --check` aprovado.

As limitações biométricas e de desempenho registradas em [frontend-homologacao.md](frontend-homologacao.md) continuam pendentes. Esta alteração não muda FaceMesh, intervalo de detecção ou regras de presença.

## Capturas

| Tela | Desktop | Celular |
|---|---|---|
| Login | [ver](evidencias-temas/login-escuro-desktop.jpg) | [ver](evidencias-temas/login-escuro-mobile.jpg) |
| Troca de senha | [ver](evidencias-temas/alterar-senha-escuro-desktop.jpg) | [ver](evidencias-temas/alterar-senha-escuro-mobile.jpg) |
| Dashboard | [ver](evidencias-temas/dashboard-escuro-desktop.jpg) | [ver](evidencias-temas/dashboard-escuro-mobile.jpg) |
| Sessões | [ver](evidencias-temas/sessoes-escuro-desktop.jpg) | [ver](evidencias-temas/sessoes-escuro-mobile.jpg) |
| Sessão | [ver](evidencias-temas/sessao-escuro-desktop.jpg) | [ver](evidencias-temas/sessao-escuro-mobile.jpg) |
| Registros | [ver](evidencias-temas/registros-escuro-desktop.jpg) | [ver](evidencias-temas/registros-escuro-mobile.jpg) |
| Usuários | [ver](evidencias-temas/usuarios-escuro-desktop.jpg) | [ver](evidencias-temas/usuarios-escuro-mobile.jpg) |
| Tipos de sessão | [ver](evidencias-temas/tipos-sessao-escuro-desktop.jpg) | [ver](evidencias-temas/tipos-sessao-escuro-mobile.jpg) |
| Configurações | [ver](evidencias-temas/configuracoes-escuro-desktop.jpg) | [ver](evidencias-temas/configuracoes-escuro-mobile.jpg) |

Também foram salvas amostras dos modais, do acesso negado e das cores computadas em `docs/evidencias-temas/`.
