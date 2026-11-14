# 6. 30Sales — backlog, critérios de aceite e plano de entrega

## 6.1 Épicos e prioridades

### P0 — Fundamentos confiáveis

- Autenticação, organizações/tenants, membership, equipes, papéis e auditoria.
- Isolamento tenant-first no schema desde a primeira migration; identidades de usuário globais ligadas por membership.
- Schema canônico: contas, pessoas, leads, conversas, mensagens, oportunidades, atividades, integrações e external IDs.
- Importação reconciliável e deduplicação assistida de Twenty/Chatwoot/Postgres Sofia.
- Inbox/read-only timeline e visão de status multidimensional.
- Fila de jobs/outbox/inbox, idempotência e observabilidade.

### P1 — Operação BDR/SDR/closer

- Filas Hoje, Inbox, Contas, Qualificação e Pipeline.
- Atribuição, handoff, tarefas, checklist de prontidão e brief do closer.
- Alteração manual de fatos/status com evidência e auditoria.
- Relatórios do funil e SLA com definições claras.

### P2 — Assistência e automação controlada

- IA de resumo/classificação/sugestão, playbooks versionados e simulator.
- Dry-run/shadow de políticas e sincronizações.
- Follow-up, alertas e cadências com kill switch/quotas.
- Respostas humanas pelo inbox com Chatwoot executor único durante migração.

### P3 — Envios automatizados e substituição

- Evolution send/receive, callbacks e saúde no produto.
- Migração da Sofia A/G, B/F/D/H e C em ondas, um fluxo por função.
- Agenda integrada e confirmação de reunião.
- Inbox e CRM nativos; Chatwoot/Twenty opcionais após reconciliação.

## 6.2 User stories e aceites essenciais

**Entregue no código:** a tabela de leads usa `DataTable` reutilizável, com filtros server-side de texto/status/origem, sort allowlisted em todas as colunas, paginação 10/25/50/100 (default 25), total de resultados e estado vazio que permite limpar filtros. O componente de UI não conhece APIs; a feature usa o client centralizado. Migrations ainda não aplicadas.

**Entregue no código (migrations ainda não aplicadas):** autenticação e seleção de tenant, membership/permissões, isolamento tenant-first nas entidades comerciais, CRUD inicial de leads/status, tarefas, handoff com brief/aceite/devolução, pipeline e histórico de etapa, timeline manual de atividades, Inbox somente leitura tenant-scoped e tela de auditoria com filtros, histórico paginado e detalhes antes/depois. O schema de conversas/mensagens tem migrations geradas 0007–0009. A migration 0010 acrescenta estruturas base tenant-scoped para inbox/outbox de eventos, jobs idempotentes e audit events. A migration 0011 acrescenta `external_records`, mapeando IDs por tenant/provedor/tipo de registro para contas, pessoas, leads ou oportunidades. FKs compostas bloqueiam ligações cruzadas entre tenants; aliases diferentes podem apontar para o mesmo registro canônico. As mutações principais de CRM gravam auditoria atomicamente, com correlation ID da requisição. Hooks Better Auth também registram criação, aceite e cancelamento de convites com correlation ID, depois da mutação de autenticação; esses eventos não são atômicos com as tabelas `auth`. A consulta exige `audit.read`. Cobertura ainda parcial: faltam eventos de sign-in/sign-out, remoção/alteração de papel de membros e conectores; inbox/outbox de integração e jobs ainda não têm produtores, worker, retry ou painel operacional. `external_records` ainda não tem importer nem interface de reconciliação. Limites: não há importação de histórico, ingestão de webhook, conectores, anexos ou resposta pelo Inbox; discovery live e reconciliação seguem pendentes.

### Contas e identidade

- **Como BDR**, quero ver se uma conta já está em prospecção, duplicada ou bloqueada antes de criar uma nova tentativa.
  - Dado um domínio/telefone que coincide, sistema mostra possíveis duplicatas com evidência.
  - Nenhuma fusão ocorre sem confirmação/permissão; IDs e histórico permanecem rastreáveis.
- **Como gestor**, quero ver fonte e validade de cada campo.
  - Todo campo importado/confirmado exibe fonte e data; hipótese aparece visualmente distinta.
- Requisição sem membership ativo ou com recurso de outro tenant é negada mesmo quando o ID existe; listas, busca, export, cache e jobs nunca revelam dados de outro tenant.

### Inbox

- **Como SDR**, quero ver conversa, empresa, pessoa e oportunidade no mesmo contexto.
  - Mensagem recebida aparece uma vez mesmo se webhook repetir.
  - Ao assumir conversa, ownership muda e qualquer job Sofia pendente é cancelado/bloqueado antes do envio.
  - Falha do provider aparece como falha, não como mensagem entregue.
- **Como closer**, quero responder sem automação por cima.
  - Mensagem humana/atribuição coloca conversa em modo humano; retries do webhook não mudam owner.

### BDR/campanha

- **Como BDR**, quero preparar público e prévia antes de iniciar campanha.
  - Prévia informa elegíveis e excluídos por razão, quota por canal, amostra de conteúdo e estado do canal.
  - Opt-out, canal pausado, saúde ruim ou janela inválida não gera job de envio.
  - Job repetido com mesma chave não envia segunda mensagem.
  - Estado “abordado” só muda após confirmação definida pelo adaptador; falha fica visível e reprocessável com segurança.

### Qualificação/handoff

- **Como Sofia/SDR**, quero transferir um aceite com contexto sem inventar os dados faltantes.
  - Brief inclui fatos confirmados, desconhecidos/conflitantes, mensagens fonte, origem e próxima ação.
  - Pedido explícito de humano pode gerar handoff sem completar checklist; lacunas aparecem para o closer.
  - Aceite não marca reunião confirmada nem ganho.
- **Como closer**, quero aceitar ou devolver a oportunidade.
  - Aceite atribui owner, inicia SLA e silencia automação.
  - Devolução requer motivo, cria tarefa de retorno e preserva snapshot anterior.
  - SLA vencido escala; não perde item da fila.

### Pipeline e fechamento

- **Como closer**, quero mover oportunidade baseada em fato.
  - Transição valida campos obrigatórios por etapa e registra ator, data, etapa anterior e motivo.
  - Ganho exige data real e valor/moeda conforme política; perda exige motivo.
  - Oportunidade aberta sem próxima ação gera alerta e aparece na fila do owner.
  - Reabertura de terminal exige permissão/motivo e cria evento.

### Operação

- **Como admin**, quero pausar todo envio quando o canal cai.
  - Pausa global impede novas reservas/jobs imediatamente; jobs já iniciados são reconciliados.
  - Reconexão não desfaz pausa manual.
  - Retentativa mostra erro, número de tentativas e idempotency key; não cria duplicata.
- **Como gestor**, quero distinguir silêncio do lead de falha técnica.
  - Painel expõe mensagem recebida, envio confirmado/falhou, job e webhook com correlation ID.

## 6.3 Definition of Done por funcionalidade

- Permissões aplicadas na API, não apenas escondidas na UI.
- Campos, estados e erros documentados em OpenAPI/modelo.
- Audit event e correlation ID presentes para mutação e efeitos externos.
- Casos de idempotência, conflito, permissão negada e falha de provider descritos e cobertos no gate de qualidade do projeto.
- Acessibilidade básica, teclado, labels e mensagens de erro acionáveis.
- Instrumentação de métrica/trace e runbook para fluxo operacional.
- Migração reversível ou plano expand/contract; dado não é apagado silenciosamente.

## 6.4 Sequência de entrega recomendada

1. **Discovery técnico**: export vivo de n8n e bancos; inventário de campos do Twenty/Chatwoot, estado real, volumes, credenciais, webhooks, filas e métricas. Resolver divergência de prompt/workflow antes de criar baseline.
2. **Modelo e import**: schema canônico, external IDs, import idempotente e reconciliação em staging; leitura apenas.
3. **Console read-only**: Hoje, Contas, Inbox e Pipeline; validar com BDR/SDR/closer usando casos reais anonimizados.
4. **Escrita CRM/tarefas**: outbox, conflito por campo e dry-run; liberar para equipe pequena.
5. **Handoff e inbox**: ownership, brief, SLA, aceitar/devolver; Chatwoot continua executor único de mensagens.
6. **IA assistiva**: resumo, fatos e sugestões sem envio; avaliar contra casos; versionar playbooks.
7. **Automação de baixo risco**: alertas e tarefas; depois retornos explicitamente combinados; medir/rollback.
8. **Canal e campanhas**: Evolution e campanha canary com volume limitado, quotas e pausa; uma função n8n por vez.
9. **CRM/inbox nativos**: migrar escrita, depois leitura, depois desligar integrações legadas após período de reconciliação.

## 6.5 Gates de migração

Não avançar etapa se qualquer gate falhar:

- Reconciliação de contagens e amostra de IDs externos.
- Zero duplicatas/perdas na janela canary (definir tamanho e duração com operação).
- Webhooks repetidos e timeout ambíguo simulados sem efeito duplicado.
- Opt-out, ownership humano, pausa e health gate comprovados.
- Outbox/fila sem backlog desconhecido; falhas permanentes têm dono.
- Rollback testado para app/schema/config; efeitos externos irreversíveis documentados.
- Operador sabe pausar, reconciliar e retomar sem “reimportar tudo”.

## 6.6 Indicadores e fórmulas iniciais

- **Cobertura pesquisada** = contas pesquisadas / contas na coorte atribuída.
- **Taxa de contato válido** = contas com canal válido / contas pesquisadas.
- **Entrega de abordagem** = mensagens com confirmação definida / tentativas solicitadas.
- **Resposta humana** = contatos com mensagem humana identificada / abordagens confirmadas; mostrar incerteza da classificação automática.
- **Conversão para handoff** = handoffs aceitos / respostas substantivas (coorte e janela explícitas).
- **SLA closer** = tempo entre handoff aceito e primeira atividade humana confirmada.
- **Handoff completo** = handoffs sem devolução por falta de dado / handoffs aceitos.
- **Taxa de reunião confirmada** = reuniões confirmadas no calendário / oportunidades elegíveis; não usar horário proposto.
- **Win rate** = oportunidades ganhas / oportunidades decididas (ganhas + perdidas) da coorte.
- **Tempo de ciclo** = closed_at - created/accepted_at, reportado por origem e segmento.
- **Retrabalho** = handoffs devolvidos + contatos repetidos por campo já respondido + duplicatas confirmadas.

Sempre mostrar período, coorte, denominador, fonte e atualização. Não comparar taxas históricas com definições diferentes.

## 6.7 Decisões pendentes que não bloqueiam o blueprint

Configurar antes de liberar automação real: SLA numérico por tipo de handoff; pipeline final e campos obrigatórios; papéis e equipes reais; quotas atuais e responsáveis por aprová-las; calendário/feriados oficiais; política de retenção/consentimento; fontes que podem ser abordadas; integração de agenda; valor/preço autorizado no playbook.

Essas decisões ficam em configuração/versionamento e não exigem mudar o modelo de dados.
