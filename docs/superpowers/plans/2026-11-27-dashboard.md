# Dashboard de sessões de hoje Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar as sessões de hoje e seus estados em uma tela de consulta.

**Architecture:** Consumir a listagem existente de sessões e derivar os estados pelos horários reais de início e encerramento. Renderizar resumo e lista com DOM seguro, aproveitando o tema e o acompanhamento existentes.

**Tech Stack:** HTML, CSS e JavaScript sem framework.

**Spec:** docs/superpowers/specs/2026-11-27-dashboard-design.md

## Global Constraints

- Preservar perfis admin, gestor e instrutor e o escopo da API existente.
- Não adicionar ações de início/encerramento nem dependências.
- Usar America/Sao_Paulo e atualização automática a cada 30 segundos com aba visível.

## Review Focus

- Nenhuma sessão: mensagem clara e contadores zerados.
- Falha inicial ou após sucesso: distinguir erro de lista vazia e indicar dados desatualizados.
- Virada do dia: recalcular data em cada consulta.
- Horário ausente: não inventar horário previsto.
- Nomes contendo marcação HTML: renderizar como texto.

### Task 1: Substituir resumo de auditoria pelo painel de sessões

**Files:**
- Modify: frontend/pages/dashboard.html
- Modify: frontend/scripts/dashboard.js
- Create: frontend/styles/dashboard.css

**Interfaces:**
- Consumes: Auth.requireAuth e Auth.apiJson; GET /sessoes?data=YYYY-MM-DD.
- Produces: lista ordenada, totais completos, consulta manual e automática e link para acompanhamento existente.

- [x] Confirmar rota e parâmetros do acompanhamento e campos retornados pela API.
- [x] Substituir filtros e auditoria pelo resumo e lista responsiva, com carregamento, vazio e erro.
- [x] Implementar classificação, ordenação, DOM seguro, atualização sem concorrência e data recalculada.
- [x] Validar com dados simulados: três estados, lista vazia, horários ausentes, nomes com HTML, falha de rede e virada do dia.
- [x] Verificar sintaxe JavaScript e diff. Validação visual em navegador não realizada.

## Resultado

23 testes do frontend passaram, incluindo cinco casos do dashboard. Revisão independente não encontrou bugs relevantes e apontou especificidade nas bordas de status, corrigida antes da entrega. Como a API não fornece horário previsto, pendentes são ordenadas por identificador, sem fabricar horários. Alterações mantidas no diretório solicitado, sem commit ou publicação.
