# Backlog de Melhorias de Produto

> Foco: acelerar e ajudar closers e vendedores (SDR/BDR) no dia a dia comercial.
> Última revisão: 2026-11-26

---

## Tier 1 — Alto impacto, baixo esforço

### 1 · Templates de Mensagem no Inbox
**Perfil:** SDR / BDR  
**Problema:** cada mensagem digitada do zero; personalizações feitas à mão; mesmo texto repetido 20–50x por dia.  
**Proposta:** biblioteca de templates por business line. No composer do Inbox, botão `/` abre busca por template. Variáveis `{{nome}}` `{{empresa}}` `{{produto}}` preenchidas automaticamente ou com campo de confirmação antes do envio. Templates pessoais + compartilhados por time.  
**Impacto:** SDR recupera 1–2 horas/dia; consistência de mensagem aumenta taxa de resposta.

---

### 2 · Score de Saúde Visível no Pipeline
**Perfil:** Closer  
**Problema:** filtros "estagnado", "sem próxima ação" e "atrasado" existem mas exigem navegação ativa. O closer só descobre o problema quando vai buscar.  
**Proposta:** badge automático em cada card do Kanban: `🟢 Em dia` / `🟡 Atenção` (ação vencida ou 7+ dias na etapa) / `🔴 Risco` (14+ dias sem atividade ou sem próxima ação). Calculado no backend, renderizado no card sem clique.  
**Impacto:** em um pipeline com 30 deals, o closer sabe em 10 segundos onde agir.

---

### 3 · Log de Atividade Rápida
**Perfil:** Closer  
**Problema:** registrar uma atividade requer abrir modal, escolher tipo, digitar assunto, resultado etc. Friction alta = atividades não registradas = pipeline sem dados reais.  
**Proposta:** 4 botões de toque único no card ou header da oportunidade: **Liguei · Reunião · Sem resposta · E-mail** — cada um abre mini-form com apenas campo de resultado e nota opcional. Um clique, 10 segundos.  
**Impacto:** adoção real do log de atividades; gestores e relatórios passam a ter dados confiáveis.

---

### 4 · Preview da Conversa antes de Aceitar o Handoff
**Perfil:** Closer  
**Problema:** closer aceita handoffs na sequência de chegada, sem ver o histórico. Não consegue priorizar qual aceitar primeiro.  
**Proposta:** expandir o card do handoff no Closer Queue com as últimas 3–5 mensagens da conversa + fatos confirmados pelo SDR. Botão "Ver conversa completa" antes de aceitar.  
**Impacto:** closer com 5 handoffs pendentes pode escolher aceitar primeiro o lead que disse "quero fechar essa semana".

---

## Tier 2 — Alto impacto, médio esforço

### 5 · Checklist de Qualificação Inline no Inbox
**Perfil:** SDR  
**Problema:** qualificação fica em aba separada no lead; SDR troca de tela enquanto conversa e perde contexto.  
**Proposta:** painel colapsável no lado direito da conversa mostrando fatos de qualificação já registrados + botão "Adicionar fato" inline. Itens com `✓` (confirmados) ou `?` (pendentes). Sugestão da IA após mensagem nova ("detectei menção a budget — registrar?").  
**Impacto:** qualificação mais completa = handoff melhor = closer mais eficiente = mais deals fechados.

---

### 6 · Resumo IA por Oportunidade (Deal Briefing)
**Perfil:** Closer  
**Problema:** antes de ligar, o closer lê atividades cronológicas brutas + conversa do inbox. Leva 3–5 minutos por deal.  
**Proposta:** botão "Briefing" na oportunidade que chama a Sofia com contexto: histórico da conversa, atividades registradas, fatos confirmados, estágio atual. Retorna: o que já foi feito, o que o lead disse sobre timing/budget, risco principal, próxima ação sugerida.  
**Impacto:** closer com 20 contas prepara uma ligação em 30 segundos.

---

### 7 · Alertas de Risco Proativos
**Perfil:** Closer / SDR  
**Problema:** leads e deals morrem no silêncio; o produto não avisa quando algo para de se mover.  
**Proposta:** novos tipos de notificação:
- "Lead X está há 10 dias sem resposta desde seu último toque"
- "Oportunidade Y não teve atividade em 14 dias"
- "Deal Z está na etapa 'Proposta Enviada' há 21 dias"
- "Lead voltou a responder depois de 7 dias de silêncio" (oportunidade de reengajamento)

**Impacto:** o produto passa a ser o olho que não dorme sobre a carteira.

---

### 8 · Busca Global (Cmd+K)
**Perfil:** Todos  
**Problema:** busca siloada por tela. Para encontrar "empresa ACME" o usuário visita 3 módulos.  
**Proposta:** atalho Cmd+K abre modal com busca unificada: leads, contas, conversas, oportunidades, contatos — com ícone identificando o tipo e link direto. Backend: endpoint único `/api/v1/search?q=`.  
**Impacto:** reduz navegação desnecessária; muito usado no dia a dia.

---

## Tier 3 — Alto impacto, alto esforço

### 9 · Timeline Unificada da Oportunidade
**Perfil:** Closer  
**Problema:** atividades do deal ficam no pipeline; conversa WhatsApp fica no inbox; handoff original fica na tela de passagens. São 3 abas diferentes para entender a história de um deal.  
**Proposta:** tab "Histórico" na oportunidade mostrando em ordem cronológica: mensagens do WhatsApp (da conversa linkada), atividades registradas, mudanças de etapa, notas internas, resultado do handoff.  
**Impacto:** onboarding de novo closer a um deal existente; coaching de gestores; auditoria de deals perdidos.

---

### 10 · Cadências de Follow-up Automáticas
**Perfil:** SDR / BDR  
**Problema:** campanhas fazem um único disparo. Follow-ups dependem de task manual criada pelo SDR. A maioria dos fechamentos acontece no 4º ou 5º toque, mas o SDR para no 1º ou 2º.  
**Proposta:** "Sequência" é uma série de toques com intervalos configuráveis:
- Dia 1: mensagem A (WhatsApp)
- Se sem resposta em 3 dias: mensagem B
- Se sem resposta em mais 4 dias: mensagem C + task para ligar

Auto-pausa quando o lead responde. Auto-cria task ao terminar sem resposta. SDR associa um lead a uma sequência com um clique.  
**Impacto:** multiplica o output do SDR sem aumentar headcount; reduz taxa de leads abandonados.

---

## Resumo de Priorização

| # | Feature | Perfil | Impacto | Esforço |
|---|---------|--------|---------|---------|
| 1 | Templates de mensagem | SDR | ████ | ██░░ |
| 2 | Score de saúde no pipeline | Closer | ████ | ██░░ |
| 3 | Log de atividade rápida | Closer | ████ | ██░░ |
| 4 | Preview no handoff | Closer | ███░ | ██░░ |
| 5 | Checklist qualificação inline | SDR | ███░ | ███░ |
| 6 | Deal briefing IA | Closer | ███░ | ███░ |
| 7 | Alertas de risco proativos | Ambos | ███░ | ███░ |
| 8 | Busca global (Cmd+K) | Ambos | ███░ | ███░ |
| 9 | Timeline unificada | Closer | ██░░ | ████ |
| 10 | Cadências de follow-up | SDR | ████ | ████ |

**Sequência recomendada para sprint inicial:** #1 → #3 → #2 → #4 (todos com dados existentes, sem novo domínio de backend).
