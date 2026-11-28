# 3. 30Sales — modelo de dados

Modelo lógico proposto para PostgreSQL. Tipos são indicativos; IDs internos UUID. Toda tabela de domínio tenant-owned leva `organization_id NOT NULL`, `created_at`, `updated_at`, `created_by`, `updated_by` quando aplicável. `users` são identidades globais e memberships ligam usuários ao tenant. Catálogos globais são allowlisted e não contêm dados de cliente. Dados externos não são chaves primárias.

## 3.1 Entidades principais

### `organizations`

`id UUID PK`, `name TEXT M`, `slug TEXT UNIQUE`, `timezone TEXT M`, `default_locale TEXT`, `status ENUM(active,suspended)`, timestamps.

### `teams` e `users`

`teams`: `id`, `organization_id FK`, `name`, `team_type`, `active`.  
`users`: identidade global — `id`, `name`, `email CITEXT UNIQUE global`, `status`, `timezone`, `last_seen_at`.  
`organization_memberships`: `id`, `organization_id FK`, `user_id FK`, `role`, `status`, `invited_by`, `joined_at`, timestamps; unique `(organization_id,user_id)`. Um usuário pode participar de várias organizações.  
`team_memberships`: `(team_id,user_id)` unique, `role`, `valid_from`, `valid_to`; organização da equipe e usuário precisa coincidir.  
`permissions` podem começar por RBAC fixo no código, com escopos gravados; evitar construir permission-builder genérico no MVP.

### `accounts`

`id`, `organization_id`, `name`, `legal_name`, `domain`, `website`, `segment_id`, `subsegment`, `country_code`, `region_code`, `city`, `employee_range`, `volume_estimate`, `volume_confirmed`, `volume_unit`, `status`, `owner_user_id`, `owner_team_id`, `do_not_contact_at`, `do_not_contact_reason`, `created_source`, timestamps, `archived_at`.

Índices: `(organization_id,name)`, domínio normalizado, status/owner, busca textual. Não impor unicidade rígida por nome/domínio sem fluxo de merge. Telefones são contatos associados, não coluna única da conta.

### `people`, `account_people`, `contact_points`

`people`: `id`, `organization_id`, `declared_name`, `profile_name`, `job_title`, `buying_roles TEXT[]/join`, `notes`, timestamps, `archived_at`.

`account_people`: `account_id`, `person_id`, `relationship_type`, `is_primary`, `valid_from`, `valid_to`, `source_id`, unique parcial para relacionamento ativo conforme regra.

`contact_points`: `id`, `organization_id`, `person_id NULL`, `account_id NULL`, `kind` (phone,email,whatsapp,website), `value_normalized`, `value_display`, `validity_status`, `verified_at`, `verification_source`, `is_primary`, `do_not_contact_at`, `do_not_contact_scope`, `metadata JSONB`. Índices de dedupe por valor normalizado sem forçar união automática de identidades.

### `sources`, `campaigns`, `leads`

`sources`: catálogo versionado de origem (twenty_cold, ads_google, referral etc.), canal inicial e política.

`campaigns`: `id`, `organization_id`, `name`, `objective`, `source_id`, `channel_id`, `owner_team_id`, `playbook_version_id`, `status`, `timezone`, `start_at`, `end_at`, `eligibility JSONB`, `cadence_version_id`, `quota_config JSONB`, `approved_by`, `published_at`, `version`.

`leads`: relação de prospecção, não entidade pessoa. `id`, `organization_id`, `account_id`, `person_id NULL`, `campaign_id NULL`, `source_id`, `status`, `status_reason`, `owner_user_id`, `owner_team_id`, `first_attempt_at`, `last_attempt_at`, `last_response_at`, `next_action_at`, `converted_opportunity_id NULL`, `do_not_contact_snapshot`, `external_ref`, timestamps.

Unicidade idempotente por `(organization_id,campaign_id,account_id,person_id)` com política para pessoa desconhecida. Dedup global por empresa não deve apagar jornadas históricas de campanhas diferentes.

### `conversations`, `messages`, `attachments`

**Canal WhatsApp implementado no schema pelas migrations 0014–0016 (ainda não aplicadas):** `messaging_channels` representa um número por tenant e registra provedor (`evolution` ou `whatsapp_cloud_api`), nome, telefone E.164, identificador do número/instância, WABA ID opcional e credenciais opacas cifradas (AES-256-GCM). A API não devolve segredos. `conversations.channel_id` é nullable para preservar histórico legado e tem FK composta de tenant; o Inbox filtra pelo canal, mostra número de origem e indica se pode responder. `is_active` habilita/desabilita envio, mas não representa saúde/conexão confirmada. A coluna de compatibilidade `chatwoot_inbox_id` permanece dormente; não é exposta e Chatwoot não é dependência.

**Modelo operacional nativo do Inbox:** `conversations.owner_user_id` representa o responsável primário, independente do `channel_id`; assumir e liberar fazem lock da conversa e geram auditoria. A migration 0015 adiciona `automation_mode` (`sofia`, `human`, `paused`); assumir define `human`, liberar define owner nulo + `paused`, e “Devolver para Sofia” é uma ação explícita que define `sofia` e owner nulo. Os endpoints exigem `inbox.assign` e isolamento por organização. Ainda não há integração do runtime Sofia com esse estado: esses controles persistem a intenção operacional no 30Sales, mas não pausam workflows legados nem enviam mensagem. Antes de ativar automação, qualquer envio deve revalidar modo/versão antes do provider. Outbox de mensagens, notas, tags e webhooks diretos continuam pendentes. Visibilidade compartilhada não substitui ownership único.

**Resposta humana:** a migration 0016 adiciona chave idempotente por conversa à tabela `messages`; uma repetição da mesma chave retorna a mensagem já registrada sem novo envio. O backend exige que o usuário autenticado seja o owner e o modo da conversa seja `human`, prepara a mensagem em estado `requested` e a envia diretamente ao provider. Respostas confirmadas pelo provider ficam `accepted`; erro explícito fica `failed`; timeout/5xx ambíguo fica `unknown` e não recebe retry automático. O ciphertext de credenciais é associado por AAD a tenant + channel; `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` é segredo durável de instalação e não deve ser trocado até existir fluxo de rotação/recriptografia.

**Anexos outbound do Inbox:** reutilizam `message_attachments` já tenant-scoped e a chave idempotente da mensagem; um arquivo de até 16 MiB (imagem, vídeo, PDF ou áudio) é validado na API, gravado no S3 privado e enviado pelo adapter correspondente. A timeline registra metadados e estado de entrega sem armazenar bytes no PostgreSQL. Áudio é enviado sem legenda; a Evolution usa `sendWhatsAppAudio`, e áudio OGG/Opus na Cloud API é sinalizado como voice/PTT. Uma falha ambígua não é repetida automaticamente. A versão inicial aceita um arquivo por mensagem e mantém o envio síncrono; gravação direta pelo microfone e envio assíncrono/outbox ficam para outra fatia.

`conversations`: `id`, `organization_id`, `channel_id`, `external_conversation_id`, `account_id NULL`, `primary_person_id NULL`, `opportunity_id NULL`, `owner_user_id NULL`, `owner_team_id NULL`, `automation_owner` (sofia/human/none), `status`, `inbox_key`, `last_message_at`, `last_inbound_at`, `last_outbound_at`, `resolved_at`, `metadata`, timestamps. Unique `(channel_id,external_conversation_id)`.

`messages`: `id`, `organization_id`, `conversation_id`, `external_message_id`, `direction`, `actor_type` (contact/user/assistant/system), `actor_id NULL`, `message_type`, `body_text`, `transcript_text`, `send_state`, `provider_timestamp`, `received_at`, `sent_at`, `delivered_at`, `read_at`, `failure_code`, `reply_to_message_id NULL`, `ai_run_id NULL`, `policy_decision_id NULL`, `metadata_redacted JSONB`. Unique externo por canal quando ID existe. Conteúdo é append-only; correção vira anotação/versão, não alteração silenciosa.

`attachments`: `id`, `message_id`, `storage_key`, `mime_type`, `size_bytes`, `checksum`, `transcription_state`, `retention_until`, `access_class`. Blob fora do banco.

### `qualifications`, `qualification_facts`

`qualifications`: `id`, `organization_id`, `lead_id`, `account_id`, `person_id`, `status`, `readiness_status`, `playbook_version_id`, `owner_id`, `started_at`, `completed_at`, `summary`, timestamps.

`qualification_facts`: `id`, `qualification_id`, `fact_key`, `value_json`, `value_state` (confirmed/unknown/not_applicable/conflict/estimate), `source_type`, `source_message_id NULL`, `source_activity_id NULL`, `confidence NUMERIC NULL`, `confirmed_by NULL`, `confirmed_at`, `created_at`. Histórico append-only; visão atual seleciona fato mais recente confirmado ou em conflito.

### `opportunities`, `pipelines`, `stage_history`

`pipelines`: `id`, `organization_id`, `name`, `version`, `active`, `config JSONB`.  
`pipeline_stages`: `id`, `pipeline_id`, `key`, `label`, `position`, `terminal_outcome NULL`, `required_fields JSONB`, `sla_config JSONB`.

`opportunities`: `id`, `organization_id`, `account_id`, `primary_person_id NULL`, `pipeline_id`, `stage_id`, `outcome` (open/won/lost/disqualified), `owner_user_id`, `owner_team_id`, `product_key`, `name`, `amount NUMERIC`, `currency CHAR(3)`, `plan_interest`, `source_id`, `campaign_id NULL`, `referring_account_id NULL`, `forecast_category NULL`, `next_action_text`, `next_action_at`, `meeting_status`, `closed_at`, `loss_reason_key`, `loss_reason_text`, `summary_current`, `summary_source_version`, `created_from_lead_id NULL`, timestamps, `archived_at`.

`stage_history`: opportunity, from/to stage, actor, reason, occurred_at, required-data snapshot. Fechado ganho exige `closed_at`; perdida exige motivo; oportunidade aberta exige próxima ação ou estado de espera com `next_action_at`.

`tasks` (implementado na primeira entrega operacional): organização, lead, descrição, prazo, estado (`open`, `completed`, `cancelled`), usuário criador, data de conclusão e timestamps. FK composta `(lead_id, organization_id)` impede tarefas vinculadas a leads de outro tenant. `leads.next_action_at` é mantido como projeção do prazo aberto mais próximo; a fila consulta as tarefas como fonte de verdade.

A migration `0013_task_outcomes` acrescenta `completion_result` (`completed`, `contacted`, `no_response`, `follow_up`) e `completion_note`, ambos nullable para preservar tarefas históricas. Concluir com `follow_up` cria a próxima tarefa na mesma transação, atribuída ao responsável atual da tarefa, grava auditoria para ambos os eventos e recalcula `leads.next_action_at`; sem próximas tarefas, o campo é limpo.

`opportunities` (primeiro handoff): organização, lead, conta, contato principal, nome, etapa, owner closer opcional, criador e timestamps. Nesta primeira versão há unicidade por lead; remover a limitação ao implementar múltiplas oportunidades por conta/lead.

`handoffs`: oportunidade, status (`requested`, `accepted`, `returned`, `cancelled`), motivo, evidência, fatos confirmados, lacunas, próxima ação e prazo, usuário solicitante, closer que aceitou, motivo de devolução e timestamps. `handoff_history` registra ator, evento, observação e horário para cada solicitação, aceite e devolução. Ambas têm `organization_id` e FKs compostas para impedir cruzamento de tenant.

O pipeline adiciona a `opportunities`: valor decimal potencial/fechado, moeda ISO, data real de fechamento, motivo de perda, próxima ação, prazo e `stage_changed_at`. Valores são nulos até serem informados; amount em oportunidade aberta é potencial, e em `won` é valor fechado. `opportunity_stage_history` preserva etapa anterior/nova, ator, motivo e data. A migration mantém os campos operacionais aditivos para permitir atualização gradual do código.

### `activities`, `handoffs`, `appointments`

`activities`: `id`, `organization_id`, `type`, `status`, `subject`, `description`, `owner_user_id`, `team_id`, `account_id`, `person_id`, `lead_id`, `opportunity_id`, `conversation_id`, `due_at`, `completed_at`, `result_key`, `evidence_message_id`, `external_ref`, timestamps.

`handoffs`: `id`, `organization_id`, `conversation_id`, `qualification_id`, `opportunity_id`, `from_owner_type/id`, `to_owner_type/id`, `status`, `reason_key`, `brief_snapshot JSONB`, `requested_at`, `accepted_at`, `returned_at`, `return_reason`, `sla_due_at`, `accepted_by`, timestamps.

`appointments`: `id`, `organization_id`, `opportunity_id`, `conversation_id`, `calendar_provider`, `external_event_id`, `start_at`, `end_at`, `timezone`, `status`, `participants JSONB`, `meeting_url`, `confirmation_source`, `confirmed_at`, `cancelled_at`, timestamps. Unique por provider/external_event_id.

### `channels`, `integrations`, `external_identities`

`channels`: `id`, `organization_id`, `provider`, `channel_type`, `display_name`, `status`, `health_status`, `last_health_check_at`, `limits JSONB`, `config_secret_ref`, `paused_at`, `pause_reason`, timestamps.

`integrations`: provider, connection status, scopes, secret reference, sync mode, last sync, error summary redigido. Segredos ficam em secret manager, nunca em JSONB ou logs.

`external_identities`: `(organization_id,entity_type,entity_id,provider,external_id)` unique; guarda `last_synced_at`, `sync_version`, `sync_status`, `conflict_state`, `external_updated_at`.

### `automation`, `ai`, `audit`

`jobs`: `id`, `organization_id`, `job_type`, `idempotency_key UNIQUE`, `aggregate_type/id`, `status`, `attempts`, `available_at`, `locked_at`, `locked_by`, `payload_redacted`, `last_error_code`, `completed_at`, timestamps. Índice parcial de jobs prontos.

`outbox_events`: evento de domínio, agregado, sequência, payload, `published_at`, retries. `inbox_events`: provider, external_event_id unique, recebido, processado, hash/body redigido.

Visão evolutiva para `ai_runs`: `id`, `organization_id`, `conversation_id`, `model_provider`, `model_key`, `agent_version_id`, `prompt_version_id`, `input_hash`, decisão estruturada, tokens, custo estimado, latência, stop reason, estado e timestamps. Persistir conteúdo de entrada/saída somente se houver necessidade de produto, com redação e retenção definidas; a tabela inicial `assistant_runs` não armazena esse conteúdo.

`policy_decisions`: ação, permitido/bloqueado, motivo, política/version, evidências/IDs, actor e timestamp.

`audit_events`: ator, ação, entidade, `before/after` redigidos, motivo, correlation_id, source_ip/device quando permitido, timestamp. Append-only e acesso restrito.

`knowledge_documents`, `playbooks`, `playbook_versions`, `policy_versions`, `prompt_versions`: conteúdo, escopo, hash, validade, aprovação/publicação, autor/revisor e rollback target.

### Dados para métricas gerenciais

Os relatórios são projeções calculadas a partir dos eventos e entidades de domínio; não gravar totais agregados como fonte paralela da verdade. Eventos devem ser append-only, tenant-scoped, idempotentes e ter `occurred_at`/`recorded_at` distintos quando o atraso de ingestão for possível. Mudanças de owner/equipe e transições de lead também precisam de histórico para comparar carteiras ao longo do tempo, respeitando a atribuição vigente no evento. Correções de dados não podem reescrever silenciosamente a atribuição histórica.

Para atribuir resultado ao SDR IA, cada execução precisa de registro estruturado equivalente a `ai_runs`, correlacionado à organização, conversa, mensagem/job quando houver, agente e versão publicada de prompt/política. `assistant_runs` registra tentativas tenant-scoped de geração Anthropic e transcrição OpenAI, operação, modelo, status, latência e falha redigida; geração inclui hash do prompt/schema, tokens, intenção, stop reason e entrega. Transcrição inclui duração retornada pela API e bytes do áudio. As duas operações guardam custo estimado em USD e versão dos preços usados; isso é snapshot estimado, não custo confirmado em fatura. Nenhum conteúdo de prompt, resposta ou transcrição é armazenado na telemetria. Ainda faltam versão formal de agente/política e fontes para ownership histórico, campanha e entrega/opt-out. Atribuição comercial deve distinguir assistido pela IA, conduzido por humano e compartilhado, e definir uma janela/coorte antes de calcular conversão. A conversa só ter estado atual `automation_mode` não prova quem conduziu etapas anteriores.

Métricas derivadas devem documentar fonte, população, numerador, denominador, janela/coorte, moeda, timezone, filtros e versão da definição. Valores por moeda ficam separados até existir política de câmbio com fonte e data. Taxas com denominador zero são indisponíveis (não 0%); gráficos de etapa atual são snapshots e não conversão histórica. A série `leadCohorts` agrupa por dia UTC de criação, usa essa população como denominador e conta o histórico de transições para resposta/conversão para SDR e as oportunidades criadas até o fim selecionado; a idade da coorte explicita períodos de acompanhamento diferentes. Ela não atribui resultado a vendedores. Latência e tempos de ciclo devem expor a distribuição, não apenas a média. Custos de provedor são estimativas identificadas como tal e nunca misturados a valores comerciais.

**Lacunas atuais a fechar antes do dashboard completo:** `assistant_runs` mede tentativas de geração/transcrição e estima custos usando preços versionados. Não confirma cobrança real. Ownership histórico de oportunidade e lead não sustenta comparação retroativa completa; campanhas e entregas/opt-outs não têm o registro consolidado descrito na visão de produto. Dados existentes de `lead_status_history`, `opportunity_stage_history`, `handoffs`, `messages`, `tasks` e `activities` permitem começar por cortes de funil, pipeline, atribuição explícita de handoff (`requested_by_agent`) e SLA, com limitações indicadas nos relatórios.

## 3.2 Relações, cardinalidade e invariantes

- Conta ↔ pessoa é N:N com validade e papel; mesmo telefone pode ser compartilhado, não fundir automaticamente pessoas.
- Conta tem 0..N leads e oportunidades; conversa pode anteceder a oportunidade.
- Lead é uma tentativa/jornada de prospecção, não uma pessoa. Campanhas distintas não devem sobrescrever estado umas das outras.
- Mensagem externa é append-only e deduplicada por provider ID; mensagem sem confirmação não atualiza `last_outbound_confirmed_at`.
- Handoff pertence a conversa e oportunidade/qualificação quando existentes; sua snapshot é imutável para preservar o contexto transferido.
- Toda oportunidade ativa tem owner e próxima ação (ou estado de espera explícito com data/evento).
- `do_not_contact` de pessoa/conta/canal é checado no último momento antes do envio e domina qualquer cadência.
- Identificadores externos são aliases. Nunca reutilizar Twenty/Chatwoot IDs como PK interno.

## 3.3 Índices, retenção e particionamento

Começar sem particionar até observar volumes. Índices essenciais: mensagens por conversa/tempo; jobs por estado/available_at; atividades por owner/due_at; oportunidades por pipeline/stage/owner; leads por campanha/status; external identities; auditoria por entidade/data. Avaliar particionamento temporal de messages/audit após medir tamanho e SLA de consulta.

Política de retenção por classe: mensagens e contatos conforme política legal/comercial; mídias podem ter prazo menor que transcrição; execuções técnicas detalhadas têm retenção limitada; eventos de auditoria retêm conforme política. Exclusão deve ser lógica/anonimização com preservação do necessário e registro de expurgo.

## 3.4 Migração do schema atual

Mapeamento base: `sofia_leads` → leads + conversas/contatos associados; `sofia_mensagens` → messages; `sofia_followups` → activities/jobs; `sofia_indicacoes` → referral records/leads relacionados; `sofia_config` → configurações versionadas e playbooks; `monitor_humano_alertas` → alert/job history; CRM outbox atual → outbox_events. Fazer por etapas, com external IDs preservados e reconciliação; não executar migrações históricas indiscriminadamente.


## Fatia implementada: contas, pessoas e leads

O primeiro schema concreto usa as tabelas `public.accounts`, `public.people`, `public.leads` e `public.lead_status_history`, sempre com `organization_id NOT NULL`. A migration `30sales-back/drizzle/0001_glorious_oracle.sql` é aditiva. A aplicação de qualquer migration é específica do ambiente; confira o journal Drizzle antes de planejar uma operação.

- `accounts`: id, organization_id, name e timestamps.
- `people`: id, organization_id, name, email, phone e timestamps.
- `leads`: id, organization_id, account_id, person_id, created_by_user_id, `assigned_to_user_id` nullable, source, status, next_action_at e timestamps. Novos leads ficam com o criador; leads anteriores não recebem atribuição automática.
- `lead_status_history`: organization_id, lead_id, status anterior/novo, autor e data da mudança.

As FKs compostas `(account_id, organization_id)` e `(person_id, organization_id)` bloqueiam relações entre tenants. A criação de conta, pessoa, lead e status inicial ocorre numa transação. Status inicial: `new`; transições válidas seguem a máquina de estado BDR em `04_estados_regras_automacoes.md` e são validadas no service e registradas atomicamente no histórico. Enum atual contém `new`, `researching`, `ready`, `queued`, `contacting`, `responded`, `converted_to_sdr` e as saídas controladas `invalid_contact`, `no_channel`, `out_of_profile`, `duplicate_review`, `no_response`, `paused`, `do_not_contact`.

A migration aditiva `0012_assign_leads.sql` adiciona responsável nullable e índice por tenant/responsável/status. A atribuição valida membership no tenant ativo, exige `leads.assign` e registra `lead.assigned` com antes/depois e correlation ID na mesma transação. Rollback seguro é voltar a aplicação e manter a coluna aditiva; remover a coluna requer migration separada e revisão explícita dos dados.

A importação inicial de leads não altera o schema: agrupa linhas por empresa, cria/reutiliza conta, contato e um lead por empresa; vários contatos são vinculados ao mesmo lead com principal explícito. A transação grava status inicial/histórico, alias de cada registro externo em `external_records` e auditoria. Uma empresa com vários leads ou correspondência conflitante por email/telefone retorna para revisão; não mescla nem altera contatos. O hash do payload serve para conferência, sem guardar uma cópia dos dados de origem. Ativação do SDR após importação depende de regras explícitas de elegibilidade, consentimento/opt-out e canal; não ocorre automaticamente nesta fatia.

### Fatos estruturados de qualificação do lead

A migration aditiva `0072_lead_qualification_facts.sql` introduz `lead_qualification_facts` como histórico append-only, separado do resumo de qualificação do assistente por conversa e do snapshot imutável de handoff. Cada registro guarda chave extensível (`need`, `decision_role`, `purchase_timing` etc.), valor opcional conforme estado, estado (`confirmed`, `unknown`, `not_applicable`, `conflict`, `estimate`), origem (`manual`, `conversation`, `import`, `enrichment`), evidência, mensagem-fonte opcional, confiança, autor e data. Valores desconhecidos/não aplicáveis não são inventados; fatos manuais confirmados/estimados exigem evidência. Mensagens de origem são validadas contra conta e contato do lead, e FKs compostas impedem vínculos entre tenants. `GET /api/v1/leads/{id}/qualification-facts` lista histórico paginado; `POST` inclui fatos auditados. A ficha de contatos do lead já lista os fatos com estado, origem, evidência e data e permite registrar novas observações; correções são novos fatos, preservando o histórico.

O runtime do assistente grava `confirmedFacts` e `unknowns` como listas de texto livre por conversa e handoff. Esses campos não alimentam `lead_qualification_facts` automaticamente. A primeira captura assistida está implementada em `POST /api/v1/leads/{id}/qualification-suggestions`: usa até 20 mensagens inbound recentes, limitadas por tamanho, da mesma conta, contato e linha comercial; escolhe a configuração inbound do canal e aplica fallback de linha/organização quando não há perfil de canal. A IA propõe chave, valor, estado provisório, confiança e trecho literal com `source_message_id`. A API valida a citação contra a mensagem inbound original e a linha do lead; a interface mostra a evidência e exige aceite explícito de usuário autorizado antes de inserir o fato append-only pelo endpoint existente. Sugestões e rejeições não alteram fatos oficiais; sugestões ficam transitórias no cliente, e a geração bem-sucedida registra modelo, mensagens-fonte, quantidade, tokens, latência e custo estimado sem armazenar o conteúdo. Correções geram novo registro. A importação não altera fatos de qualificação nesta versão; mapeamento de colunas e reconciliação com escrita ficam adiados.

A migration aditiva `0074_account_people_relation.sql` cria `account_people`, uma associação tenant-scoped muitos-para-muitos entre contas e pessoas, com chave única por conta/pessoa e FKs compostas. Leads novos e contatos registrados pelo lead passam a gravar essa relação na mesma transação. Ao incluir uma pessoa em outro lead da conta, o backend tenta reutilizar uma correspondência única por email ou telefone + nome, considerando apenas leads que o usuário pode acessar; correspondências ambíguas falham sem criar associação. Até a migration ser aplicada, os vínculos antigos continuam sendo reconhecidos pelas relações existentes em `leads` e `lead_contacts`. A tela de Contas lista relações atuais e históricas no escopo de linha/tenant e permite revogar/restaurar a associação compartilhada sem apagar lead_contacts nem histórico; a revogação é tombstone, auditada, e impede fallback pelas relações legadas. Migration `0075` adiciona estado, ator/data de revogação e índice; `0072`–`0075` foram geradas e não aplicadas. Captura assistida permanece pendente.

Política para backfill histórico de `account_people`: não é pré-requisito para leitura ou operação, pois o código consulta as ligações antigas em `leads`/`lead_contacts` e toda nova mutação grava a associação canônica. Portanto, não executar backfill em lote até existir necessidade observável ou requisito de cobertura completa. Se necessário, começar com relatório/dry-run somente leitura derivado dessas relações explícitas, agrupar pela chave tenant/conta/pessoa e exigir zero conflito de tenant; não inferir associação por nome, email ou telefone. A tabela hoje exige `created_by_user_id`, que não deve receber um usuário histórico arbitrário para simular autoria. Antes de qualquer escrita, definir proveniência de sistema/backfill e autoria, registrar lote/correlation ID e contagens antes/depois; escrita idempotente com rollback por lote só será proposta após revisar esses contratos. Conflitos ou arestas sem origem explícita ficam para revisão manual.

## Segmentação inicial por empresa

A segmentação inicial é uma classificação por empresa, já que o lead representa a oportunidade de prospecção da conta e vários contatos podem pertencer à mesma empresa. `account_segments` guarda categorias configuráveis por organização; `accounts.segment_id` é nullable e referencia uma categoria no mesmo tenant. Os rótulos são dados de configuração, não enums globais do código. Owner/admin/manager podem criar categorias e atribuí-las; alterações geram auditoria. A tela Leads filtra por categoria ou por empresas sem classificação, com escopo e paginação aplicados no backend.

A migration aditiva `0044_low_naoko.sql` preserva contas existentes como “sem segmento”; não há inferência nem atribuição automática. Esta primeira fatia oferece classificação simples por uma categoria por empresa. Não é ainda um construtor de segmentos dinâmicos com regras combinadas, nem inclui segmentação por localização/porte/CNAE ou origem de contato. Essas dimensões devem ser adicionadas com proveniência e estado de confirmação antes de entrarem em filtros comerciais.

A fatia seguinte acrescenta a `accounts` o perfil amplo `market_segment` (`education`, `sports`, `fitness`, `other`) e `student_count` inteiro não negativo. Os campos podem ficar vazios, são editados pelo perfil rápido, auditados e filtrados no servidor em Contas e Leads (perfil e faixa mínima/máxima de alunos). Isso distingue o tipo de operação do segmento comercial livre. Não replica os 28 rótulos específicos do Twenty nem infere valores ausentes; `0045_pretty_violations.sql` é aditiva e ainda não aplicada.

### Expansão baseada no CRM observado no Twenty

Inspeção somente leitura pela API em 27/11/2026 confirmou, em amostras reais, endereço estruturado de Company, CNPJ, origens comerciais, cargos e vínculos de pessoas, valores/estágios de oportunidades, tarefas e notas. O resultado e limites da amostra estão registrados no mapeamento de importação. `accounts` agora mantém campos estruturados de endereço em paralelo ao texto legado; não converter endereços existentes automaticamente, pois isso exigiria inferência.

Os atributos comerciais só devem ser adicionados quando amostras indicarem uso e houver destino claro no fluxo. Alunos, faturamento anual e MRR/valor contratual estavam vazios na amostra consultada; ficam opcionais e não devem ser inferidos. Origem comercial deve ser preservada separadamente de `created_by_type`/`created_by_user_id`, que identificam quem criou a oportunidade. Catálogos configuráveis do CRM preservam API value e label por tenant/provedor; enums globais só representam estados/códigos estáveis do domínio 30Sales. Valores desconhecidos precisam sobreviver ao preview e à importação.

Tasks, Notes, Files, Emails e Timeline devem continuar como objetos relacionados e com histórico próprio. No schema atual, `tasks` já é um objeto separado ligado a lead; `activities` é uma linha do tempo simples ligada obrigatoriamente a opportunity; anexos são metadados/blob privados ligados a mensagens do Inbox. Ainda não existe CRM genérico para notas e arquivos de empresa/contato, nem integração/modelo de emails. Próximas fatias devem ampliar associações de tarefas/atividades para conta, lead, contato e oportunidade; adicionar Notes com autoria/edição/auditoria; arquivos de CRM usando o armazenamento privado S3 existente; e Emails somente após definir provider, direção, participantes e identidade externa. A Timeline deve agregar atividades, mudanças auditadas e relações sem duplicar ou substituir os registros de origem.

Segmentação poderá combinar atributos tipados com sinais derivados de atividade (por exemplo, tarefa aberta ou atividade recente); não deve depender de busca em texto livre de notas, emails ou transcrições. A ficha da conta precisa expor Tasks, Notes, Files, Emails e Timeline como áreas relacionadas, mesmo que alguma integração esteja desativada/vazia, com estados claros. O mapa de origem e os tipos/opções observados estão em `09_mapeamento_fontes_importacao.md`.
