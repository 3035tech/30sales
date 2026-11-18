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
- Central de trabalho do closer com eventos que exigem ação humana, prioridade, prazo, contexto e ações diretas.
- Cadastro de números por tenant, separados do closer responsável, com provedor Evolution ou WhatsApp Cloud API e filtro unificado do Inbox.
- Inbox nativo multiusuário: fila compartilhada, assumir/atribuir/devolver conversa, resposta humana, notas internas, tags, busca e filtros; canal/número de origem independente do closer.
- Controle de automação por conversa: modos Sofia automática, atendimento humano e pausada; retomada explícita da Sofia com contexto, auditoria e cancelamento seguro de envios pendentes.
- Assistência no modo humano: perguntar à Sofia sobre o lead, resumir o histórico e sugerir/rascunhar respostas sem enviar em nome do closer.
- Caixa de saída idempotente com estados de envio/entrega/falha e adaptadores diretos Evolution e WhatsApp Cloud API.
- Composer do Inbox para envio humano de imagem, vídeo, PDF e áudio, com S3 privado, validação de conteúdo/tamanho e histórico/status na thread. Primeira fatia entregue no código: um arquivo por mensagem até 16 MiB; áudio sem legenda; anexos seguem pendentes de validação com contas reais de teste dos provedores.
- Importação como entrada da base (“LDR”), sem papel de usuário separado; primeiro corte CSV de até 100 leads implementado com prévia, agrupamento de contatos por empresa, dedupe conservador, criação transacional e vínculo idempotente por external ID. Lotes históricos, mapeamento de status da origem e encaminhamento dos leads elegíveis à fila do SDR IA ainda pendentes.
- Convites de reunião criados a partir do contexto do Inbox/oportunidade, com participantes, fuso, link/local e estados de convite sincronizados à timeline.
- Ciclo de responsabilidade explícito: agente qualifica, closer aceita/devolve, agente retoma apenas com instrução.
- Alteração manual de fatos/status com evidência e auditoria.
- Relatórios do funil e SLA com definições claras.
- Dashboard gerencial com gráficos de funil, resultados por vendedor, contribuição do SDR IA e saúde operacional; cada KPI tem contrato de métrica, denominador, período/coorte, escopo autorizado e fonte.

### P2 — Assistência e automação controlada

- IA de resumo/classificação/sugestão, playbooks versionados e simulator.
- Detecção de eventos comerciais e notificações idempotentes, configuráveis por tenant e com reconhecimento/adiamento.
- SLA por tipo de evento, lembretes e escalonamento para responsável/gestor.
- Dry-run/shadow de políticas e sincronizações.
- Follow-up, alertas e cadências com kill switch/quotas.

### P3 — Automação e ingestão em escala

- **Webhooks e status do Inbox:** Evolution `MESSAGES_UPSERT`/`MESSAGES_UPDATE` e WhatsApp Cloud API (`messages` e `statuses[]`) passam por autenticação, deduplicação e gravação tenant-scoped. Status de envio/entrega/leitura/falha atualizam a mensagem local sem regressão. Callback sem mensagem correspondente é ignorado; conciliação de callback anterior à persistência do ID externo ainda depende de worker/outbox. **Anexos inbound:** imagem, vídeo, áudio, documento e figurinha criam metadados tenant-scoped e um job durável de download; Evolution/Cloud baixam por adapters e guardam o blob em bucket S3 privado, fora do PostgreSQL. O Inbox oferece download autenticado e auditado; limite de 25 MiB. Migration 0029 gerada, ainda não aplicada. O backend usa IAM role/cadeia padrão AWS, sem ACL pública; política de retenção/expurgo ainda precisa ser definida. Reconciliação continua pendente.
- Migração da Sofia A/G, B/F/D/H e C em ondas, um fluxo por função.
- Agenda integrada e confirmação de reunião.
- Runtime da Sofia consultando o modo da conversa; workers/outbox com retry limitado e dead-letter, após reconciliação dos envios síncronos atuais.
- Inbox e CRM nativos. Chatwoot não é dependência nem executor do produto; pode ser apenas uma fonte legada de importação durante a migração.

## 6.2 User stories e aceites essenciais

**Entregue no código:** a tabela de leads usa `DataTable` reutilizável, com filtros server-side de texto/status/origem, sort allowlisted em todas as colunas, paginação 10/25/50/100 (default 25), total de resultados e estado vazio que permite limpar filtros. O componente de UI não conhece APIs; a feature usa o client centralizado. Migrations ainda não aplicadas.

**Entregue no código (migrations ainda não aplicadas):** autenticação e seleção de tenant, membership/permissões, isolamento tenant-first nas entidades comerciais, CRUD inicial de leads/status, tarefas, handoff com brief/aceite/devolução, pipeline e histórico de etapa, timeline manual de atividades, Inbox somente leitura tenant-scoped, auditoria e console de prévia de reconciliação. O schema de conversas/mensagens tem migrations geradas 0007–0009. A migration 0010 acrescenta estruturas base tenant-scoped para inbox/outbox de eventos, jobs idempotentes e audit events. A migration 0011 acrescenta `external_records`, mapeando IDs por tenant/provedor/tipo de registro para contas, pessoas, leads ou oportunidades. FKs compostas bloqueiam ligações cruzadas entre tenants; aliases diferentes podem apontar para o mesmo registro canônico. As mutações principais de CRM gravam auditoria atomicamente, com correlation ID da requisição. Hooks Better Auth também registram criação, aceite e cancelamento de convites com correlation ID, depois da mutação de autenticação; esses eventos não são atômicos com as tabelas `auth`. A consulta exige `audit.read`. Cobertura ainda parcial: faltam eventos de sign-in/sign-out, remoção/alteração de papel de membros e conectores; inbox/outbox de integração e jobs ainda não têm produtores, worker, retry ou painel operacional. O console aceita CSV normalizado de até 100 registros e chama o preview somente leitura; adapters de fonte, importação persistente e aprovação de candidatos continuam pendentes. Limites: não há importação de histórico, ingestão de webhook, conectores, anexos ou resposta pelo Inbox; discovery live e reconciliação com payloads reais seguem pendentes.

**Prévia de identidade e reconciliação entregues no código:** `POST /api/v1/imports/identity-check` verifica até 500 IDs externos e `POST /api/v1/imports/reconciliation-preview` analisa até 100 registros normalizados. Ambos são tenant-scoped, exigem `integrations.manage` e não persistem dados. A reconciliação detecta vínculo existente/conflito de tipo e sugere candidatos por igualdade exata de nome de conta, e-mail ou telefone normalizados; retorna status de origem sem conversão. A tela **Importações** permite analisar CSV normalizado e revisar os resultados. Não usa fuzzy match, não importa, cria, atualiza, funde ou vincula registros. Permanecem pendentes adapters e payloads reais de Twenty/Chatwoot/Sofia, aprovação/resolução dos conflitos e importação persistente.

**Visão Hoje entregue no frontend:** a página inicial reúne tarefas abertas vencidas/do dia, handoffs aguardando aceite, leads respondidos e oportunidades em risco, com links às filas existentes e atualização manual. As consultas usam o tenant ativo; tarefas e leads respondidos são filtrados pelo usuário logado, handoffs solicitados continuam compartilhados conforme permissão, e riscos vêm da carteira do usuário (até 100 oportunidades). A página não executa mudanças e mantém resultados parciais se uma consulta falhar. Recorte por equipe e paginação de riscos ainda não existem.

**Atribuição de leads entregue no código (migration ainda não aplicada):** responsável nullable, filtro e ordenação por pessoa, lista de membros do tenant para quem tem permissão, e seleção na tabela. Leads criados ficam atribuídos ao criador; registros antigos seguem sem backfill e respostas sem responsável aparecem na visão Hoje para distribuição. `PATCH /api/v1/leads/:id/assignee` exige `leads.assign`, valida membership do destino e grava auditoria com antes/depois e correlation ID. A visão Hoje filtra tarefas e leads respondidos para o usuário logado.

**Resultado de tarefas entregue no código (migration ainda não aplicada):** a tela exige registrar se a ação foi concluída, houve contato, não houve resposta ou é necessário retornar. Retorno exige próxima ação e data futura; a nova tarefa é criada atomicamente ao concluir a anterior, mantendo responsável. Resultado/nota e os dois eventos recebem auditoria/correlation ID; `leads.next_action_at` é recalculado ou removido quando não há tarefa aberta. Tarefas concluídas no legado preservam campos de resultado vazios. Clientes antigos sem body continuam funcionando com resultado `completed`.

**Relatório inicial do funil entregue no código:** rota tenant-scoped exige `reports.read`. Mostra snapshot atual de leads por status e oportunidades abertas por etapa, quantidade sem próxima ação/vencida e, no período selecionado, leads/oportunidades criados e fechamentos ganhos/perdidos, além de valor ganho agregado por moeda. A taxa de ganho usa apenas decisões (ganhos + perdas) nesse período. Snapshots atuais não são filtrados pela janela; o relatório não estima conversões entre etapas nem segmenta por usuário/equipe. Datas de filtro são dias UTC; migration não necessária.

**Dashboard gerencial — próxima evolução:** Relatórios mostra tendência diária de leads/oportunidades criados e fechamentos por data do evento em UTC, série diária de uso/custo estimado da IA e coortes diárias de lead. A coorte usa leads criados em cada dia como denominador e conta, até o fim do período selecionado, quem atingiu `responded`, `converted_to_sdr` ou teve uma oportunidade criada; exibe contagem e idade em dias para explicitar que grupos recentes têm menos acompanhamento. As taxas não atribuem conversão a vendedor. O relatório também mostra aging da carteira aberta por etapa (dias desde a última mudança: até 7, 8–14, 15–30 e acima de 30), com agregação tenant-scoped e equivalência tabular. O valor atual do pipeline também é apresentado por etapa e moeda, sem conversão entre moedas; oportunidades sem valor ou moeda ficam fora da soma e são contadas separadamente. Próximos gráficos: resultados de closers comparáveis quando existir histórico de ownership; handoff solicitado/aceito/devolvido e tempo até primeira atividade. Manter filtros tenant-scoped e permitir ir do gráfico ao conjunto de registros que compõe o indicador, expondo fórmula e atualização.

**Pré-requisito de métricas de IA:** migrations `0046`/`0047` e runtime instrumentam tentativas tenant-scoped de geração Anthropic e transcrição OpenAI correlacionadas a conversa, mensagens e evento de fila. Geração traz tokens, latência, hash de prompt, intenção, status e entrega; transcrição traz duração do provider, tamanho do áudio, latência e status. Estimativas de custo em USD carregam revisão versionada da tabela aplicada no instante da execução e não são cobrança confirmada. Histórico de atribuição de owners/equipes e eventos de campanha/envio/opt-out continuam necessários para comparações retroativas e ROI por vendedor/campanha. Separar execuções geradas, mensagens aceitas/entregues pelo provider, resposta humana, handoff e conversão comercial. Sem as fontes que faltam, mostrar apenas o que pode ser contado com precisão, nunca preencher com estimativas.

**Critério para cada gráfico/KPI:** definir evento e fonte canônica, janela/coorte, filtros, fórmula e denominador, unidade/moeda, tratamento de zero/ausente/atrasado, escopo de acesso, limites de retenção e drill-down. Incluir equivalência tabular acessível, estados vazio/erro/dado desatualizado e consultas agregadas paginadas/índices tenant-first. Metas só entram depois de configuração versionada; baseline deve ser capturada antes de sugerir metas.

**Mudança de status com evidência entregue no código:** a tela pede justificativa antes de salvar; a API exige texto de 3 a 1000 caracteres. Status anterior/novo, ator, motivo e correlation ID ficam em auditoria na mesma transação do histórico. Transição para o status atual é recusada como mudança sem efeito.

**Redistribuição de oportunidades entregue no código:** gestores podem atribuir uma oportunidade aberta a um closer ativo do mesmo tenant ou deixá-la sem responsável. A API verifica papel do ator, membership e papel do destino; ganhas/perdidas ficam bloqueadas. Auditoria registra responsável anterior/novo, ator e correlation ID. A carteira reflete a atribuição após atualização.

**Tempo até primeira atividade do closer entregue no código:** passagens aceitas mostram o instante do aceite e o tempo até a primeira atividade de contato registrada (ligação, reunião, e-mail ou mensagem). Se ainda não existe atividade, a fila mostra o tempo corrido aguardando. A medida considera registro manual de atividade, não confirmação de entrega; meta numérica e escalonamento continuam pendentes de configuração.

**Relatório de primeira atividade entregue no código:** acrescenta média em minutos entre aceite e primeira atividade manual para handoffs aceitos no período, quantidade com atividade e quantidade ainda sem registro. O denominador é explicitado; não há limite de SLA presumido. Cálculo usa `occurred_at` da primeira call/meeting/email/message a partir de `accepted_at`.

**Checklist de prontidão para closer entregue no frontend:** o SDR registra decisor/papel, volume, processo de cobrança e necessidade principal. Valores preenchidos são anexados aos fatos confirmados; campos vazios são incluídos como lacunas “não confirmado” no brief. O checklist não bloqueia o handoff; motivo, evidência, próxima ação e prazo continuam obrigatórios. Usa os arrays atuais, sem migration.

**Prévia de duplicidades de lead entregue no código:** antes da criação, consulta possíveis registros do tenant por nome de empresa normalizado, e-mail e telefone. A API revalida no momento da escrita, sem expor os canais dos candidatos; criação duplicada exige justificativa e grava a lista de candidatos na auditoria. Não mescla registros. Busca limitada aos 10 candidatos mais recentes; não usa domínio fuzzy.

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
  - O Inbox reúne vários números autorizados no tenant; canal é filtro/origem da conversa, enquanto owner é o closer/usuário. Conversa nova mantém o número de origem nas respostas.
  - Assumir é uma operação atômica: somente um usuário vence a disputa, vira responsável e recebe confirmação; atribuir e devolver exigem permissão e geram auditoria.
  - Modo humano bloqueia respostas automáticas e trabalhos pendentes antes que qualquer envio seja aceito; falhas e timeouts ambíguos são reconciliados sem duplicar mensagem.
  - O closer pode pedir “Sofia sugerir” para obter resumo/rascunho sem envio, ou “Sofia retomar” para devolver explicitamente o controle automático; ambas as ações preservam contexto, registram ator/hora/motivo e mostram o modo atual.
  - Notas internas, tags, busca, não lidas, filtros por responsável/equipe/canal/status, adiar/arquivar/resolver e histórico de atribuições fazem parte da operação nativa.
  - Uma conversa pode ser compartilhada/visível ao time, mas tem no máximo um responsável primário; o número WhatsApp é independente dessa responsabilidade.

### Eventos comerciais e central do closer — backlog

**Cadastro e health check manual dos canais WhatsApp entregues no código:** API e tela registram um canal por número, com provedor Evolution ou Cloud API e identificadores externos; credenciais são configuradas separadamente e cifradas. O Inbox filtra por canal e apresenta nome/número na conversa. A habilitação do registro define sua disponibilidade para roteamento. `POST /api/v1/channels/:id/health-check` consulta o estado da instância Evolution ou confirma que o token Meta acessa o objeto do número, mostra a hora da consulta e audita o resultado. Cloud API não declara conexão em tempo real. Health check não envia mensagem, não persiste estado corrente e não exige migration. Migration 0014 aditiva preserva conversas existentes com canal nulo. Não existe vínculo operacional com Chatwoot.

**Posse, modo e resposta humana — primeira fatia entregue no código:** `POST /conversations/:id/claim` faz lock transacional e permite um único closer vencedor; `PATCH /conversations/:id/owner` atribui a membro comercial do tenant ou transfere pelo owner atual. Assumir/atribuir muda para modo humano; liberar pausa Sofia; devolver para Sofia é explícito. As mudanças são auditadas. Admin configura credenciais cifradas por canal; `POST /conversations/:id/messages` envia texto direto ao provider quando usuário é owner, modo é humano e canal/telefone estão prontos. Chave idempotente evita reenvio da mesma solicitação; resultado distingue aceito, falha e ambíguo. Migrations 0015–0016 ainda não foram aplicadas. A automação Sofia atual não está integrada ao modo; templates, worker/outbox e callbacks com reconciliação de IDs não correlacionados continuam pendentes.

**Notas internas na timeline — primeira fatia entregue no código:** `POST /conversations/:id/notes` registra mensagem interna que não é enviada ao WhatsApp, exige o owner atual, guarda o autor e audita a inclusão sem duplicar o conteúdo da nota no log. Migration 0017 acrescenta autoria da mensagem e ainda não foi aplicada. A listagem visual distingue notas internas de mensagens do contato/equipe.

**Etiquetas de conversa — primeira fatia entregue no código:** etiquetas são compartilhadas dentro de cada tenant, normalizadas para não duplicar variações de maiúsculas/minúsculas, vinculadas às conversas e auditadas. SDR/closer responsável pode adicionar/remover etiquetas e filtrar a fila por etiqueta; Migration 0018 cria tabelas e FKs compostas para impedir vínculo cruzado entre tenants. A migration ainda não foi aplicada; busca livre, cores e gestão administrativa de etiquetas continuam pendentes.

**Busca e filas do Inbox — primeira fatia entregue no código:** pesquisa por empresa, contato ou telefone; filtros server-side por status, responsável (incluindo sem responsável), canal e etiqueta; paginação com total e seletor 10/25/50/100. Quando qualquer critério muda, a fila volta à primeira página. A resposta usa envelope paginado `{data, pagination}`; cliente web atualizado pelo API client centralizado.

**Não lidas individuais no Inbox — primeira fatia entregue no código:** cada usuário tem cursor de leitura por conversa; mensagens inbound posteriores aparecem como não lidas para ele, sem limpar a fila dos outros closers. Abrir a conversa marca como lidas somente até a última mensagem inbound carregada na timeline; o cursor não aceita outbound, mensagem de outra conversa ou tenant. Filtro “somente não lidas” combina com busca, canal, etiqueta, status e responsável. Migration 0019 aditiva ainda não foi aplicada.

**Eventos do closer — sinais e ciclo inicial implementados:** cada resposta após handoff aceito cria evento idempotente atribuído ao owner. Pedido explícito para falar com uma pessoa em oportunidade ativa atribuída a closer gera `human_requested` urgente; pergunta inbound em oportunidade ativa de closer gera `closer_question` alta; pedido explícito de reunião/demo, proposta/orçamento ou início de contratação/teste gera `buying_intent` alta. Os sinais reutilizam o evento daquela mensagem e preservam o texto-fonte. Endpoint autenticado por canal recebe falha explícita de interpretação; falhas permanentes de recusa ou resposta estruturada inválida no runtime do assistente agora usam o mesmo fluxo correlacionado, elevando a ocorrência para `interpretation_failure` urgente quando há oportunidade elegível atribuída a closer. A central permite abrir, reconhecer, adiar, redistribuir e concluir; ações são auditadas. Migrations 0020 e 0021 ainda não foram aplicadas. Não há roteamento de pedido humano quando o lead não tem oportunidade com closer dono ou handoff aceito; perguntas fora dos padrões reconhecidos seguem pendentes.

**Central do closer — primeira versão entregue no frontend:** reúne passagens aguardando aceite, eventos novos e oportunidades próprias com próxima ação vencida ou ausente. Mostra conta, contato, motivo/evidência, fatos confirmados, lacunas e prazo; permite aceitar passagem, reconhecer resposta após handoff e abrir Inbox/pipeline. Busca, filtro por tipo, ordenação e paginação usam os componentes existentes. Handoffs, eventos e oportunidades são carregados em páginas até o fim, sem limite fixo de registros na central. A fila atualiza automaticamente a cada 30 segundos enquanto a tela está visível e ao retornar à aba. Metas de SLA por tipo de evento são configuráveis por tenant e definem `due_at` para eventos novos. Quando vencem, alertas in-app idempotentes vão ao closer responsável; a política pode escalar também a owner/admin/manager, sem trocar o owner. O usuário abre a conversa pela central e o alerta é marcado como lido. Horários úteis e canais externos seguem pendentes.

- **Como closer**, quero receber uma fila única do que exige minha intervenção, para agir sem acompanhar todas as conversas de qualificação.
  - Cada item mostra conta, contato, oportunidade/lead, evento, horário, prioridade, prazo, resumo, evidência da conversa, fatos confirmados, lacunas e próxima ação sugerida.
  - Ações disponíveis respeitam etapa e permissão: abrir conversa/oportunidade, aceitar handoff, ligar e registrar resultado, agendar, devolver ao agente com instrução ou encerrar com motivo.
  - A mesma ocorrência atualiza a fila e a notificação; não cria itens duplicados em canais diferentes.
- **Como closer**, quero ser acionado quando houver pedido explícito de humano/reunião, intenção concreta de avançar, resposta nova após handoff, questão fora da autoridade do agente ou falha de interpretação com risco de resposta incorreta.
  - Pedido de humano/reunião e resposta nova na negociação têm prioridade imediata; ausência de próxima ação vencida aparece como ação necessária; atividade rotineira de qualificação fica como atualização resumida.
  - O agente preserva a mensagem que originou o evento e não transforma hipótese ou classificação incerta em fato.
  - Uma resposta comum, reação, eco do agente ou retry de webhook não dispara alerta comercial por si só.
  - A fila “não lidas” é individual por closer; abrir/ler em uma conta não remove itens das filas dos colegas.
- **Como closer**, quero reconhecer, adiar ou atribuir uma notificação e ver seu estado, para deixar claro quem está cuidando do lead.
  - Eventos têm chave idempotente, tenant, origem, entidade, timestamps, prioridade, responsável, prazo e estado (`new`, `acknowledged`, `snoozed`, `resolved` ou `failed`).
  - Reprocessamento do mesmo evento não envia nova notificação nem cria nova tarefa; eventos falhos ficam visíveis e podem ser reconciliados.
  - Preferências de canal e escalonamento são configuráveis por tenant; alertas críticos não podem ser silenciados sem política/auditoria.
- **Como closer**, quero aceitar ou devolver o handoff sem perder a conversa nem duplicar o trabalho.
  - Aceite atribui owner, inicia o SLA definido e bloqueia respostas outbound automáticas conflitantes naquela conversa.
  - Devolução exige motivo/instrução e próxima ação; só então o agente pode retomar o escopo devolvido.
  - Se o lead responder enquanto o closer atua, a oportunidade e sua timeline são atualizadas e o closer recebe um único aviso relacionado ao evento.
- **Como gestor**, quero definir SLA e escalonamento por tipo de evento e equipe.
  - Prazo inicia no evento/aceite conforme a regra selecionada e usa timezone do tenant.
  - Vencimento avisa o owner; escalonamento segue a política configurada, sem inventar prazo padrão ou trocar o owner silenciosamente.
  - Painel mostra tempo até aceite, primeira atividade, itens vencidos e eventos sem responsável, com denominadores e período explícitos.
- **Como closer**, quero que o agente prepare meu próximo passo sem negociar em meu nome.
  - Resumo distingue fatos, declarações do lead, inferências e lacunas e aponta mensagens-fonte com horário.
  - Sugestões incluem ação e justificativa; preço, desconto, contrato, promessa ou reunião só são enviados/executados após autorização prevista na política.
  - O closer pode corrigir o resumo e registrar resultado; correções não apagam a evidência original.
- **Como operador**, quero acompanhar falhas de webhook, fila e canal relacionadas ao evento comercial.
  - Evento mostra correlation ID, origem e estado do processamento; timeout ambíguo não resulta em duplicação.
  - Saúde ruim ou pausa manual bloqueia novos envios, mas não apaga eventos, alertas ou mensagens já recebidas.

**Gatilhos iniciais para entrega incremental:** pedido de humano/reunião; intenção clara de avançar; pergunta comercial fora do playbook; resposta após handoff; handoff sem aceite/atividade dentro do SLA; tarefa vencida ou oportunidade sem próxima ação; falha/baixa confiança do agente (contrato de ingestão implementado; runtime pendente). Começar com fila e notificação in-app; adicionar canais externos e automatização de reunião após integração e idempotência comprovadas.

### BDR/campanha

- **Como BDR**, quero preparar público e prévia antes de iniciar campanha.
  - **Entregue nesta fatia:** criação e listagem tenant-scoped de rascunhos com nome, canal ativo/configurado, janela diária local, timezone, limite diário e intervalo mínimo. A criação gera evento de auditoria. Não há endpoint nem controle para publicar/enviar.
  - **Entregue nesta fatia:** seleção manual paginada de até 500 leads por rascunho, com aptidão e motivo de exclusão calculados no backend. Salvar revalida escopo, canal, agente, contato principal, telefone, status, conversa ativa e revisão do contato; alteração do público é auditada. Leads fora da carteira atual não têm seus dados expostos e ficam preservados; seleção não publica nem cria mensagens.
  - **Entregue nesta fatia:** checagem explícita de prontidão por rascunho revalida tenant e permissão de leitura de integrações, consulta a saúde corrente do provedor e avalia se o horário local atual cai dentro da janela. O resultado é auditado como health check. O painel marca feriados e reserva diária como pendentes, mostra a quantidade selecionada e sempre mantém `canQueue=false`; não existe ação de envio.
  - Prévia informa elegíveis e excluídos por razão, quota por canal, amostra de conteúdo e estado do canal.
  - Opt-out, canal pausado, saúde ruim ou janela inválida não gera job de envio.
  - Job repetido com mesma chave não envia segunda mensagem.
  - Estado “abordado” só muda após confirmação definida pelo adaptador; falha fica visível e reprocessável com segurança.

### Preparação de leads importados para o SDR

- **Entregue no código:** a lista de Leads oferece revisão por registro com motivos calculados no backend, filtrados pela organização e carteira do usuário: contato principal, telefone em formato utilizável, canal ativo configurado, agente habilitado com instruções, status `ready`, status de não contatar, conversa ativa existente e decisão de abordagem pendente/bloqueada.
- A ficha de cada contato permite registrar decisão pendente/aprovada/bloqueada, fundamento da política da empresa e evidência/referência; decisões finais exigem os dois campos, guardam revisor/data e geram auditoria. A migration aditiva `0048_giant_lady_deathstrike.sql` atribui `pending` aos contatos existentes e ainda não foi aplicada.
- A decisão aprovada remove somente o bloqueio de revisão daquele contato. A revisão de prontidão continua verificando os demais requisitos. Ela não afirma que a política registrada é juridicamente adequada.
- **Entregue:** a prévia SDR em Leads lista, com paginação e escopo de tenant/carteira, todos os leads `ready` da página, permite selecionar um canal interno ativo/configurado e detalha os requisitos ausentes por lead. O backend revalida o canal na empresa ativa. A contagem diferencia leads sem bloqueio identificado e leads com bloqueios na página.
- A prévia é somente leitura. Não cria campanha, conversa, tarefa ou mensagem, e não afirma que envio está liberado: saúde do canal, janela/feriados, quotas e ownership/opt-out precisam ser revalidados pelo futuro executor.
- Importar ou revisar não cria conversa, não muda o status para “contacting” e não envia mensagem.
- A fila de primeira abordagem ainda depende de política explícita por fonte, quota/janela, opt-out, ownership humano e processamento idempotente por outbox.
- O runtime atual do agente atende mensagens inbound; não é um executor de primeira abordagem. Reutilizar esse worker para outbound não é aceito sem um fluxo próprio de campanha, autorização, opt-out e reconciliação de entrega.
- Consentimento/legítimo interesse e proveniência da permissão de contato ainda não têm representação estruturada no modelo. Não inferir permissão a partir de telefone público, fonte de importação ou canal configurado; definir a política por fonte e registrar evidência antes de liberar envio real.

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
5. **Handoff e inbox**: ownership, brief, SLA, assumir/devolver conversa, modos de automação e resposta pelo produto via adapters diretos dos provedores.
6. **Central do closer**: primeira versão entregue com handoffs, eventos de resposta após handoff e oportunidades que precisam de ação; já atualiza a fila automaticamente a cada 30 segundos quando visível. Evoluir com outros gatilhos, contexto de conversa, push e SLA.
7. **Eventos e notificações**: conectar webhooks, deduplicação/idempotência, pausa de Sofia por ownership, SLA e escalonamento; liberar um gatilho por vez.
8. **IA assistiva**: resumo com evidências, fatos/lacunas e sugestão sem envio; avaliar contra casos; versionar playbooks.
9. **Automação de baixo risco**: alertas e tarefas; depois retornos explicitamente combinados; medir/rollback.
10. **Canal e campanhas**: Evolution e campanha canary com volume limitado, quotas e pausa; uma função n8n por vez.
11. **CRM/inbox nativos**: resposta humana, agenda e escrita; migrar leitura/escrita e retirar integrações legadas após reconciliação.

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

### Contas BDR entregue no código

O workspace **Contas** resume a cobertura por empresa: contatos distintos, leads totais, leads com resposta/convertidos para SDR, oportunidades e atividade mais recente. Permite buscar por empresa ou contato, filtrar contas com lead em determinado status, ordenar pelas métricas e paginar. O filtro de status é um critério de inclusão de contas; ele não reduz os totais exibidos. A ação na empresa abre a fila Leads já pesquisada por aquele nome. A visão é somente leitura e usa a organização ativa no servidor. Não substitui ainda o cadastro completo da conta, pesquisa externa, timeline da empresa ou reconciliação de duplicatas.

Configurar antes de liberar automação real: SLA numérico por tipo de handoff; pipeline final e campos obrigatórios; papéis e equipes reais; quotas atuais e responsáveis por aprová-las; calendário/feriados oficiais; política de retenção/consentimento; fontes que podem ser abordadas; integração de agenda; valor/preço autorizado no playbook.

Essas decisões ficam em configuração/versionamento e não exigem mudar o modelo de dados.

## Primeira abordagem nativa de campanha — implementação local (17/11/2026)

- A tela de campanhas coleta mensagem de abertura. Iniciar é uma ação explícita e bloqueada para público vazio; backend revalida canal/health, SDR, janela, datas sem envio, elegibilidade do contato e capacidade diária antes de gravar a outbox.
- Cada lead recebe reserva idempotente. Worker cria uma conversa visível no Inbox, registra a mensagem como solicitada e chama o adapter de texto; revalida tenant, campanha ativa, canal, contato primário, opt-out/revisão de abordagem, conversa ativa e regras de horário/feriado/quota antes do efeito externo.
- Um provider que confirma aceite muda a mensagem para aceita e o lead pronto para `contacting`, com auditoria e histórico de status. Falhas/timeout ambíguo são marcados para revisão e não tentam envio automático novamente.
- Webhooks associam a primeira resposta do lead à conversa de campanha por tenant, canal e pessoa, mesmo quando o ID externo difere do identificador local da conversa.
- Migration `0053_absurd_logan.sql` gerada, não aplicada. Não houve envio real nem migração aplicada. Build/testes não executados por preferência persistente.
- Limitações para fechar o fluxo comercial: expor fila de itens com resultado ambíguo/falho para reconciliação; concluir campanha; revisar limites de quota concorrentes com outros tipos de envio; completar tratamento de oportunidades/alerta ao closer, mídia/áudio e transcrição Whisper. Pausa/retomada foram implementadas localmente nesta fatia: itens pendentes ficam na outbox durante a pausa e voltam a ser processados após retomada; uma mensagem já em andamento pode terminar. Até implementar a reconciliação, qualquer resultado ambíguo requer intervenção operacional no banco/log do evento.

## Atendimento inbound e outbound por canal — backlog de produto (17/11/2026)

Objetivo: permitir vender o 30Sales como chatbot inbound, atendimento humano assistido ou operação de prospecção outbound, com canais WhatsApp configurados independentemente por empresa. Evolution/Cloud continuam sendo transporte; regras e contexto ficam no 30Sales.

### Ordem de entrega

1. **Política por número (em andamento):** cada canal escolhe `inbound`, `outbound` ou `hybrid` e configura fuso e janelas semanais. Em `outbound`, a janela limita somente a primeira abordagem da campanha; respostas em conversas existentes podem ser atendidas a qualquer hora. Em `inbound` e `hybrid`, o modo da assistente define se responde sempre, durante ou fora do expediente, ou fica desativada. Sem janelas configuradas, o canal funciona 24 horas.
2. **Atendimento inbound fora do expediente (primeira fatia):** a assistente continua usando as instruções da organização e, quando precisa de uma pessoa, informa que a equipe retorna no próximo período de atendimento sem prometer horário exato. Mensagens recebidas avisam o responsável da conversa, do lead ou da oportunidade quando houver. Em canal outbound, se não existir responsável válido, o alerta vai para membros com papel de atendimento; respostas humanas continuam liberadas em qualquer horário. Pedido explícito de pessoa e intenção comercial também geram alertas idempotentes por mensagem em inbound/hybrid quando a janela está fechada; o pedido explícito pausa a automação. Continua pendente uma base de conhecimento aprovada, registrar dados necessários, informar prazo mais específico, tratar reclamações e definir encaminhamento para conversas sem lead.
3. **Grupo de canais outbound:** campanhas distribuem leads entre números habilitados, respeitando saúde, limite diário compartilhado, janela, opt-out e pausa por canal/campanha. Operador acompanha aceite, entrega, resposta e resultado incerto; pausa/retomada/conclusão são explícitas.
4. **Produto chatbot inbound (30Pay e outros):** plano habilita atendimento inbound sem expor CRM/outbound; configura múltiplos números, base de conhecimento, horários, encaminhamento e limites de uso por tenant.
5. **Operação e medição:** painel por número/campanha mostra tempo até primeira resposta, conversas resolvidas pelo bot, escalonamentos, tempo de espera, entrega, opt-out e conversão. Separar métricas de transporte, atendimento e resultado comercial.

### Critérios de aceite da política inicial

- Administrador configura modo e agenda semanal por canal, com timezone IANA e intervalos válidos por dia; em outbound, a agenda regula somente primeiras abordagens, e conversas existentes continuam em qualquer horário. Sem agenda, o canal funciona 24 horas.
- API valida tenant e permissão; persistência é relacional e tenant-scoped. Atualização da política é atômica e auditada.
- Atualizações parciais validam a política resultante usando os campos novos e o estado persistido; modos de resposta `business_hours`/`after_hours` exigem pelo menos uma janela quando o canal aceita automação inbound/hybrid.
- Runtime inbound/hybrid revalida o modo da assistente antes de gerar e imediatamente antes de responder. Em outbound, respostas manuais da equipe em conversas existentes não são limitadas por expediente; a assistente automática não responde nesse modo. Campanhas revalidam a janela do canal ao iniciar e imediatamente antes de cada primeira abordagem, além da janela própria da campanha. Fora da janela, o item permanece pendente para nova tentativa.
- Conversas criadas por campanha em canal outbound iniciam com automação pausada; respostas recebidas reabrem a conversa e notificam o responsável ou, sem responsável válido, os membros elegíveis. Ao assumir a conversa, o membro passa a responder em modo humano sem restrição de expediente. Em canal hybrid, preservar o modo inbound configurado para a assistente.
- Janelas não configuradas mantêm a compatibilidade atual. Agenda outbound usa horário local do canal e suporta intervalos que cruzam meia-noite.
- Notificações de nova mensagem e falha de entrega são tenant-scoped e idempotentes: vão ao responsável se ele ainda pertence ao tenant; sem responsável válido, vão aos membros com papel de atendimento, em qualquer modo do canal. Pedido humano e intenção comercial fora do expediente em inbound/hybrid também alertam a equipe; pedido humano pausa respostas automáticas. Sem membro elegível, a conversa continua disponível no Inbox e a automação segue a regra da intenção.
- Respostas geradas enquanto o expediente está fechado usam orientação adicional para não sugerir disponibilidade humana imediata nem inventar data/hora de retorno; sem agenda, o canal é tratado como aberto 24 horas.
- Sem campanha outbound no modo inbound-only; no modo outbound-only, mensagens continuam sendo registradas no Inbox, mas a assistente não responde por esse número.

Não incluído na primeira fatia: novo plano/billing, knowledge base/RAG, roteamento outbound entre vários números, campanha/cadência, feriados e canais externos de notificação.
