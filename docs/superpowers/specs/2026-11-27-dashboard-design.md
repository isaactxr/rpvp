# Dashboard de sessões de hoje

Escopo aprovado em conversa: dashboard de consulta para responder se há sessões hoje e qual o status de cada uma.

- Cabeçalho com data, atualização manual e indicação da última atualização.
- Resumo com total, pendentes, em andamento e concluídas, calculado sobre todas as sessões retornadas para hoje.
- Lista com tipo/nome, horário disponível, instrutor, status e acesso ao acompanhamento existente.
- Ordem: em andamento, pendentes por horário, concluídas. Desempate por identificador.
- Estado vazio: “Nenhuma sessão prevista para hoje”.
- Remover tabela de auditoria e filtros avançados.
- Preservar autenticação e perfis existentes. Nenhum controle de início/encerramento no dashboard.

## Decisões de implementação propostas

Reutilizar HTML/CSS/JavaScript e GET /sessoes?data=YYYY-MM-DD, sem dependências novas. Status: fim_efetivo_em indica concluída; início sem fim indica em andamento; ausência de ambos indica pendente. Usar America/Sao_Paulo para determinar hoje. Sem horário previsto, exibir “Aguardando início”; após início, mostrar horário real. Atualizar a cada 30 segundos enquanto a página estiver visível e ao retornar à aba. Evitar requisições simultâneas. Em falha, informar que os dados estão desatualizados e preservar a última consulta bem-sucedida.

## Abordagens

A proposta escolhida em conversa é o painel operacional de sessões, em substituição ao resumo atual de auditoria. Uma expansão analítica com gráficos e pendências não atende à prioridade informada e fica fora deste escopo.
