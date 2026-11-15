# Contexto de continuidade — 30Sales

## Retomada em 15/11/2026

- `develop` recebeu a integração de falhas permanentes do modelo à central do closer no merge `db8cf23`.
- A implementação do runtime, seus estados de automação, configurações, interfaces e mensagens usam agora nomes genéricos de assistente; não há referência ao nome pessoal no código-fonte.
- Fatia integrada em `develop` no merge `9fe6c26` a partir de `feature/closer-event-sla-deadlines`: gestores configuram prazo em minutos por tipo de evento; o prazo tenant-scoped é persistido no evento, exibido na fila e não tem valor padrão. Migration gerada `0025_jazzy_bedlam.sql`, ainda não aplicada. O relógio é de horas corridas; notificações e escalonamento automático ficam para outra fatia.
- Fatia atual `feature/closer-sla-notifications`: alertas in-app idempotentes ao closer quando o evento vence e escalonamento opcional para owner/admin/manager, conforme snapshot salvo no evento; a central abre a conversa e marca o alerta como lido. Migrations `0026_silly_obadiah_stane.sql`, `0027_burly_naoko.sql` e `0028_legal_psynapse.sql` foram geradas e não aplicadas.
- As migrations anteriores foram ajustadas para usar `assistant` nos modos e chaves, pois o histórico registrado indica que nenhuma foi aplicada. Nenhuma migration foi aplicada nesta retomada.
- Por preferência persistente, não rodar build/testes nem aplicar migrations sem pedido explícito.

Atualizado em 15/11/2026. Leia este arquivo ao retomar uma sessão longa para recuperar decisões recentes, estado do código e próximo passo. As regras permanentes de engenharia estão em [`../AGENTS.md`](../AGENTS.md); este documento complementa essas regras e não as substitui.

## Objetivo do produto

Construir o 30Sales como produto SaaS multi-tenant para consolidar a operação hoje espalhada em aplicações ao redor da Sofia. A Sofia é o agente SDR; o sistema deve servir BDR, SDR, closer e operações. A meta operacional é mapear todos os leads, conversas, eventos e status, preparar contexto confiável e permitir que o closer concentre seu trabalho no fechamento.

O 30Sales será dono do CRM e do Inbox. Evolution API e WhatsApp Business Cloud API são provedores conectados diretamente e devem ser tratados naturalmente por canal/número. Não usar Chatwoot como runtime ou executor; somente considerar dados dele como fonte histórica de migração. O Inbox deve permitir ownership humano, pausa/retomada explícita da Sofia, resposta manual, notas, etiquetas e contexto compartilhado, respeitando que o número de origem é independente do closer responsável.

## Decisões e preferências persistentes do usuário

- Frontend Vite + React + TypeScript + Tailwind; backend NestJS + TypeScript; PostgreSQL/Drizzle.
- SaaS desde o schema: organização/tenant e vários usuários, isolamento estrito em cada leitura, escrita, chave, job e integração.
- MVC no backend: controller declara endpoint e delega; regra de negócio fica no service. Usar DTOs tipados entre camadas.
- Um único API client no frontend (`30sales-front/src/lib/api/client.ts`); componentes/features não fazem chamadas HTTP diretas nem ficam acoplados aos detalhes da API.
- Todo código técnico em inglês. Interface localizada em pt-BR e inglês com i18next.
- Toda tabela deve ter filtros, ordenação ao clicar em cada cabeçalho e seletor da quantidade de itens por página.
- Git Flow: implementar em feature branch, integrar em `develop` ao concluir a fatia. O repositório está sem remote configurado.
- Dublin/local é o destino planejado, mas não houve deploy nem aplicação de migrations.
- Preferência de trabalho comunicada nesta sequência: priorizar implementação de produto e código; deixar validações/testes para depois. Não rodar build/testes nem aplicar migrations sem pedido explícito.
- Prosseguir autonomamente com fatias verticais pequenas; não interromper com perguntas se houver escolha técnica razoável.

## Estado registrado nesta retomada

- No início da retomada, `develop` tinha polling automático da central integrado; branch atual desta fatia: `feature/closer-sla-notifications`.
- Último commit de funcionalidade em `develop`: `8ee33dd feat(closer): auto refresh work queue`.
- Fatias recentes já integradas em `develop`:
  - envio de respostas humanas pelos adapters Evolution/Cloud API, com credenciais cifradas e idempotência (`7c156db`);
  - notas internas na timeline com autor/auditoria (`35cd4df`);
  - etiquetas tenant-scoped e filtro por etiqueta (`caf2e2d`);
  - ingestão inbound autenticada/deduplicada para Evolution e Cloud API (`273c154`).
- status outbound de Evolution e Cloud API, com atualização monotônica e deduplicação (`f05f84f`).
- busca e filas do Inbox com filtros server-side, contagem e paginação (`3fcae72`).
- fila de não lidas individual por usuário com cursor por conversa integrada em `develop` (`08468fe`); migration 0019 criada, ainda sem aplicação.
- evento idempotente para resposta do lead após handoff aceito integrado em `develop` (`a5caeb9`); atribui ao closer dono, permite reconhecimento e abre a conversa exata no Inbox.
- ações do evento (reconhecer, adiar por uma hora, redistribuir para closer ativo e concluir) integradas em `develop` (`ad89b03`); migration `0021_silent_brood.sql` criada e ainda sem aplicação.
- 5739e02: classifica mensagens inbound como human_requested (urgente) e closer_question (alta), com uma ocorrência idempotente por mensagem, prioridade visual e rótulos pt-BR/en na central. Sem migration.
- 1c4a900: identifica intenção concreta de avançar (reunião/demo, proposta/orçamento e início de contratação/teste) como buying_intent alta; pedido humano mantém prioridade urgente. Considera negação por frase e mantém idempotência/roteamento existentes. Sem migration. Build/testes não executados por orientação.
- 8849abc: recebe sinal explícito de falha de interpretação por canal (Evolution ou Cloud), autentica com segredo próprio de canal, correlaciona mensagem armazenada, cria/eleva uma única ocorrência urgente e exibe motivo na central. Sem migration; integração do runtime do assistente foi feita em fatia posterior.
- 8ee33dd: adiciona polling da central a cada 30 segundos quando visível e ao retornar à aba, sem limpar os itens durante a atualização. Sem migration.
- Antes dessas, já estavam implementados ownership/atribuição de conversas e controles de modo de automação (`dc60b74`, `880920e`).
- Migrations geradas até `0028_legal_psynapse.sql`. As migrations continuam **não aplicadas** em qualquer banco/ambiente nesta sessão.
- Não houve deploy, envio real de mensagem ou aplicação de migration.

## Comportamento inbound entregue no código

- Meta Cloud API: callback GET verifica `META_WEBHOOK_VERIFY_TOKEN`; POST valida HMAC SHA-256 em `X-Hub-Signature-256` usando `META_APP_SECRET` e o corpo bruto.
- Evolution: `POST /api/v1/webhooks/evolution/:channelId` exige `X-30Sales-Webhook-Key`, segredo exclusivo de webhook por canal; verifica também a instância configurada. A API key de envio é separada.
- Evolution `MESSAGES_UPSERT` e Cloud `entry[].changes[].value.messages` são deduplicados em `inbox_events` e persistidos com tenant, contato, conversa e mensagem. Conversa inbound reabre como `open`.
- Ignora eventos Evolution originados pelo próprio número, grupos, broadcast e LID sem telefone resolvível. Texto/caption e algumas respostas interativas são extraídos; mídia sem texto fica sem anexos estruturados por enquanto.
- Identidade só associa a pessoa/lead/oportunidade quando encontrada no tenant. Número desconhecido pode criar Person sem inventar conta ou lead.
- Conversa nova inicia com automação `paused`, owner vazio; runtime da Sofia ainda não foi ligado ao 30Sales.
- Configuração e instruções de callback foram acrescentadas a `.env.example`, tela de canais e documentação. `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` são configurações do servidor.

## Última fatia concluída: status outbound do WhatsApp

Meta Cloud API oficial documenta callbacks de estado no campo `value.statuses[]`, separado de `messages`; status pode chegar em eventos distintos (`sent`, `delivered`, `read`) e usa `statuses[].id` para correlação. Evolution documenta `MESSAGES_UPDATE`; os tipos atuais do projeto indicam estados `PENDING`, `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `ERROR` etc. Fontes primárias consultadas: [Meta messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) e [Evolution webhook configuration](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md).

Implementação integrada na `feature/inbox-delivery-status`: reconhecer ambos os eventos de status, mapear status para o enum existente (`sent`/`SERVER_ACK` → `accepted`; entrega → `delivered`; leitura → `read`; erro → `failed`), correlacionar por organização/provedor/canal/ID externo, deduplicar com ID determinístico e não regredir estado terminal/mais avançado. Nenhuma migration necessária. A UI já exibe `deliveryState` e já possui catálogos pt-BR/en para os estados.

Limitação tratada: callback sem mensagem local é ignorado, então a corrida rara em que o callback antecede a gravação do ID externo exige futura reconciliação com worker/outbox. Sem migrations aplicadas, deploy ou teste/build nesta sessão.

## Últimas fatias do Inbox

`GET /api/v1/conversations` agora aceita busca por empresa/contato/telefone e filtros por status, responsável (inclui `unassigned`), canal e etiqueta. Retorna `{data, pagination}`; a tela usa seletor de 10/25/50/100 itens, total e navegação paginada, com strings pt-BR/en. Mude filtros e busca para voltar à primeira página; sequência local impede resposta antiga de sobrescrever busca mais nova. Sem migration.

Leitura não lida é individual: `POST /api/v1/conversations/:id/read` recebe o ID da última inbound carregada, valida conversa/tenant/direção e avança `conversation_reads.last_read_at` ao `created_at` dessa mensagem. `GET /api/v1/conversations` inclui `unread` e aceita `unreadOnly=true`. Migration `0019_outstanding_stryfe.sql` cria a tabela cursor tenant-scoped e índice de mensagens para consulta. A UI marca leitura após carregar mensagens, exibe selo e permite filtrar apenas não lidas. Não aplicar migrations ainda.

Evento do closer: quando uma mensagem inbound é persistida em oportunidade com handoff aceito, cria `closer_events` idempotente e atribuído ao owner. As features integradas implementam: pedido explícito para falar com pessoa vira `human_requested` urgente; pergunta numa oportunidade ativa atribuída a closer vira `closer_question` alta; intenção concreta (reunião/demo, proposta/orçamento, contratação/teste) vira `buying_intent` alta; sinal explícito da Sofia pode criar/elevar `interpretation_failure` urgente via webhook autenticado; ambos reutilizam uma ocorrência por mensagem. Pedido humano depende de oportunidade ativa com closer dono ou handoff aceito; não há roteamento de lead sem oportunidade/owner. Os demais fluxos (reconhecer, adiar, redistribuir, concluir) estão integrados em `develop`. Migrations `0020` e `0021` não foram aplicadas. SLA e push seguem pendentes; polling da central está integrado.

## Próximo passo recomendado

Próxima fatia recomendada após integrar as notificações de SLA: anexos inbound, depois health check/cadastro de conexão. Para anexos, escolher contrato de armazenamento persistente para Dublin/local e estratégia comum de mídia Evolution/Cloud API. Worker/outbox e reconciliação de callbacks que chegam sem ID externo local também permanecem prioritários.

Depois: worker/outbox/retry e reconciliação de timeout/callback sem correspondência; revisar canais externos de notificação quando houver requisito explícito.

## Limites e forma de retomar

- O próximo passo acima é uma recomendação de continuidade, não prova de que o callback já foi implementado.
- Ao começar a próxima sessão, verificar `git status`, `git log`, ler este documento, `AGENTS.md` e as seções pertinentes de `docs/arquitetura_tecnica.md` e `docs/sofia_produto/06_backlog_aceite_entrega.md`. O estado do repositório prevalece sobre este resumo se houve alterações posteriores.
- Não presumir que migrations foram aplicadas, integrações configuradas em produção ou callbacks recebidos só porque o código/documentação existem.
