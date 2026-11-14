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

**Canal WhatsApp implementado no schema pela migration 0014 (ainda não aplicada):** `messaging_channels` representa um número por tenant e registra provedor (`evolution` ou `whatsapp_cloud_api`), nome, telefone E.164, identificador do número/instância e WABA ID opcional. O telefone e os identificadores têm unicidade por tenant. `conversations.channel_id` é nullable para preservar histórico legado e tem FK composta de tenant; o Inbox pode filtrar pelo canal e exibe o número de origem. `is_active` habilita/desabilita o registro para futuras regras de roteamento, não representa saúde nem conexão confirmada. A coluna de compatibilidade `chatwoot_inbox_id` da migration gerada fica dormente e não é exposta pela API nem pela interface; preservá-la evita remoção destrutiva, sem tornar Chatwoot dependência. Tokens e segredos não são armazenados; adapters diretos de envio/recebimento ficam para integração P3.

**Modelo operacional nativo do Inbox:** `conversations.owner_user_id` representa o responsável primário, independente do `channel_id`; assumir e liberar fazem lock da conversa e geram auditoria. A migration 0015 adiciona `automation_mode` (`sofia`, `human`, `paused`); assumir define `human`, liberar define owner nulo + `paused`, e “Devolver para Sofia” é uma ação explícita que define `sofia` e owner nulo. Os endpoints exigem `inbox.assign` e isolamento por organização. Ainda não há integração do runtime Sofia com esse estado: esses controles persistem a intenção operacional no 30Sales, mas não pausam workflows legados nem enviam mensagem. Antes de ativar automação, qualquer envio deve revalidar modo/versão antes do provider. Outbox de mensagens, notas, tags e webhooks diretos continuam pendentes. Visibilidade compartilhada não substitui ownership único.

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

`ai_runs`: `id`, `conversation_id`, `model_provider`, `model_key`, `prompt_version_id`, `input_hash`, `output_redacted`, `decision_json`, `usage_input/output`, `cost_estimate`, `latency_ms`, `stop_reason`, `status`, timestamps. Nunca guardar segredo; retenção de conteúdo configurável.

`policy_decisions`: ação, permitido/bloqueado, motivo, política/version, evidências/IDs, actor e timestamp.

`audit_events`: ator, ação, entidade, `before/after` redigidos, motivo, correlation_id, source_ip/device quando permitido, timestamp. Append-only e acesso restrito.

`knowledge_documents`, `playbooks`, `playbook_versions`, `policy_versions`, `prompt_versions`: conteúdo, escopo, hash, validade, aprovação/publicação, autor/revisor e rollback target.

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

A primeira entrega concreta usa as tabelas `public.accounts`, `public.people`, `public.leads` e `public.lead_status_history`, sempre com `organization_id NOT NULL`. A migration `30sales-back/drizzle/0001_glorious_oracle.sql` é aditiva e ainda não foi aplicada.

- `accounts`: id, organization_id, name e timestamps.
- `people`: id, organization_id, name, email, phone e timestamps.
- `leads`: id, organization_id, account_id, person_id, created_by_user_id, `assigned_to_user_id` nullable, source, status, next_action_at e timestamps. Novos leads ficam com o criador; leads anteriores não recebem atribuição automática.
- `lead_status_history`: organization_id, lead_id, status anterior/novo, autor e data da mudança.

As FKs compostas `(account_id, organization_id)` e `(person_id, organization_id)` bloqueiam relações entre tenants. A criação de conta, pessoa, lead e status inicial ocorre numa transação. Status inicial: `new`; transições válidas seguem a máquina de estado BDR em `04_estados_regras_automacoes.md` e são validadas no service e registradas atomicamente no histórico. Enum atual contém `new`, `researching`, `ready`, `queued`, `contacting`, `responded`, `converted_to_sdr` e as saídas controladas `invalid_contact`, `no_channel`, `out_of_profile`, `duplicate_review`, `no_response`, `paused`, `do_not_contact`.

A migration aditiva `0012_assign_leads.sql` adiciona responsável nullable e índice por tenant/responsável/status. A atribuição valida membership no tenant ativo, exige `leads.assign` e registra `lead.assigned` com antes/depois e correlation ID na mesma transação. Rollback seguro é voltar a aplicação e manter a coluna aditiva; remover a coluna requer migration separada e revisão explícita dos dados.
