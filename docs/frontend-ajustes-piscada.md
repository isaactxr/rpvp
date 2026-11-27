# Ajustes após teste com câmera — 27/11/2026

Relato do usuário: navegação afastada da borda em desktop e necessidade de várias piscadas para disparar a captura.

- Removidos o limite de 1600 px e a margem automática do layout interno. A barra lateral passa a começar na borda esquerda também em monitores largos.
- Padrão de `frames_fechado_min` reduzido de 2 para 1. A reabertura continua exigindo 2 amostras; limiares EAR 0,20/0,25, cooldown e intervalo FaceMesh de 100 ms foram preservados. Uma piscada curta com apenas uma amostra fechada era descartada pelo padrão anterior. Isso aumenta a sensibilidade também a uma amostra isolada de EAR baixo e precisa ser conferido com câmera real.
- Em Configurações → Reconhecimento Facial, a opção **Mostrar pontos dos olhos na câmera** salva `mostrar_mascara_olhos`, desligado por padrão. Salvar e atualizar a página da sessão aplica a opção. Os pontos e contornos usam os landmarks reais; o painel mostra EAR de cada olho e limiares. O desenho acompanha espelhamento, letterbox e recorte e desaparece quando o rosto sai. As imagens enviadas ao reconhecimento não incluem a máscara.
- A solicitação atual autorizou a adição restrita da configuração no serviço existente e a atualização do valor inicial no seed. Não há endpoint ou alteração de esquema novos, nem mudança de permissões ou regras de presença.

## Verificação

- 18 testes de frontend e 5 de backend passaram, incluindo uma amostra fechada seguida de duas abertas, configuração personalizada de duas amostras, ligar/desligar máscara, perda de rosto, coordenadas com espelhamento/recorte e persistência booleana/cache da configuração.
- Sintaxe dos scripts alterados e `git diff --check` passaram.
- Backend e frontend reconstruídos no Docker local. Os quatro serviços estão ativos, Postgres saudável; Cloudflare não foi iniciado. A configuração pública em `http://localhost:8080/api/config/publica` retornou fechado=1, aberto=2 e máscara=false.
- No banco local, apenas o valor antigo 2 de `frames_fechado_min` foi substituído por 1. Outros valores personalizados foram preservados.

## Limitações

Não foi possível acessar uma janela autenticada do usuário nesta verificação. Não há nova captura visual do dashboard nem validação física de piscada, alinhamento dos pontos ou check-in/check-out após este ajuste. Os testes de geometria e de sequência de EAR são automatizados. Não foram coletadas novas medidas de CPU/FPS, e não se afirma ganho de desempenho. A confirmação com câmera real permanece necessária.
