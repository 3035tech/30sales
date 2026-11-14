# 5. 30Sales — integrações, API, segurança e operação

## 5.1 Componentes de aplicação

- **Web frontend:** telas de operação, inbox, CRM, campanha e admin.
- **Backend/API de domínio:** autenticação, regras, transições, leitura e comandos.
- **Workers:** jobs de mensagens, cadências, IA, transcrição, sincronização e alertas.
- **PostgreSQL:** estado transacional, outbox/inbox, auditoria e configuração.
- **Object storage:** áudio/anexos com URL assinada e retenção.
- **Secret manager:** tokens de providers; banco guarda referência, não segredo.
- **Queue:** inicialmente tabela Postgres com `SKIP LOCKED` pode bastar; interface para broker dedicado quando throughput exigir.
- **Observabilidade:** logs estruturados, métricas e traces com correlation ID.

Começar como monólito modular e workers do mesmo código-base. Separar deploy de worker da API se necessário, sem separar domínios/serviços prematuramente.

## 5.2 Adaptadores

### Evolution

Responsável por sessão, envio/recebimento WhatsApp e saúde de instância. Normalizar eventos para contrato interno; mapear mensagens e callbacks; redigir tokens; implementar circuit breaker, rate limit, timeout e pausa. Não é fonte de estado comercial.

### Chatwoot

Durante transição: consumir webhook e sincronizar conversas, mensagens, ownership e notas. Cada evento é deduplicado por external event/message ID. Definir um sistema executor único por conversa para evitar double-send. Após inbox interno, manter modo sincronizado opcional.

### Twenty

Importar Companies, People, Opportunities, tasks, notes e campos necessários com mapeamento por external identity. Definir dono do campo e sentido do sync (inbound, outbound, bidirecional explícito). Conflito vira fila de revisão, não last-write-wins cego. Eventos CRM usam outbox/retry.

### Anthropic e STT

Provider abstraction para modelo e transcrição. Timeouts e circuit breaker; limites de custo por organização/campanha; log de versão, latência, tokens/custo estimado e resultado redigido. Fallback não muda ação crítica sem validação. Áudio tem acesso controlado e retenção.

### Calendário e e-mail

Google/Microsoft Calendar por OAuth/scopes mínimos; reserva e checagem de conflitos; eventos externos correlacionados. E-mail/SMTP para notificações e convites como providers substituíveis. Agenda não integrada significa compromisso manual sem status “confirmado” até evidência.

## 5.3 API de domínio (contratos iniciais)

REST `/api/v1`, JSON, UUID, timestamps ISO-8601 UTC, paginação cursor, erros tipados, idempotency key para comandos externos. Exemplos conceituais:

- `GET/POST /accounts`, `GET/PATCH /accounts/{id}`
- `GET/POST /people`, `/accounts/{id}/people`
- `GET /leads?status=&campaign_id=&owner_id=`; `POST /leads/{id}/queue`
- `GET /conversations`, `GET /conversations/{id}/messages`
- `POST /conversations/{id}/messages` (com `Idempotency-Key`)
- `POST /conversations/{id}/assign`, `/handoffs`
- `GET/POST /qualifications`, `POST /qualifications/{id}/facts`
- `GET/POST /opportunities`, `POST /opportunities/{id}/transition`
- `GET/POST /activities`, `POST /activities/{id}/complete`
- `GET/POST /campaigns`, `POST /campaigns/{id}/preview`, `/publish`, `/pause`
- `GET /jobs/{id}`, `/integrations/health`, `/reports/*`
- `POST /webhooks/{provider}` com assinatura/verificação, dedupe e resposta rápida 2xx após persistência durable.

Comandos de negócio usam verbs/commands para validar transition; evitar PATCH irrestrito de stage/outcome. OpenAPI deve definir schemas, permissões, erros, exemplos e versionamento.

## 5.4 Erros e idempotência

Erros API: `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `POLICY_BLOCKED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `REQUIRES_REVIEW`. Retornar correlation ID sem expor stack ou segredo.

Webhooks: verificar assinatura quando provider suportar; inserir evento externo e chave única; responder rápido; processar async. Jobs de envio usam chave derivada de ação/conversa/destinatário/campanha; retry repete consulta/estado antes do efeito, nunca cria um segundo envio cego. Timeout ambíguo vai para reconciliação do provider ou revisão, não “reenviar para garantir”.

## 5.5 Segurança e privacidade

- RBAC por organização/equipe/registro; princípio do menor privilégio.
- TLS, encryption at rest, gestão/rotação de segredos; redaction de PII em logs; nenhum token em exports.
- Separação de dados por `organization_id`; políticas RLS podem reforçar isolamento.
- MFA para admins; sessão curta para operações sensíveis; auditoria de export e acesso a mídia.
- Opt-out e lista de supressão protegidos contra edição comum; mudança exige papel elevado, motivo e trilha.
- Proteção contra prompt injection: conteúdo do lead é dado não confiável; ferramentas permitidas explicitamente; modelo não acessa credenciais/SQL/integrações genéricas.
- Retenção e exclusão por tipo; endpoint/processo para solicitação de acesso/eliminação conforme política aplicável; evitar armazenar mídia além da necessidade.
- Backups criptografados e teste de restore como requisito de operação, com RPO/RTO definidos antes de produção.

## 5.6 SLOs e observabilidade a definir

Antes de produção, acordar alvos numéricos de disponibilidade, RPO/RTO e atraso máximo de webhook/job. Painéis devem medir: tempo webhook→persistência, fila mais antiga, sucesso/falha por provider, entrega por canal, sync drift, retries, erros de IA, custo, opt-out bloqueado, duplicatas impedidas, handoff/SLA e latência das telas.

Alertas: webhook ausente, fila estagnada, credencial/provider inválido, quota/custo acima do limite, canal desconectado, divergência CRM, mensagem ambígua e backup/restore falho. Alertas precisam de runbook/owner.

## 5.7 Ambientes e publicação

Ambientes dev/staging/prod com credenciais separadas. Staging sem envio externo real por padrão; sandboxes/números allowlist. Playbook/política publicada com hash imutável. Feature flags por equipe/campanha/chip. Migração de banco expand/contract; deploy workers compatíveis com versões antigas durante rollout.

Produção exige: revisão de export vivo, migration plan, dry-run, canary, observação, rollback de código/config e processo para efeitos externos que não podem ser revertidos (mensagens, alterações CRM). Nunca reexecutar fila histórica automaticamente durante troca.
