# Contexto de continuidade — 30Sales

## Continuidade de qualidade de código na `main` — 18/11/2026

- Estado real confirmado ao retomar: branch `main`, limpa antes das fatias, remoto `origin` configurado. Commits recentes de tipagem incluem `58b96e7` (mapa de rotas) e `b647936` (guards DOM no Pipeline/calendário e leitura de cabeçalhos CSV sem cast de record).
- Nesta fatia: `SelectField` deixou de fabricar eventos React completos; callbacks de mudança/foco usam o contrato estrutural mínimo consumido pelas telas, e validação encaminha o evento nativo. O foco de erro verifica o tipo real do botão antes de focar.
- Middleware/controller de webhooks agora compartilham a extensão tipada `Request.rawBody` via declaração Express, removendo casts repetidos. Transcrição valida os tipos possíveis do chunk de stream antes de convertê-lo para Buffer.
- Regra persistente de formulário adicionada a `30sales-front/AGENTS.md`: erros surgem após interação/submissão, são localizados e acessíveis, foco vai para o primeiro inválido e a mensagem não deve causar deslocamento inesperado do layout.
- Commits desta sequência já publicados na `main`: `b647936` guards DOM/CSV; `ffd7c93` contratos de Select, `Request.rawBody` tipado e normalização defensiva do stream.
- Otimização adicional publicada em `3d23133`: notificações de canal desconectado e de tarefas vencidas são inseridas em lote, mantendo idempotência e contagem dos registros efetivamente criados.
- `9fea671` adicionou `organizationId` à leitura de retorno do handoff, reforçando o escopo tenant.
- `c63b0f7` remove cópias repetidas de arrays ao agrupar horários, tags e anexos no Inbox, evitando crescimento quadrático nesses agrupamentos.
- `17077ec` remove asserções de não-null no relatório de conversão e na criação de lead, com fallback caso a identidade atribuída não seja encontrada.
- `2bf4f56` restringe timestamps opcionais na fila do closer antes de formatá-los, sem assertions.
- `435a5bb` concluiu a união Zod discriminada das ações do closer, removendo `!` no service/repository e mantendo payloads estritos.
- `ab1d1c1` processa eventos de SLA sob `SKIP LOCKED` e agrupa leitura de memberships, inserção de notificações em lotes de até 500, atualização de eventos e auditoria; a contagem de escalonamentos continua baseada nos inserts efetivamente criados.
- `820fa81` extraiu ações da fila do closer para componente tipado, capturando o evento opcional uma vez e removendo assertions dos handlers.
- `c7658d3` concluiu o seletor de leads da criação de handoff: loading, erro e lista vazia são estados distintos e localizados em pt-BR/en; submissão fica bloqueada sem opções.
- `9fa351c` removeu casts de arrays de permissões em `TenantAccessService` por meio de helper genérico que mantém os literais de tipo.
- `4102b02` guarda os nomes conhecidos de eventos Evolution em `ReadonlySet`, evitando reconstruir o array de valores para cada verificação de webhook.
- A revisão do Pipeline removeu assertions de chave customizada e de posições finais na ordenação; o repository agora retorna resultado inválido se a chave customizada não estiver presente, mesmo fora do fluxo HTTP.
- A leitura limitada de respostas JSON dos adapters Evolution e Meta foi extraída para `common/read-limited-json-response.ts`, preservando limite de bytes, cancelamento de stream excedente e a distinção entre falha de parse e payload JSON válido.
- A revisão estática dos índices não encontrou evidência suficiente para adicionar índices sem medir consultas reais ou plano de execução.
- Auditoria estática recente: não encontrei outros `catch` totalmente silenciosos nas áreas revistas; Pipeline, Contas, Closer e Handoffs distinguem falha de lista vazia ou preservam os dados anteriores.
- Verificação executada: `git diff --check` e buscas estáticas. Não executar build, testes ou migrations sem pedido explícito. Ainda não houve validação visual ou de compilação destas fatias.
- Próximo passo: continuar a auditoria de assertions/casts, consultas custosas e estados de erro/loading nas áreas ainda não revistas; dividir em fatias pequenas. Confirmar compatibilidade dos tipos alterados no próximo gate de build quando o usuário solicitar validação.

## Auditoria visual e funcional em 15/11/2026

- Inspecionado no Chrome autenticado com tenant e registros fictícios em banco descartável. Ambiente local aberto em `http://localhost:5173/#/closer`.
- Áreas validadas: Hoje, Tarefas, Inbox, Leads, Contas, Pipeline, Passagens para closer, Relatórios e notificações globais; viewport desktop e 390×844.
- Corrigidos nesta fatia: respostas de data agregada em Contas e eventos do closer; ciclo do `refreshRef` no Inbox; estilos completos e responsivos do board Pipeline; cabeçalho global em mobile; conflito entre seletor global de cabeçalhos e cabeçalhos internos; altura da caixa vazia do Inbox mobile; capitalização indevida na descrição de Hoje. Compilações Nest e Vite passaram.
- Pendências da auditoria: título visível duplicado no shell/conteúdo; Inbox sem thread exercitável até configurar canal de teste; bundle JS principal ~691 kB, acima do limite de aviso do Vite. Ver detalhes e evidências em [`auditoria_ux_30sales.md`](auditoria_ux_30sales.md).
- Fatia integrada em `develop` no merge `46fee07` a partir da feature `feature/ux-visual-audit-fixes`. Sem suíte automatizada executada.

## Retomada em 15/11/2026

- `develop` recebeu a integração de falhas permanentes do modelo à central do closer no merge `db8cf23`.
- A implementação do runtime, seus estados de automação, configurações, interfaces e mensagens usam agora nomes genéricos de assistente; não há referência ao nome pessoal no código-fonte.
- Fatia integrada em `develop` no merge `9fe6c26` a partir de `feature/closer-event-sla-deadlines`: gestores configuram prazo em minutos por tipo de evento; o prazo tenant-scoped é persistido no evento, exibido na fila e não tem valor padrão. Migration gerada `0025_jazzy_bedlam.sql`, ainda não aplicada. O relógio é de horas corridas; notificações e escalonamento automático ficam para outra fatia.
- Fatia integrada em `develop` no merge `85609b5` (feature `91e4492`): alertas in-app idempotentes ao closer quando o evento vence e escalonamento opcional para owner/admin/manager, conforme snapshot salvo no evento; a central abre a conversa e marca o alerta como lido. Migrations `0026_silly_obadiah_stane.sql`, `0027_burly_naoko.sql` e `0028_legal_psynapse.sql` foram geradas e não aplicadas.
- Fatia integrada em `develop` no merge `c63d3b8` (feature `101c846`): Evolution/Cloud normalizam metadados de anexos, um worker durável baixa até 25 MiB com retry limitado e guarda os blobs fora do banco; a timeline oferece download autenticado e auditado. Migration `0029_thin_plazm.sql` gerada, ainda não aplicada. Atualização solicitada nesta retomada troca o disco local por bucket S3 privado.
- As migrations anteriores foram ajustadas para usar `assistant` nos modos e chaves, pois o histórico registrado indica que nenhuma foi aplicada. Nenhuma migration foi aplicada nesta retomada.
- Por preferência persistente, não rodar build/testes nem aplicar migrations sem pedido explícito.
- Fatia integrada em `develop` no merge `4215661` (feature `0311e49`): anexos usam bucket S3 privado em vez de disco local, com SSE-S3 ao gravar e leitura pelo backend autenticado. Bucket e região vêm de `MEDIA_S3_BUCKET`/`AWS_REGION`; credenciais usam a cadeia padrão AWS, preferindo IAM role. O bucket/role ainda precisam ser configurados no ambiente de deploy. Sem build/testes por preferência do usuário.
- Fatia integrada em `develop` no merge `f006f48` (feature `06cdf51`): `POST /api/v1/channels/:id/health-check` verifica o provedor manualmente, com autorização tenant-scoped e auditoria de status/horário. Evolution retorna estado da instância; Cloud API confirma somente acesso ao objeto do número. Sem estado corrente persistido ou migration. Sem build/testes por preferência do usuário.

Atualizado em 15/11/2026. Leia este arquivo ao retomar uma sessão longa para recuperar decisões recentes, estado do código e próximo passo. As regras permanentes de engenharia estão em [`../AGENTS.md`](../AGENTS.md); este documento complementa essas regras e não as substitui.

## Integrações Evolution e Meta — cobertura inicial em 17/11/2026

- Inventário e lacunas documentados em [`sofia_produto/08_eventos_integracoes_evolution_meta.md`](sofia_produto/08_eventos_integracoes_evolution_meta.md).
- Webhook Evolution aceita URLs com/sem sufixo por evento; eventos conhecidos e desconhecidos fora dos handlers de mensagem entram deduplicados no `inbox_events` sem persistir payload bruto.
- Campos WhatsApp Business Account da Meta diferentes de `messages` são associados por phone number ID ou WABA ID e registrados com metadados redigidos. Webhook parser dedicado suporta 4 MiB; o restante da API continua limitado a 256 KiB.
- A tela de canais oferece ação explícita para configurar/reaplicar o webhook de cada instância Evolution usando URL pública, segredo no header e eventos suportados; requisição aceita fica auditada sem segredo. Isso ainda não prova alcance do callback nem entrega real dos eventos.
- A tela de canais também lista eventos do ledger por canal (Evolution e Meta), paginados e sem payload bruto, com status, família, horário e código de erro. Eventos novos de mensagem/status levam o ID interno do canal nos metadados redigidos. Ainda não são registrados callbacks rejeitados nem falhas ocorridas antes do ledger; validar build/testes depois, conforme preferência.
- Status recebido antes da mensagem é preservado para futura reconciliação. Ainda sem reprocessamento automático, efeito para estado de conexão/conta, sincronização de contatos/chats ou apresentação do ledger.
- Próxima prioridade de identidade: Meta já envia BSUID `user_id`/`from_user_id` e pode omitir telefone. A ingestão atual ainda exige telefone; implementar alias tenant-scoped antes de considerar Cloud API pronta para usernames. Não rodar build/testes nem aplicar migrations sem pedido explícito.

### Continuação: saúde de conexão Evolution em 17/11/2026

- Webhook `CONNECTION_UPDATE` normaliza e persiste o estado da instância no canal, tenant-scoped. A tela de canais exibe estado e horário; verificação manual de saúde também atualiza os campos.
- Envio humano pelo Inbox retorna erro localizado quando Evolution está comprovadamente conectando/desconectada; runtime do assistente pula o envio nesses estados. Estado nunca observado permanece compatível e não bloqueia; Cloud API não é afetada.
- Alterar credenciais limpa o estado observado, evitando reutilizar saúde de configuração anterior. Migration aditiva `0054_thin_sheva_callister.sql` gerada, não aplicada.
- A transição para `disconnected` também grava um alerta in-app idempotente para os membros do tenant, na mesma transação. A notificação abre Canais. Migration `0055_curved_shard.sql` estende o alvo e tipo das notificações, gerada e não aplicada.
- `git diff --check` passou após a mudança; build e testes não foram executados conforme preferência persistente. A validação ponta a ponta do webhook segue pendente.

## Abstração do API client — concluída (16/11/2026)

- `30sales-front/src/lib/api/client.ts` agora é a camada genérica de transporte: recebe um path e `RequestInit` (incluindo método/body/headers), aplica URL base, credenciais e correlation ID, e retorna a `Response` sem conhecer endpoints nem interpretar erros de domínio.
- Os schemas e tipos compartilhados estão em contracts.ts; validação de resposta e normalização de erros ficam em request.ts. Cada domínio em domains/*.ts escolhe seus paths e métodos e chama o transporte genérico; autenticação Better Auth fica em domains/identity.ts.
- api.ts compõe os módulos para manter a interface api.* já usada pelas telas; index.ts só reexporta tipos e fachada. Paths não aparecem em client.ts.
- Verificação estática de imports/exports dos domínios e git diff --check passaram. Build/testes não rodados por preferência persistente.

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

- Branch atual: `develop`; polling automático da central, notificações de SLA e anexos inbound integrados.
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
- Migrations geradas até `0029_thin_plazm.sql`. As migrations continuam **não aplicadas** em qualquer banco/ambiente nesta sessão.
- Não houve deploy, envio real de mensagem ou aplicação de migration.

## Comportamento inbound entregue no código

- Meta Cloud API: callback GET verifica `META_WEBHOOK_VERIFY_TOKEN`; POST valida HMAC SHA-256 em `X-Hub-Signature-256` usando `META_APP_SECRET` e o corpo bruto.
- Evolution: `POST /api/v1/webhooks/evolution/:channelId` exige `X-30Sales-Webhook-Key`, segredo exclusivo de webhook por canal; verifica também a instância configurada. A API key de envio é separada.
- Evolution `MESSAGES_UPSERT` e Cloud `entry[].changes[].value.messages` são deduplicados em `inbox_events` e persistidos com tenant, contato, conversa e mensagem. Conversa inbound reabre como `open`.
- Ignora eventos Evolution originados pelo próprio número, grupos e broadcast. Meta BSUID sem telefone é preservado como alias tenant-scoped; veja a fatia abaixo. Texto/caption e algumas respostas interativas são extraídos. Esta fatia adiciona anexos de imagem, vídeo, áudio, documento e figurinha, com payload de recuperação cifrado, download por adapter e blob fora do PostgreSQL.
- Identidade só associa a pessoa/lead/oportunidade quando encontrada no tenant. Número desconhecido pode criar Person sem inventar conta ou lead.
- Conversa nova inicia em `assistant` se o tenant habilitou o agente; sem configuração, inicia em `paused`. Ownership humano permanece separado da origem/número do canal.
- Configuração e instruções de callback foram acrescentadas a `.env.example`, tela de canais e documentação. `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` são configurações do servidor.

## Última fatia concluída: status outbound do WhatsApp

Meta Cloud API oficial documenta callbacks de estado no campo `value.statuses[]`, separado de `messages`; status pode chegar em eventos distintos (`sent`, `delivered`, `read`) e usa `statuses[].id` para correlação. Evolution documenta `MESSAGES_UPDATE`; os tipos atuais do projeto indicam estados `PENDING`, `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `ERROR` etc. Fontes primárias consultadas: [Meta messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) e [Evolution webhook configuration](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md).

Implementação integrada na `feature/inbox-delivery-status`: reconhecer ambos os eventos de status, mapear status para o enum existente (`sent`/`SERVER_ACK` → `accepted`; entrega → `delivered`; leitura → `read`; erro → `failed`), correlacionar por organização/provedor/canal/ID externo, deduplicar com ID determinístico e não regredir estado terminal/mais avançado. Nenhuma migration necessária. A UI já exibe `deliveryState` e já possui catálogos pt-BR/en para os estados.

Limitação tratada: callback sem mensagem local é ignorado, então a corrida rara em que o callback antecede a gravação do ID externo exige futura reconciliação com worker/outbox. Sem migrations aplicadas, deploy ou teste/build nesta sessão.

## Últimas fatias do Inbox

### Fechamento da identidade Meta sem telefone — em andamento (17/11/2026)

- Webhook Meta associa `user_id`/`from_user_id` como alias `meta_bsuid`, incluindo BSUID-only. Telefone continua obrigatório para envio pelo provider; runtime valida o destino atualizado antes da resposta automática.
- Novo fluxo do Inbox permite ao responsável pela conversa vinculá-la a lead existente, adiciona a pessoa em `lead_contacts` e grava nome/telefone internacional confirmado. A UI permite marcar explicitamente contato principal e interessado; principal atualiza também `leads.person_id`, serializado por lock do lead. A operação é tenant-scoped, valida ownership/telefone, registra auditoria sem incluir o valor de telefone e atualiza a empresa vinculada à conversa. A UI mostra erro específico quando o telefone não está em formato internacional válido.
- Nenhuma migration necessária. A UI oferece busca de lead e edição dos dados no painel do contato. Build Nest e Vite passaram em 17/11/2026; o Vite mantém aviso de bundle principal com 925 kB. Os builds também revelaram e corrigiram tipagens/imports em campanhas, canais e calendário já alterados no workspace. Testes automatizados e validação visual não executados; falta validação ponta a ponta.

`GET /api/v1/conversations` agora aceita busca por empresa/contato/telefone e filtros por status, responsável (inclui `unassigned`), canal e etiqueta. Retorna `{data, pagination}`; a tela usa seletor de 10/25/50/100 itens, total e navegação paginada, com strings pt-BR/en. Mude filtros e busca para voltar à primeira página; sequência local impede resposta antiga de sobrescrever busca mais nova. Sem migration.

Leitura não lida é individual: `POST /api/v1/conversations/:id/read` recebe o ID da última inbound carregada, valida conversa/tenant/direção e avança `conversation_reads.last_read_at` ao `created_at` dessa mensagem. `GET /api/v1/conversations` inclui `unread` e aceita `unreadOnly=true`. Migration `0019_outstanding_stryfe.sql` cria a tabela cursor tenant-scoped e índice de mensagens para consulta. A UI marca leitura após carregar mensagens, exibe selo e permite filtrar apenas não lidas. Não aplicar migrations ainda.

Evento do closer: quando uma mensagem inbound é persistida em oportunidade com handoff aceito, cria `closer_events` idempotente e atribuído ao owner. As features integradas implementam: pedido explícito para falar com pessoa vira `human_requested` urgente; pergunta numa oportunidade ativa atribuída a closer vira `closer_question` alta; intenção concreta (reunião/demo, proposta/orçamento, contratação/teste) vira `buying_intent` alta; sinal explícito de falha de interpretação pode criar/elevar `interpretation_failure` urgente via webhook autenticado; os sinais reutilizam uma ocorrência por mensagem. Pedido humano depende de oportunidade ativa com closer dono ou handoff aceito; não há roteamento de lead sem oportunidade/owner. Os demais fluxos (reconhecer, adiar, redistribuir, concluir) estão integrados em `develop`. Migrations `0020` e `0021` não foram aplicadas. SLA configurável, notificações in-app e polling da central estão integrados; canais externos de notificação seguem pendentes.

## Próximo passo recomendado

Próxima fatia recomendada: worker/outbox e reconciliação de callbacks sem ID externo local. Antes de produção, definir retenção/expurgo de mídia e provisionar bucket privado/role IAM.

Depois: worker/outbox/retry e reconciliação de timeout/callback sem correspondência; revisar canais externos de notificação quando houver requisito explícito.

## Limites e forma de retomar

- O próximo passo acima é uma recomendação de continuidade, não prova de que o callback já foi implementado.
- Ao começar a próxima sessão, verificar `git status`, `git log`, ler este documento, `AGENTS.md` e as seções pertinentes de `docs/arquitetura_tecnica.md` e `docs/sofia_produto/06_backlog_aceite_entrega.md`. O estado do repositório prevalece sobre este resumo se houve alterações posteriores.
- Não presumir que migrations foram aplicadas, integrações configuradas em produção ou callbacks recebidos só porque o código/documentação existem.

## Auditoria UX e notificações globais — em andamento

- Auditoria geral registrada em [`auditoria_ux_30sales.md`](auditoria_ux_30sales.md). Achados prioritários: navegação desaparece em viewport estreito, título do shell não acompanha a página, seletor de organização é inerte e a navegação é plana/sem rotas próprias.
- Primeira fatia na branch `feature/global-notifications`: central no cabeçalho usa o endpoint já existente de alertas de SLA, mostra contagem de não lidas, atualiza a cada 30 segundos, permite abrir a conversa e marca o alerta como lido. Mantém escopo org/user do endpoint existente; nenhuma migration necessária.
- Integrada em `develop` no merge `42a3beb` (feature `76a280c`). Nenhum build/teste executado por preferência. Inspeção visual ficou pendente porque não havia navegador disponível.
- Navegação móvel acessível integrada em `develop` no merge `833727b` (feature `5d584d8`): botão localizado, estado expandido, fechamento por Escape/seleção e indicador de página atual. Inspeção visual do menu continua pendente.
- Achados P1 integrados em `develop` no merge `dd185ab` (feature `b4df84a`): cabeçalho contextual por área e seletor de organização com troca de tenant, reset seguro de estado local e erro inline. Build/testes não executados por preferência; inspeção visual continua pendente.
- Navegação agrupada e rotas diretas integradas em `develop` no merge `ca465c6` (feature `994ccfd`): quatro grupos localizados, histórico voltar/avançar, busca contextual Contas → Leads e deep link de conversa na URL. Hash routing evita depender de fallback no servidor estático. Build/testes não executados por preferência; inspeção visual pendente.
- Estados de carregamento, erro, vazio, falha parcial e atualização integrados em `develop` no merge `62a90fa` (feature `0b3565f`): componente `WorkspaceState` compartilhado, tabelas preservam os resultados anteriores durante refresh, e Hoje/carteira do closer distinguem dados indisponíveis de zero. Atualizado pt-BR/en. `git diff --check` executado sem apontamentos; build/testes não executados por preferência; inspeção visual pendente.
- Primeira categoria geral da central integrada em `develop` no merge `a62fb81` (feature `5ec527c`): nova mensagem inbound notifica owner da conversa ou owner de oportunidade ativa, somente com membership válido no tenant; gravação é transacional e idempotente. Endpoint `/api/v1/notifications` lista SLA + Inbox com contagem total não lida e leitura tenant/user-scoped; rotas antigas de SLA continuam compatíveis. Migration `0030_wooden_husk.sql` foi gerada, não aplicada, e precisa ser aplicada antes de subir esta versão do backend. Rollback de aplicação mantém a expansão aditiva do schema; não remover as colunas enquanto houver notificações de Inbox. Sem build/testes por preferência. Revisão visual pendente.
- Avisos de tarefa vencida integrados em `develop` no merge `4572882` (feature `6c1124a`): um alerta após o prazo da tarefa continuar aberto, para pessoa atribuída ou, sem atribuição, quem criou; exige membership ativa, usa chave idempotente por tarefa/destinatário/prazo e é limpo ao concluir. API devolve `taskId`; o deep link mostra a tarefa exata. Migrations `0031_salty_thing.sql` (coluna, check e unique composto) e `0032_lovely_sumo.sql` (FK tenant-scoped dependente da unique anterior) geradas, não aplicadas. Aplicar ambas antes do deploy; rollback de código mantém expansão aditiva. Sem build/testes por preferência; inspeção visual pendente.
- Avisos de handoff integrados em `develop` no merge `4e228d6` (feature `96b8a26`): o solicitante recebe alertas idempotentes quando a passagem é aceita ou devolvida, somente com membership ativa; os eventos são gravados na transação de estado. A central mostra contexto e abre o handoff exato; devoluções exibem motivo, ação e prazo. Migration `0033_remarkable_prima.sql` gerada, não aplicada. Sem build/testes por preferência.
- Atribuição de conversa e oportunidade integrada em `develop` no merge `db17779` (feature `c22ed72`): quando alguém atribui a outra pessoa, o novo responsável recebe alerta com deep link; assumir para si não gera alerta. Migration `0034_ambiguous_may_parker.sql` gerada, não aplicada. Sem build/testes por preferência.
- Marcar todas as notificações como lidas integrado em `develop` no merge `4f2a2be` (feature `f28669d`): endpoint atualiza somente as notificações não lidas do usuário e organização ativos; botão mostra processamento/falha e atualiza a central sem recuperar resposta de polling anterior. Sem migration. Sem build/testes por preferência.
- Controles da lista de Passagens integrados em `develop` no merge `f607420` (feature `6b35523`): busca e ordenação no servidor, total e paginação com seletor; deep link por ID continua restrito à organização. Sem migration. Sem build/testes por preferência.
- Controles da lista de Tarefas integrados em `develop` no merge `d3c78db` (feature `3a1c554`): busca por ação/empresa/contato, ordenação e paginação server-side; contagem reflete o resultado completo e deep link permanece exato. Sem migration. Sem build/testes por preferência.
- Controles do Pipeline integrados em `develop` no merge `a77b15d` (feature `4e40fe8`): endpoint server-side com busca por empresa/contato/negócio/próxima ação, ordenação por prazo/empresa/contato/última mudança, contagem real e seletor de lotes de 10/25/50/100 mantendo o board com “carregar mais”. Os indicadores identificam quando representam apenas oportunidades carregadas. Sem migration.
- O host do navegador/automação ficou indisponível nesta retomada, então a inspeção visual em runtime não ocorreu. Próxima etapa: seguir a auditoria pelas demais listas operacionais, revisar cobertura de busca/ordenação/paginação e retomar inspeção visual quando o app estiver acessível.

## Login independente e recuperação de senha — concluído

- Branch de trabalho `feature/standalone-auth-screen`, commit `2664b2a`, integrada em `develop` no merge `940a254`.
- Carregamento de sessão, login e seleção de organização passam a renderizar sem menu lateral. O Chrome anônimo mostrou o login standalone, com textos do idioma do navegador.
- Login adiciona opção “Lembrar de mim” (ativa inicialmente). Recuperação usa Better Auth com e-mail pelo SMTP existente, rota de nova senha, confirmação, token inválido/expirado e revogação de sessões após redefinição. Mensagem de pedido é neutra quanto à existência da conta.
- Ícones sem rótulo visível recomendados somente em ações frequentes/unívocas e já nomeadas para tecnologias assistivas (menu móvel, notificações, atualizar, baixar anexo identificado). Manter rótulos visíveis em ações primárias e de contexto.
- Pendências UX preservadas para as próximas fatias: título duplicado do shell/conteúdo; configurar canal fictício para exercitar thread completa do Inbox; avaliar divisão do bundle acima do aviso de 500 kB.
- Login sem sessão, estado de solicitação de recuperação e rota sem token vistos no Chrome. Não houve envio de e-mail/reset real. Por preferência persistente, sem build ou testes automatizados nesta fatia; `git diff --check` passou.

## Próxima revisão UX: closer e Pipeline

- Direção desta retomada: evoluir o Pipeline para um CRM útil no dia a dia, com dados relevantes fáceis de acessar, contexto da relação e ações comerciais claras. Priorizar incrementos verticais sem inflar a tela; preservar tenant scope e fontes de dados existentes.
- Primeira lacuna corrigida: quando o contato tinha e-mail e telefone, a lista e o cartão mostravam somente o e-mail. Ambos agora aparecem como ações `mailto:` e `tel:`, com rótulos acessíveis, em português e inglês.
- Segunda fatia: lista e board recebem a interação mais recente por oportunidade em uma consulta adicional tenant-scoped por página e exibem tipo, assunto e data; o board também mostra o resultado quando disponível. Oportunidades sem atividade ficam explícitas. Nenhuma migration.
- Terceira fatia: o detalhe da oportunidade tem ação visível para registrar interação; ela abre o histórico e foca o assunto. Após salvar, o board/lista recarregam a última atividade. Reutiliza endpoint e formulário existentes, sem migration.
- Contexto Inbox → Pipeline: conversas processadas pelo Assistente que geram/atualizam uma oportunidade mantêm um snapshot estruturado por conversa (`opportunity_conversation_contexts`): resumo, fatos confirmados, pontos em aberto e horário de captura. A chave única tenant/conversa torna reprocessamentos idempotentes; FKs compostas impedem vínculos entre organizações. O detalhe do Pipeline apresenta cada conversa separadamente, com rótulos localizados. Não copia a mensagem integral. Migration Drizzle `0057_common_young_avengers.sql` gerada, ainda não aplicada.
- Próximas fatias recomendadas: histórico de mudanças do negócio no detalhe, atalhos para registrar próxima ação/interação e visão gerencial da carteira por responsável com indicadores filtrados por período e drill-down. Verificar quais campos já existem antes de introduzir novos contratos ou migrations.

- Etapas customizadas já foram implementadas e integradas; a tela “Configurar etapas” fica disponível a owner/admin/manager e suas migrations `0035`/`0036` seguem geradas, não aplicadas.
- A carteira agora tem quadro e lista compacta, busca por e-mail/telefone e filtros por etapa/responsável/prazo, ordenação por colunas e paginação direta server-side. Os indicadores ainda representam registros carregados, não o resultado total filtrado.
- Revisão não foi feita logada porque a sessão atual do Chrome expirou e não havia credencial fictícia claramente identificada na lista de preenchimento automático. Evidência veio do código e da inspeção anterior do board com registros de demonstração. Nenhuma credencial foi usada.
- Detalhes e limites em [`auditoria_ux_30sales.md`](auditoria_ux_30sales.md), seção “Perspectiva de closer”. Próximos ganhos: agregados server-side para a busca inteira e paginação por cursor se o volume real justificar.

## Etapas configuráveis do Pipeline — concluído

- Integrada em `develop` no merge `413163d` (feature commit `5e4d3d9`).
- Owner/admin/manager pode criar, renomear, reordenar e arquivar etapas abertas customizadas em Configurações > Etapas do pipeline; o closer vê as etapas no board e pode avançar oportunidades com validação tenant-scoped no backend. Etapas padrão mantêm transições legadas; “Ganha” e “Perdida” permanecem terminais.
- Histórico, handoffs, relatórios e fila do closer reconhecem o nome/chave de etapas customizadas. A chave do tenant é parte das FKs compostas para impedir referências cruzadas.
- Migrations Drizzle `0035_curvy_tattoo.sql` (enum isolado para respeitar a transação do PostgreSQL) e `0036_sparkling_vengeance.sql` (schema e constraints) geradas e **não aplicadas**.
- `git diff --check` passou. Não rodei build/testes nem inspeção autenticada no Chrome nesta fatia por preferência persistente e sessão expirada.

## Carteira compacta do Pipeline — implementação em andamento

- Branch atual: `feature/closer-compact-pipeline`.
- A lista compacta inclui busca por empresa, contato, e-mail, telefone, negócio, próxima ação e responsável; filtros server-side por etapa, responsável e prazo; ordenação nas colunas; salto de página; expansão sob demanda dos controles completos da oportunidade.
- Sem alteração de schema ou migration. Sem build/testes por preferência; revisar diff e executar `git diff --check` antes da integração.

## Padronização de controles e tipografia — concluída

- Branch atual: `feature/ui-control-standardization`.
- Controles de ação e formulário foram migrados para wrappers da UI compartilhada. Só a camada `components/ui/FormControls.tsx` contém elementos HTML de botão/campo diretamente.
- Select, data/data-hora, textos, telefone, moeda, inteiros, checkboxes, upload e áreas de texto têm wrappers e CSS próprios. Inteiros/decimais comunicam `number | null`; erros básicos de required, formato, comprimento, intervalo e datas estão localizados em pt-BR/en.
- A escala de fontes foi aplicada aos CSS existentes e centralizada em `public/brand-kit/branding/tokens.css`. Sem mudança de API ou banco.
- `git diff --check` passou. A busca confirmou que features e `App.tsx` não declaram controles HTML nativos diretamente. Build/testes e inspeção visual não foram executados por preferência persistente.
- Implementação registrada na branch `feature/ui-control-standardization`; conferir o histórico do Git para o commit e a integração em `develop`.

## Carga sintética para inspeção visual — concluída

- Criada na branch `feature/ux-demo-data-seed` e integrada em `develop` no merge `4e2b1be`, a carga usa `30sales-back/scripts/seed-ux-demo.ts`, executável por `npm run db:seed:ux-demo`. O script exige URL local na porta `55432`, nome de banco `30sales`, tenant Acme de demonstração, membro existente e confirmação explícita; usa Drizzle e IDs determinísticos, com marcador idempotente.
- Aplicadas somente no banco descartável local `30sales-ux-db` as migrations já versionadas `0035_curvy_tattoo.sql` e `0036_sparkling_vengeance.sql`. `0035` foi confirmada em transação separada porque o PostgreSQL exige confirmar o novo valor do enum antes de referenciá-lo em constraints da `0036`. Nenhum outro banco/ambiente foi alterado.
- Carga `ui-demo-v1` concluída: 60 contas, 60 pessoas, 60 leads, 60 tarefas, 50 oportunidades, 150 atividades, 50 handoffs, 50 conversas, 233 mensagens, 50 eventos do closer, 60 notificações, 60 eventos de auditoria, 6 etiquetas e 10 etapas padrão do pipeline. As contagens atuais do tenant incluem registros preexistentes: contas/pessoas/leads 66; tarefas 63; oportunidades 56; atividades 152; conversas 50; mensagens 233; eventos do closer 50; notificações 86; auditoria 61. Seed repetido detectou o marcador e não alterou dados.
- O canal de Inbox fictício está inativo e sem credenciais; nenhum envio externo foi possível. Emails usam `example.test`. Não foram criados usuários/memberships artificiais nem históricos de importação.
- `git show --check` passou. Sem build ou suíte de testes, conforme preferência persistente.

## Auditoria de desalinhamento dos controles — em correção

- O relato de desalinhamento após a padronização levou a uma revisão transversal da cascata CSS dos controles. A causa encontrada: seletores base `.ui-field-control.ui-text-field`, `.ui-field-control.ui-select` e `.ui-field-control.ui-textarea` tinham especificidade maior do que regras de tela como `.inbox-list-pagination select` e `.inbox-composer textarea`, impedindo alturas e espaçamentos compactos.
- Na branch `fix/ui-control-layout-cascade`, os seletores base foram reduzidos para `.ui-text-field`, `.ui-select` e `.ui-textarea`. Regras de layout de cada tela agora podem ajustar o componente sem perder os estilos compartilhados de identidade visual.
- Busca estática confirma que features e `App.tsx` não declaram controles nativos fora da camada compartilhada. `git diff --check` passou.
- Inspeção visual em navegador não foi possível nesta retomada: o host de acesso ao Chrome estava indisponível e Playwright não está instalado no workspace. Front e API locais estão rodando; portanto, ainda falta confirmar em runtime os alinhamentos em desktop/mobile e percorrer os fluxos após esta correção.

## Hierarquia de título do workspace — implementação em andamento

- Branch `feature/ui-heading-hierarchy`: removida a duplicação visual entre o cabeçalho do shell e o título da área. O `h1` contextual permanece na árvore acessível, e o título interno da área é a única versão visível.
- Faixa superior reduzida a 72px em desktop para organização/notificações e preservada em altura automática no mobile.
- Uma captura desktop do Chrome confirmou o desalinhamento do menu: ícones e rótulos ficavam centralizados na área clicável. `.nav` agora define `justify-content:flex-start`, preservando a largura clicável e o estado ativo.
- A confirmação visual após a correção ainda está pendente: o host CUA não lista abas e o Chrome bloqueia JavaScript via Apple Events. Não usei credenciais nem alterei dados.

## Modelos e transcrição do agente — implementação em andamento

- Configurações por organização agora selecionam entre Claude Haiku 5.5, Sonnet 5.5 e Opus 5.5. O padrão continua Haiku; o catálogo aparece na tela e a API valida os IDs permitidos.
- Nova opção de transcrição de áudio usa a API de áudio da OpenAI (`gpt-transcribe`) antes de gerar a resposta. A documentação atual recomenda esse modelo para transcrição geral; `whisper-1` fica para compatibilidade legada. A transcrição fica registrada em `messages.transcript_text`, aparece no histórico do Inbox e é reutilizada em retries. Áudio pendente no processamento de mídia adia o evento; anexo ausente/indisponível segue para revisão humana.
- Adicionada a variável `OPENAI_API_KEY` ao schema de ambiente e ao `.env.example`; para habilitar a transcrição em execução é necessário configurá-la no servidor. A chave Anthropic continua necessária para respostas textuais.
- Migration Drizzle `0037_cooing_dazzler.sql` gerada para os novos campos/limite de modelos; permanece **não aplicada**. Nenhum build ou teste executado por preferência persistente; `git diff --check` passou.
- Nova revisão do Inbox: ordem visual e DOM agora seguem dados do lead à esquerda, conversa ao centro e fila à direita; a lista rola em área própria com paginação fixa, linhas não encolhem, e o cabeçalho mantém ações em flex. Em larguras médias a conversa fica acima dos painéis auxiliares; em mobile a ordem linear segue o DOM. Chrome indisponível para confirmação visual nesta retomada; sem build/testes.
- Alinhamento de validação generalizado nos formulários: labels com controles compartilhados de campo/calendário agora permanecem alinhados ao topo de cada linha de grid, impedindo que um erro visível desloque os controles dos campos vizinhos. Aplicado na camada compartilhada `FormControls.css`, não apenas no formulário de tarefas.

## Pipeline visual e arraste de oportunidades — implementação em andamento

- O quadro do Pipeline agora usa cards compactos com altura fixa, mostrando negócio, empresa/contato, etapa, valor potencial e próxima ação. Abrir o card exibe um modal com os controles detalhados já existentes, linha do tempo, atribuição e transição.
- Arrastar um card para outra etapa abre a revisão da mudança no modal. A persistência continua usando o comando atual da API, incluindo validação de transição, próxima ação, valor/data de ganho ou motivo de perda; não confirma movimento antes de salvar. Etapas vazias, inclusive ganha/perdida, continuam como destinos visíveis.
- Estado de carregamento/erro e filtros/lista existentes foram preservados. Textos novos adicionados aos catálogos pt-BR/en.
- Ajuste global para botões legados `.primary`: hover/foco agora mantém preenchimento de ação com contraste, corrigindo o botão verde “Salvar políticas” observado nas capturas.
- Segunda passada para carteiras grandes: cada etapa mantém cabeçalho e rolagem vertical próprios dentro do quadro, evitando que uma coluna longa empurre todas as outras para baixo. Todas as etapas ativas ficam visíveis como destino; contagens ainda correspondem aos resultados carregados pelo quadro.
- Não houve mudança de API/schema. Sem build/testes por preferência persistente; revisar `git diff --check`. Inspeção visual desta implementação ainda pendente.

## Pipelines CRM independentes — em implementação

- A configuração agora prevê vários pipelines por organização, com nome, pipeline padrão, arquivamento bloqueado enquanto houver oportunidades e etapas independentes. Pipelines novos começam com Ganho e Perda fixas; etapas abertas são cadastradas/reordenadas dentro do pipeline. O quadro permite selecionar o pipeline e transferir oportunidades para outro pipeline e uma etapa válida.
- Compatibilidade e preservação: `pipelines` e os novos vínculos são aditivos/nullable. Ao consultar pipeline/etapas/oportunidades, `PipelinesRepository.ensureDefault` cria (se necessário) o pipeline principal e associa, de modo idempotente, estágios/oportunidades legados sem vínculo. Os dados de negócio/histórico permanecem. Organizações com estágios ou oportunidades legados conservam os estágios padrão atuais para manter as transições e os históricos interpretáveis. Uma organização nova e vazia começa com apenas Ganho/Perda como estágios de sistema; pipelines novos também começam só com essas duas etapas.
- Migrations `0038_lethal_alex_power.sql` (modelo/vínculos), `0039_red_mentor.sql` (índice tenant-first do quadro) e `0040_chunky_skin.sql` (integridade tenant-scoped dos vínculos de pipeline no histórico) geradas, não aplicadas. Não aplicar até solicitação explícita; registros existentes ainda não receberam o vínculo até a migration e o primeiro acesso ao backend atualizado.
- Telas integradas ao client centralizado e catálogos pt-BR/en. Sem build/testes e sem aplicação de migration, conforme preferência registrada. Fazer inspeção visual no Chrome e validação técnica em etapa posterior solicitada.
- Configuração extensa dividida em abas acessíveis **Pipelines** e **Etapas**, mantendo o seletor do pipeline visível em ambas; ao criar um pipeline, a interface segue para a aba de etapas. Inspeção visual ainda pendente: automação do Chrome nesta retomada retornou ao iTerm/aba do 30studio; nenhuma credencial ou dado foi alterado.

## Acesso local de demonstração UX

- Conta criada no tenant local `Acme Brasil (dados de demonstração)`, vinculada à carga preexistente `ui-demo-v1`; role `owner`, e-mail verificado para login local. Nenhum registro de negócio foi recriado, removido ou reatribuído.
- URL: `http://localhost:5174` (Better Auth trusted origin; `127.0.0.1` returns `Invalid origin`)
- E-mail: `ux.demo@30sales.test`
- Senha local guardada em `.local/demo-credentials.md` (arquivo ignorado pelo Git; não publicar).
- Seed idempotente: `npm run db:seed:ux-demo-user`. Aceita somente o banco `30sales` em loopback na porta `55432`, exige `DEMO_ACCOUNT_CONFIRM=CREATE_LOCAL_UX_DEMO_ACCOUNT` e falha em produção. Usa `hashPassword` do Better Auth e registra a criação em auditoria.

## Retomada de inspeção funcional no Chrome — 16/11/2026

- Login da conta UX Demo em `localhost:5174` concluído; percorri Hoje, Tarefas, Inbox, Leads, Contas, Central do closer, Passagens para closer, Pipeline CRM, Canais WhatsApp, Assistente, SLA, Relatórios, Auditoria, Importações e Equipe.
- Leads/Contas, Tarefas, Passagens, Auditoria, Canais WhatsApp, Importações e Equipe carregaram os dados de demonstração. O canal é fictício, desativado e sem credenciais; não enviei mensagens nem convites.
- Hoje, Inbox, Central do closer, Pipeline, Assistente e Relatórios exibiram erros de carregamento parciais ou totais. Log da API confirmou schema local incompleto: relação `pipelines` inexistente e coluna `messages.transcript_text` ausente.
- Auditoria registra agora a criação da conta e exibe 83 eventos/4 páginas. Equipe lista 3 membros no tenant demo.
- `git diff --check` passou. O trabalho local preexistente permanece; nenhuma alteração em dados comerciais foi feita durante a navegação.

## Correção do schema local de demonstração — 16/11/2026

- Aplicadas as migrations pendentes `0037`–`0040` no banco local verificado `30sales` do container `30sales-ux-db`. `drizzle-kit migrate` concluiu sem erro. Não houve acesso a ambiente remoto/produção.
- Confirmei `public.pipelines` e `messages.transcript_text`. Contagens antes/depois preservadas: 66 leads, 56 oportunidades, 10 etapas, 112 registros de histórico e 233 mensagens. A tabela de migrações registra as quatro novas entradas.
- A inspeção visual pós-migração ficou pendente porque o host de controle do Chrome estava indisponível nesta retomada. Reabrir/atualizar Pipeline, Inbox, Assistente, Central do closer, Hoje e Relatórios no navegador local.

## Leads empresa com contatos múltiplos — em implementação

- Lead pode ser cadastrado inicialmente só com a empresa; contato, e-mail e telefone são opcionais. Informando e-mail ou telefone no cadastro inicial, o nome do contato passa a ser exigido.
- `lead_contacts` registra várias pessoas por lead com cargo/área, nota de indicação, observações e flags de contato principal e interessado no produto. “Em conversa” é calculado a partir de conversas ativas (`open`, `pending`, `snoozed`), não editado manualmente.
- A tela de leads permite abrir/gerenciar os contatos, adicionar uma secretária sem canal direto, registrar quem indicou o financeiro/responsável, marcar interesse e definir o contato principal. Contas contam os contatos associados.
- Webhooks de WhatsApp, Inbox e qualificação do assistente passam a localizar o lead por contatos associados, preservando compatibilidade temporária com `leads.person_id` legado.
- Migrations `0041_lead_contacts.sql` e `0042_leads_company_first.sql` geradas e não aplicadas. Sem build/testes por preferência persistente; `git diff --check` passou. Próxima etapa: aplicar migrations somente quando solicitado e validar no Chrome/API.

## Perfis de plataforma e operação comercial — decisão de produto registrada

- Atualizado `docs/sofia_produto/01_visao_e_navegacao.md` para separar autorização global da plataforma e membership por tenant: superadmin cadastra empresas e define o primeiro responsável (`owner`); usuários da empresa, incluindo vários `closer`, entram por convites/memberships.
- `owner` tem visão da empresa/equipe; `closer` começa pela carteira atribuída (oportunidades, conversas, tarefas, handoffs e próximos passos) e não vê a carteira dos colegas por padrão. Escopo individual precisa ser aplicado também nas queries e commands do backend, não só no menu.
- Uma identidade pode participar de várias empresas com papel diferente em cada tenant. Superadmin não é role de organização e não deve ser convite de cliente; o acesso a dados de tenant pelo suporte deve ser explícito e auditado.
- Implementação inicial do console global: o papel de plataforma fica na identidade global e é validado novamente no backend; a sessão o expõe ao frontend, que apresenta o console isolado de administração ao superadmin.
- O console lista empresas com busca/paginação e cadastra empresa mais convite para seu owner inicial. O convite é enviado pelo mailer existente; se SMTP falhar, o link seguro fica disponível para cópia. O endpoint não consulta dados comerciais de tenants.
- Promotion script exige conta existente com e-mail verificado e confirmação explícita no ambiente. Papéis, status, códigos, caminhos e valores técnicos da fatia estão centralizados em constantes; UI usa catálogos pt-BR/en.
- Migration `0043_platform_role.sql` gerada, ainda não aplicada. Script de promoção não executado; sem build/testes por preferência persistente. `git diff --check` passou.
- Próxima fatia em andamento: navegação contextual por papel e carteira individual do closer nos fluxos restantes (Inbox, tarefas, leads e handoffs); validar permissões dos relatórios com dados agregados.

## Navegação por papel e carteira de oportunidades — em implementação

- Menu, rotas e página inicial variam por membership ativa: owner/admin/manager veem o espaço de gestão; closer inicia na central pessoal; BDR, SDR, operações e analista recebem entradas adequadas ao seu trabalho. Trocar empresa recarrega o papel ativo antes do redirecionamento.
- Backend restringe oportunidades individuais a owner/admin/manager e closer. A API força `view=mine` para closer mesmo com filtro cliente adulterado; histórico e atividades usam o mesmo escopo por owner. Relatório agregado fica reservado a owner/admin/manager/analista.
- Consultas de Inbox filtram conversas por owner para papéis sem visão de gestão; mensagens e cursor de leitura também validam o owner. Listagem/paginação de tarefas, criação vinculada a lead e conclusão usam o usuário autenticado para papéis sem visão de gestão.
- Leads têm escopo server-side: gestão vê o tenant; BDR/SDR veem leads atribuídos; closer também vê leads ligados às próprias oportunidades. O escopo cobre busca de duplicados, detalhes por ID, mudança de status, contatos e tarefas vinculadas. Verificação global de duplicidade continua bloqueando registros repetidos sem expor dados de carteiras alheias.
- Atribuição/lista de responsáveis de lead fica restrita a owner/admin/manager. Closers veem na fila de handoffs solicitações compartilhadas e itens aceitos/devolvidos por eles; outros papéis veem solicitações que criaram; gestores veem todos. Um closer só pode devolver handoff aceito por ele.
- Contas e seus totais agora respeitam a mesma carteira: BDR/SDR veem empresas com leads atribuídos; closer também pode ver empresas ligadas às próprias oportunidades; só gestores veem totais da organização. A fila da central do closer é individual para closers e compartilhada para gestores.
- Leitura de memberships com múltiplos papéis foi centralizada em constantes/helpers no backend e frontend. A navegação combina as páginas permitidas e escolhe a página inicial pelo primeiro papel conhecido; verificações de papel deixaram de comparar valores soltos.
- Valores de papéis e grupos de autorização usam constantes. A navegação é conveniência de UX; cada endpoint sensível mantém sua própria autorização no backend.
- Sem mudança de schema/migration. `git diff --check` passou. Não rodar build/testes sem pedido explícito.
- Eventos realtime do Inbox consultam o owner atual antes de distribuir a atualização: gestores e o usuário dono recebem o ID da conversa; os demais recebem apenas um sinal sem identificador para atualizar a lista. Revisar endpoints menos usados e validar os papéis com contas de cada perfil quando for solicitada a passada funcional.

## Fluxo operacional do closer — em implementação

- Indicadores do topo da Central do closer agora são filtros acionáveis por clique, com estado ativo acessível por `aria-pressed` e foco visível. Passagens, eventos, ações vencidas, primeiro contato pendente e oportunidades sem próxima ação abrem o recorte correspondente; a paginação volta ao início ao mudar o recorte.
- Corrigida a leitura de alertas de SLA na central: usa o endpoint próprio de alertas do closer, mantendo o tenant/user scope, em vez do endpoint de notificações gerais.
- A fila agora agrega tarefas abertas usando a paginação da API. Tarefas vencidas compartilham o sinalizador de atraso; as demais têm filtro e indicador próprios. A ação abre a tarefa pelo `taskId` na tela de tarefas existente, e o endpoint mantém o escopo de usuário/organização.
- Conversas com mensagens não lidas e status ativo também aparecem na central, respeitando o escopo aplicado pelo endpoint do Inbox. O filtro dedicado abre o Inbox na conversa; conversas resolvidas ficam fora desse sinalizador.
- Sem mudança de backend/schema. `git diff --check` passou; build/testes não executados por preferência persistente. Próximo passo recomendado: inspeção visual/funcional da Central no Chrome, em especial a disposição dos sete indicadores e o fluxo de abrir uma tarefa ou conversa não lida.
- Retomada da inspeção em 16/11/2026: Chrome acessível em `localhost:5174`; formulário de login está centralizado e sem desalinhamento horizontal visível. Login da conta demo falhou porque o backend 30Sales não estava disponível na origem de API configurada. A porta 3000 não respondeu com a API Nest e o proxy Vite está configurado para essa porta. Não alterei senha, sessão nem dados. Inspeção autenticada da Central e dos atalhos segue pendente até iniciar a API local apontada para o banco `30sales-ux-db`.

## Segmentação inicial de leads — em implementação

- Categorias de segmento são configuráveis por tenant em `account_segments`; cada empresa pode ter uma categoria ativa. `accounts.segment_id` nullable mantém os registros existentes sem alteração semântica; nenhuma classificação é inferida.
- Owner/admin/manager podem criar categorias e atribuí-las na tela Contas. Ações são revalidadas no backend, tenant-scoped e auditadas. Leads exibe a categoria e filtra por segmento ou “Sem segmento”; filtragem, ordenação e paginação ocorrem no servidor.
- Migration Drizzle `0044_low_naoko.sql` foi gerada, ainda não aplicada. Nenhum dado foi alterado no banco. A revisão estática foi concluída e `git diff --check` passou; sem build/testes por preferência persistente.
- Escopo intencional desta primeira etapa: classificação simples de empresa. Critérios dinâmicos combinados e dimensões como UF, porte, CNAE, fonte/proveniência e confirmação ficam para fatias seguintes, após amostra atual do Twenty.
- Revisão final: UUID do caminho de atribuição agora é validado por Zod; erros de criação ficam visíveis dentro do modal. Consultas de contas e leads filtram, ordenam e paginam no servidor; a associação entre segmento e empresa tem FK composta por tenant, e mudanças são auditadas.

## Inspeção do CRM Twenty — 16/11/2026

- Correção de escopo do usuário: a análise deve incluir Companies/People e também Tasks, Notes, Files, Emails e Timeline, pois todos participam do processo comercial.
- Inspecionei em modo somente leitura a aba já aberta no Chrome. Companies tem vários campos personalizados além de nome/telefone: domínio, faturamento anual, endereço, indústria, Client Type, MRR / Contract Value, School Segment, Student Count, Account Status, Status Abordagem, Chip, CNPJ, Origem do lead, IDs Sofia, marcos de abordagem/resposta/aceite/recusa e referência de conversa. People tem email, telefone, empresa, cargo e LinkedIn.
- Tasks relaciona título/tipo/status/prazo/responsável/corpo/criador/data a registros Company; Notes têm relação e corpo livre, podendo conter snapshots de handoff, indicações, lacunas de qualificação e excertos de conversa; Timeline mostra criação, mudanças de campos e vínculos com tasks/notes.
- Files e Emails existem como abas relacionadas. As fichas observadas estavam vazias nessas abas; os campos exatos das integrações ainda precisam de exemplo não vazio/export read-only. Não persistir texto de notas/email como critério de segmento; priorizar atributos tipados/proveniência e sinais calculados de atividade. Binaries devem seguir política privada S3.
- Documentado em `docs/sofia_produto/09_mapeamento_fontes_importacao.md` e `03_modelo_de_dados.md`. Inspeção posterior em Data model → Companies confirmou os principais tipos e listas: School Segment 28 opções, Status Abordagem 7 e Origem do lead 7. Account Status, Client Type, Industry, School Segment, Status Abordagem e Origem do lead são Select; Student Count é Number; Annual Revenue e MRR / Contract Value são Currency; CNPJ/Chip são Text; datas são Date and Time; Conversa Sofia é Links. A lista API value → label está documentada no mapa.
- Não fixar opções editáveis do Twenty em enums globais. Preservar API value, label, provedor, tenant e mapeamento canônico revisável; enums/constantes ficam para conceitos estáveis próprios do domínio. Valores desconhecidos não podem ser descartados no preview/importação.
- Lacunas confirmadas no modelo atual: tasks ligadas a lead; activities obrigatoriamente ligadas a opportunity; anexos de mídia ligados a mensagens. Não há ainda Notes e Files de CRM vinculados a conta/contato, nem modelo/integrador de Emails. Próximas fatias devem criar relações por entidade e uma timeline agregada de registros/auditoria, sem duplicar a fonte e sem usar conteúdo livre como filtro de segmento.

## Perfil útil para segmentar empresas — em implementação

- Sem copiar a configuração extensa do Twenty: `accounts` ganhou `market_segment` canônico amplo (`education`, `sports`, `fitness`, `other`) e `student_count` inteiro não negativo, ambos opcionais para preservar empresas atuais sem inferência.
- Contas permite editar os dois campos num modal; API valida e persiste com auditoria, tenant e carteira do usuário. Contas e Leads filtram no backend por perfil e faixa mínima/máxima de alunos; a fila de Leads mostra esses atributos junto à empresa, além da categoria comercial customizável existente.
- Migration `0045_pretty_violations.sql` gerada e não aplicada. Sem build/testes; `git diff --check` executado nos arquivos desta fatia. A atribuição manual fica registrada em auditoria, mas proveniência/nível de confirmação por campo ainda não está modelado para futura importação/enriquecimento.

## Dashboard gerencial e métricas — escopo registrado

- Definido dashboard de gestão com gráficos úteis para vendedores/closers, BDR/SDR IA, pipeline e saúde operacional. Métricas devem ter fonte, fórmula, população/denominador, período/coorte, moeda/fuso e atualização explícitos, além de drill-down e alternativa tabular acessível.
- Atualizados `docs/sofia_produto/02_telas_campos_acoes.md`, `03_modelo_de_dados.md` e `06_backlog_aceite_entrega.md` com o catálogo inicial, critérios e lacunas. Relatórios agora incluem série comercial diária (leads/oportunidades criados e fechados por data UTC do evento) e uso de IA (respostas, transcrições, falhas, latência e custo estimado), ambas com filtro de período, tenant e tabela acessível.
- Não calcular desempenho retroativo por vendedor sem histórico de ownership; não atribuir resultado à IA só pelo modo atual da conversa.
- Série comercial por evento, uso diário de IA e coorte diária de leads estão implementados localmente. Coorte: população de leads criados por dia UTC; numeradores de resposta (`responded` ou `converted_to_sdr`), conversão para SDR (`converted_to_sdr`) e oportunidade criada até o fim do período selecionado; taxas usam a população diária; idade da coorte aparece para sinalizar acompanhamento desigual. Usa `lead_status_history` e relação tenant-scoped com `opportunities`, sem migration. Próxima fatia: ampliar indicadores de pipeline/aging e SLA sem atribuição retroativa a vendedor na ausência de histórico de owner/equipe. Sem build/testes por preferência persistente; migrations somente geradas, não aplicadas, salvo pedido explícito.

## Telemetria inicial do SDR IA — implementação local

- `assistant_runs` registra tentativas de geração Anthropic e transcrição OpenAI separadamente, com tenant, conversa, mensagem inbound, evento/tentativa da fila, operação, modelo, status, latência e falha tipada/redigida. Geração mede tokens, intenção, stop reason e entrega. Nenhum prompt, resposta ou transcrição é copiado para o registro de telemetria.
- Transcrição salva duração faturável retornada pela API, tamanho do arquivo e latência. A geração salva tokens de entrada/saída. Ambas guardam estimativa de custo em USD e versão de preço usada como snapshot por execução; custo ausente permanece `null`, sem estimativa por duração presumida. Valores não representam fatura confirmada do provider.
- Preços versionados em `assistant-runtime.constants.ts` (revisão `2026-11-16`), conforme referências oficiais consultadas nesta data: OpenAI `gpt-transcribe` US$ 0,0045/min; Anthropic Claude Haiku 5.5 US$ 0,10/0,50 por milhão de tokens até 100k tokens de entrada e US$ 0,50/2,50 acima; Sonnet 5.5 US$ 2/10 e Opus 5.5 US$ 4/20 por milhão de tokens de entrada/saída. Cache, batch, Fast Mode, impostos e condições regionais não estão incluídos.
- Migration `0047_far_tyger_tiger.sql` gerada; não aplicada. `0046_slimy_jackal.sql` também segue gerada e não aplicada. Revisão manual concluída e `git diff --check` passou. Sem testes/build por preferência.
- A cobertura de eventos por campanha, histórico de owner/equipe e confirmação de custo faturado seguem pendentes. Registros `started` sem conclusão identificam interrupções, não sucesso.

## Operação comercial unificada e envio de mídia no Inbox — 16/11/2026

- Definição de produto ajustada: LDR é a entrada/importação de empresas e contatos, não um perfil de usuário; o SDR é o agente IA que aborda leads importados e elegíveis, qualifica e registra conversa; BDR/closer são os operadores humanos que tratam exceções, assumem conversas, conduzem reuniões e avançam oportunidades. Inbox é a superfície central de comunicação; Pipeline mantém a venda e próxima ação visíveis.
- Reuniões e convites precisam nascer do contexto da conversa/oportunidade e registrar participantes, fuso, link/local, aceite, remarcação, cancelamento e resultado. Ainda pendente de implementação/integrador de calendário.
- Inbox agora aceita resposta humana com um arquivo por mensagem (imagem, vídeo, PDF ou áudio) até 16 MiB. Backend valida MIME + assinatura, registra checksum/metadados na `message_attachments`, guarda conteúdo no S3 privado e envia por Evolution ou WhatsApp Cloud API; falha/resultado incerto preserva o estado da mensagem. Áudio não aceita legenda; Evolution usa `sendWhatsAppAudio`; OGG/Opus na Cloud API marca `voice: true`. O schema existente atende; sem migration.
- Seleção de arquivos/áudio e prévia do arquivo foram adicionadas ao composer; upload usa o API client central e multipart. Uma nota interna continua sem anexos. A primeira versão faz envio síncrono e não grava áudio pelo microfone; múltiplos anexos, preview/escuta no player e outbox assíncrona ficam pendentes.
- Limite 16 MiB é uma política inicial comum aos dois provedores, não o máximo anunciado por eles. Validar os formatos/encoders com contas de teste de cada provedor antes de habilitar em produção.
- Documentação primária consultada: Evolution `sendWhatsAppAudio` recebe URL ou base64 e retorna chave externa; a documentação Meta identifica PTT/voice na Cloud API via `audio.voice=true`. O fluxo síncrono e estados ambíguos foram mantidos sem retry automático.
- Sem build/testes por preferência persistente. Próximo passo: revisão visual/funcional autenticada do composer e teste controlado de envio em canais sandbox dos dois provedores; depois, fluxo de convites de reunião integrado ao Inbox/Pipeline.

## Importação inicial de leads LDR — 16/11/2026

- A tela Importações passa de prévia somente leitura a fluxo de CSV normalizado de até 100 leads: comparar IDs externos, email e telefone; confirmar somente leads “sem correspondência”. O usuário mantém revisão manual de possíveis duplicatas/conflitos.
- Endpoint autenticado com `integrations.manage` revalida no momento da escrita. Transação agrupa contatos de mesma empresa no mesmo lead, cria lead com `source=import`, status `new`, marca o contato principal, registra `lead_status_history`, alias por registro em `external_records`, hash do payload e auditoria. Contas/contatos existentes são reutilizados se a correspondência for inequívoca; empresas com mais de um lead e múltiplos matches não são mesclados.
- Repetir o mesmo ID externo devolve `already_linked`; colisões de contato detectadas na mesma importação ou dados ambíguos retornam para revisão. A escrita usa schema existente, sem migration; CSV é lido no navegador e nenhum arquivo completo fica armazenado.
- O status livre da fonte não é convertido para o status interno sem mapeamento; ainda não há histórico de lotes nem enfileiramento automático do SDR. Elegibilidade, opt-out e canal seguem obrigatórios antes de qualquer abordagem automatizada.
- Revisão estática e `git diff --check` concluídos. Sem build/testes por preferência persistente. Próximo passo: revisão autenticada da tela e integrar esta importação ao processo de elegibilidade/fila SDR sem iniciar envios externos.

## Preparação de importações para SDR — descoberta técnica 16/11/2026

- Confirmei que `AssistantRuntimeWorker` consome somente `agent.inbound_message_received`; ele responde a conversas já iniciadas e não executa primeira abordagem de leads. O enum `queued` de lead, por si só, não publica trabalho de saída.
- À época desta descoberta não havia revisão estruturada por contato. A fatia seguinte agora registra decisão, fundamento e evidência por contato; ainda não há política por fonte, seleção de canal, quota/janela ou reconciliação de campanha inicial.
- Portanto, importação continua criando leads em `new`. Não alterar para `contacting`, criar conversas ou mostrar “enviado” como efeito de importar/revisar.
- Backlog detalha a preparação revisável: motivos de bloqueio por lead, validação server-side e comando separado de outbox para primeira abordagem. Antes de qualquer envio real, definir política por fonte e registrar evidência de permissão/opt-out. Não reutilizar o worker inbound como executor outbound.
- A revisão de prontidão agora está implementada na tela Leads, por ação na linha e endpoint `GET /api/v1/leads/:id/sdr-readiness`. Backend revalida tenant/carteira e verifica contato principal, formato do telefone, canal ativo configurado, agente habilitado com instruções, status do lead e conversa ativa. Como a permissão por fonte ainda não está modelada, todos os resultados incluem esse bloqueio explícito; a leitura não grava estado nem dispara efeito externo. Sem migration. Não rodar build/testes por preferência persistente.

## Revisão de abordagem por contato — 16/11/2026

- Ficha de contatos permite registrar decisão independente por pessoa (`pending`, `approved`, `blocked`), fundamento definido pela empresa, evidência/referência, revisor e horário. Decisões finais exigem fundamento e evidência; resetar para pendente limpa os campos da revisão.
- Mutação é tenant/carteira-scoped, usa enum/constants, Zod e audit event. A revisão de prontidão consulta a decisão do contato principal: pendente ou bloqueado mantém o respectivo motivo; aprovado remove apenas esse bloqueio, sem ignorar status DNC, conversa ativa ou os outros requisitos.
- Correção nesta retomada: a checagem de conversa ativa agora consulta a pessoa do contato principal associado ao lead, inclusive quando difere do contato legado em `leads.person_id`.
- Migration Drizzle `0048_giant_lady_deathstrike.sql` adiciona enums e campos com default pendente, preservando os contatos atuais. Gerada, **não aplicada**; rollback exigiria remover campos/revisões novas, então preservar export/backup antes de qualquer rollback depois de uso. Política por fonte, quotas e execução outbound seguem pendentes; aprovação registrada não envia mensagens.
- `npm run db:generate` executado para gerar a migration; `git diff --check` passou. Build/testes não executados.

## Substituição nativa dos fluxos de abordagem — referência dos exports n8n

- A pasta `workspace/ferramentas/n8n` está disponível no workspace, fora deste repositório. A leitura foi estática dos exports e documentação local; não consultei a instância n8n nem serviços externos.
- Os exports servem somente como referência de comportamento. O 30Sales deve operar com seus próprios leads/contatos, conversas, mensagens, tarefas, notificações, outbox, agente e canais Evolution/WhatsApp Cloud API. Chatwoot, Twenty e n8n não serão dependências de runtime.
- Comportamentos a preservar na implementação nativa: triagem e primeira abordagem de leads importados; checagem de telefone/canal; janela de dias/horários e feriados; quota e intervalo por canal; reserva atômica antes do envio; revalidação imediata de opt-out, ownership humano, pausas e saúde do canal; mudança de status somente após confirmação do provider; retries idempotentes e tratamento visível de resultado ambíguo.
- O fluxo conversacional legado também contém debounce para texto/áudio, transcrição, trava de concorrência por conversa, respeito a atendimento humano, retomadas limitadas, handoff, registro de decisões e tratamento de indicações. No 30Sales parte disso já existe no Inbox, runtime inbound, ownership, eventos/handoffs e contatos múltiplos; a primeira abordagem outbound e a cadência nativa ainda não existem.
- Não copiar nomes, IDs, status, schema, endpoints ou cadências específicas dos sistemas legados como contrato do produto. Mapear cada comportamento para o domínio 30Sales e manter o histórico de origem apenas quando necessário à reconciliação.
- A próxima abordagem outbound será implementada em fatias: rascunho operacional; seleção de público e prévia; gates de horário/feriado, quota, saúde, opt-out, ownership e conversa ativa; revisão/aprovação; só então fila/outbox e envio idempotente.
- Implementada a primeira prévia nativa: `GET /api/v1/leads/sdr-preview` lista leads em status `ready`, paginados (até 100), no tenant/carteira atual. Calcula contato principal, telefone, canal selecionado (ativo e com credenciais), agente, conversa ativa e revisão do contato; apresenta leads sem bloqueios identificados e bloqueios da página. `GET /api/v1/leads/sdr-preview/channels` oferece ao usuário de vendas somente metadados seguros dos canais da empresa. A tela permite selecionar o canal; a API revalida o ID e as credenciais no tenant em cada consulta.
- A prévia não cria campanha, conversa ou mensagem. Ela não consulta saúde corrente do provider, janela/feriados, quota nem reserva.
- **Entregue nesta fatia:** fluxo inicial para listar/criar rascunhos de campanha, sem publicação, edição ou envio. Cada rascunho armazena canal, nome, janela diária (HH:mm), timezone IANA, limite diário (1–500) e intervalo mínimo (5–300s). Canal ativo/configurado e tenant são revalidados no backend; a relação canal/rascunho tem FK composta tenant-scoped. Criação gera auditoria. A interface está em Leads > Campanhas, com formulário localizado e lista paginada.
- **Entregue nesta fatia:** cada rascunho permite selecionar até 500 leads, com paginação. A prévia lista a carteira visível, separa aptos/excluídos e explica os bloqueios usando a validação SDR existente. A gravação revalida em transação status `ready`, contato principal, telefone, decisão de abordagem, conversa ativa, canal/credenciais e agente; registra a substituição do público na auditoria. Seleções fora da carteira do usuário são preservadas sem retornar dados pessoais/IDs desses leads. Nenhum contato, conversa, tarefa ou mensagem é criado.
- Migrations Drizzle `0049_curved_saracen.sql` e `0050_mean_mach_iv.sql` geradas, não aplicadas. Ambas são aditivas; remover a tabela da migration 0050 depois de utilizada apagaria as seleções de público salvas.
- **Checagem de prontidão operacional entregue no código:** `GET /api/v1/campaign-drafts/:id/operational-readiness` exige permissão de leitura de integrações no tenant, consulta a saúde corrente via adapter/provider existente e registra o health check em auditoria. Compara a hora local atual com a janela e fuso do rascunho. A UI de Leads > Campanhas apresenta resultado com hora verificada e público selecionado. Não há calendário de feriados nem reserva/consumo de quota; o contrato os marca pendentes e sempre retorna `canQueue=false`. Não cria fila, conversa, tarefa nem mensagem. Sem migration nova.
- `git diff --check` passou; build/testes não rodados por preferência persistente. Próxima fatia: modelar calendário de feriados e quota com reserva atômica antes de qualquer aprovação/publicação, sem executar envios nesta etapa.

## Imagens de contêiner e GitOps para GitHub Actions e Argo CD

- Criados Dockerfiles independentes: `30sales-back/Dockerfile` (NestJS/Node, porta 3000, health check `/health`, usuário `node`) e `30sales-front/Dockerfile` (build Vite + NGINX unprivileged, porta 8080, SPA fallback). Cada projeto possui `.dockerignore` próprio.
- Workflows independentes `.github/workflows/build-back.yml` e `.github/workflows/build-front.yml`: cada um constrói somente seu projeto; PR não publica; push publica a respectiva imagem no GHCR com tag da branch/release e SHA imutável, multiarch `linux/amd64` e `linux/arm64`. Eles não alteram GitOps: o Argo Image Updater acompanha a tag `main` nas Applications independentes.
- O GitOps autoritativo está no repositório irmão `../gitops`, no padrão existente `dublin/<app>/app.yaml` + `helm-values.yaml`, agregado por `dublin/kustomization.yaml`. Front e back compartilham `https://30sales.3035service.com`; `/` aponta para frontend e `/api` (incluindo `/api/auth`) para backend.
- O backend espera o Secret `30sales-back-runtime` com credenciais do banco e configuração de produção, inclusive bucket S3; migrations Drizzle continuam fora da inicialização do container. A aplicação raiz existente no cluster descobre os dois apps ao reconciliar o agregador.
- O primeiro build do backend revelou erros TypeScript que já estavam no código integrado. A fatia `fix/backend-container-build` corrige imports de constantes/DTOs, tipagem booleana das consultas de campanha, provider de anexos validado pelo schema e criação da oportunidade com o contato da conversa. `npm run build` em `30sales-back` passou após as correções; nenhum teste de aplicação foi executado.
- O primeiro build do frontend revelou tipos incompatíveis, spreads duplicados e traduções de campanha duplicadas/mal posicionadas. A correção torna a lista de fontes mutável, mescla alterações de revisão de contato sem propriedades duplicadas, fornece rótulo fallback para etapa e move traduções en-US para o catálogo correto. `npm run build` em `30sales-front` passou; Vite ainda avisa que o bundle principal tem 890.56 kB e segue como item de otimização.
- Referências e procedimento em [`container-images.md`](container-images.md). O build Docker/multiarch e os testes automatizados não foram executados localmente; a compilação TypeScript do backend foi executada e passou após a correção.


## Canais Evolution por número e quota diária — 16/11/2026

- A tela Canais WhatsApp mantém canais vinculados ao tenant e oferece descoberta de instâncias pela integração Evolution já configurada (endpoint /instance/fetchInstances). O backend descriptografa credenciais somente no servidor, valida destino externo, aplica timeout e limite de resposta e projeta apenas nome, telefone e estado; campos adicionais retornados pelo provider (incluindo segredos) são descartados. Instâncias ainda não cadastradas podem pré-preencher o formulário de canal.
- Cada canal/número possui dailyMessageLimit (padrão 500, intervalo 1–5000) e dailyLimitTimeZone (padrão America/Sao_Paulo). A tabela mostra uso do dia e permite alterar o limite; habilitar/desabilitar continua por número. Alterações geram auditoria tenant-scoped.
- Envio humano (texto/anexo) e resposta automática consultam a mesma quota e bloqueiam novos envios no limite. A linha do canal é bloqueada durante a verificação/reserva para serializar os envios concorrentes; falhas definitivas não contam, enquanto estados solicitados/ambíguos contam de forma conservadora. Inbox apresenta erro localizado ao operador.
- Migration aditiva Drizzle 0051_chilly_wallow.sql foi gerada, não aplicada. A integração foi implementada no código, mas build/testes não foram executados por preferência persistente. git diff --check deve ser repetido antes da entrega.
- Limitação atual: cadastrar canal recém-descoberto ainda cria somente o registro interno pré-preenchido; o operador configura credenciais/webhook conforme o fluxo de conexão atual. Descoberta não habilita envio automaticamente.
- Continuação desta fatia: a checagem de prontidão de campanhas agora mostra o limite diário do canal, uso de hoje, mensagens restantes e o teto da própria campanha. Quota e janela usam o fuso horário configurado no número para o contador; o rascunho informa seu fuso para a janela. Isso é apenas leitura: reserva continua pendente e a fila permanece fechada até haver outbox/reserva atômica. Sem migration adicional.
- Calendário de feriados: preset federal brasileiro previsto de 20/11/2026 até 2030, importável por tenant de forma idempotente na tela de Campanhas. Inclui feriados nacionais fixos e Paixão de Cristo conforme calendário MGI; os calendários federais oficiais são publicados ano a ano, então datas futuras precisam de revisão anual. Cada empresa também pode adicionar/remover datas próprias (até 500), com validação, isolamento tenant-scoped e auditoria. A checagem de prontidão indica quando hoje é uma data cadastrada no fuso do rascunho; a fila segue bloqueada.
- Migration Drizzle 0052_public_enchantress.sql cria tabela tenant-owned, gerada e não aplicada. Build/testes não executados por preferência persistente; git diff --check passou.

## Aging do Pipeline no dashboard — implementação local (17/11/2026)

- O relatório gerencial agora agrega oportunidades abertas por etapa e idade desde a última mudança: até 7, 8–14, 15–30 e acima de 30 dias. O tempo é calculado em dias decorridos no banco, sem converter em dias úteis; ganhos e perdas não entram.
- A consulta filtra pelo tenant, agrupa por etapa/chave/nome da etapa e reutiliza o snapshot atual, sem nova consulta de eventos ou migration. A tela oferece tabela responsiva com contagem por faixa e destaca itens acima de 30 dias; pt-BR/en e estado vazio estão localizados.
- `git diff --check` passou. Build/testes não executados por preferência persistente. Próxima evolução: valor de pipeline por moeda e indicadores de handoff, mantendo a regra de não atribuir resultados retroativos sem histórico de ownership.

## Valor do Pipeline no dashboard — implementação local (17/11/2026)

- Relatório gerencial agrega valor de oportunidades abertas por etapa e moeda, preservando o valor decimal e sem conversão cambial. A tabela mostra etapa, moeda, soma e quantidade de oportunidades que compõem a soma. O total não mistura moedas.
- O backend conta à parte oportunidades abertas com valor ou moeda ausentes; a UI deixa claro que esses registros não participam do agregado. Dados são tenant-scoped, nomes customizados da etapa vêm da relação do pipeline, sem migration.
- `git diff --check` pendente; build/testes não executados por preferência persistente. Próxima evolução: indicadores de handoff e drill-down dos agregados; métricas de vendedor aguardam histórico de ownership confiável.

## Primeira abordagem nativa de campanha — implementação local (17/11/2026)

- Campanhas agora exigem mensagem de abertura e têm comando explícito `POST /api/v1/campaign-drafts/:id/start`. O comando valida tenant/permissão, status rascunho, canal e saúde do provider, agente habilitado com instruções, público atual elegível, janela/feriado e quota. Cria reservas tenant-scoped na outbox com idempotência por campanha+lead, respeitando o intervalo mínimo.
- Worker revalida canal/credenciais, agente, lead, contato principal/telefone, decisão de abordagem, DNC, conversa ativa, janela, feriados e limite de canal imediatamente antes da chamada Evolution/Cloud. Registra a mensagem no Inbox como solicitada e envia texto pelo adapter existente. Só confirma delivery/transition de lead após aceite definido do provider.
- Resultado de transporte ambíguo ou falha durante o envio vai para revisão manual e não é reenviado automaticamente; essa política evita duplicatas, mas ainda falta uma tela operacional de reconciliação de envios pendentes/ambíguos.
- Webhook inbound agora procura conversa ativa pelo tenant+provider+canal+contato quando o ID externo não coincide, associando respostas à conversa sintética criada pela campanha.
- Migration Drizzle `0053_absurd_logan.sql` adiciona estados de campanha e mensagem inicial com valor padrão compatível com rascunhos já existentes. Foi gerada, não aplicada. Nenhuma mensagem real foi enviada. Não rodei build/testes por preferência persistente; `git diff --check` foi executado apenas nos arquivos tocados por esta fatia.
- A reconciliação no Inbox agora permite associar a conversa entrante a lead existente e completar dados do contato, inclusive quando a Meta não fornece telefone. Próxima fatia: completar operação de campanha (pausar/concluir e visibilidade por envio) e criar reconciliação manual para resultados de transporte ambíguos. Áudio de saída e handoff automatizado por oportunidade seguem como melhorias posteriores.

## Deploy on-prem via Argo CD — retomada em 17/11/2026

- Infraestrutura confirmada pelo usuário: servidor on-premise; não há recursos AWS neste ambiente. Redis e banco devem seguir os padrões já existentes no cluster/projetos internos. Não provisionar AWS.
- Repositório principal `30sales`, branch `main`, está no commit `83ee4ee3c95ff628b59bb6dafaa66aedb4d7c9d8` (`fix(config): allow optional mail and media`), sem alterações rastreadas pendentes. O frontend e o backend são imagens/deployments separados; a aplicação Argo do backend é `sales-back` e a URL pública é `https://sales.3035service.com`.
- Build de produção do backend concluído com sucesso no GitHub Actions run `44091424517`; imagem implantada `ghcr.io/3035tech/30sales-back:main`, digest `fe23aba72e89d58802921fa6cf1e25052a71b3a16844573b2cf26d2bf3def102`.
- GitOps irmão `../gitops`, branch `main`, commit mais recente `d3eec671e8b0615312efe920a0dffe036d20b342` (`fix(sales): probe backend health endpoint`), sincronizado com sucesso no Argo CD. O diretório GitOps ainda contém `docs/` não rastreado; preservá-lo e não descartá-lo.
- Configuração do backend foi corrigida em fatias: provisionamento de secrets via External Secrets, SecretStore Kubernetes apontando para o SecretStore remoto com CA do `kube-root-ca.crt`, e probes configurados para o endpoint real `/api/v1/health` (o endpoint `/health` anterior retornava 404).
- Estado observado no Argo após sync de `d3eec67`: aplicação `sales-back` Healthy/Synced, Deployment `sales30-back` na revisão 7 e pod novo Running 1/1. O pod anterior estava terminando com a probe antiga. Verificação pública em `https://sales.3035service.com/api/v1/health` retornou `{ "status": "ok", "service": "30sales-back" }`.
- Próximo passo após reiniciar o notebook: abrir o Chrome e verificar novamente `sales-back` Healthy/Synced e o pod atual 1/1; conferir também a tela de login/frontend em `https://sales.3035service.com`. Se a API responder 502 ou houver erro de inicialização, inspecionar Logs do pod atual no Argo. Não rodar testes/build local por preferência persistente.
- Limitações conhecidas: SMTP e bucket de mídia/S3 estão opcionais para permitir o boot, mas continuam sem configuração funcional no ambiente; não presumir AWS. Migrations Drizzle pendentes não foram aplicadas; avaliar o estado/schema do banco antes de validar operações de domínio. Nenhuma mensagem real foi enviada.

## Atendimento por canal — continuidade em 18/11/2026

- Conversas criadas por campanhas em canal outbound iniciam com automação pausada; respostas recebidas reabrem o Inbox e notificam responsável/lead ou membros elegíveis. Assumir a conversa habilita resposta humana a qualquer hora. Canal hybrid preserva a automação inbound configurada.
- Atualização parcial de canal agora valida a política efetiva dentro da transação: se o canal aceita automação inbound/hybrid e o modo é `business_hours`/`after_hours`, exige pelo menos uma janela salva. Evita modo de agenda ativado com horários vazios, que seriam interpretados como 24 horas.
- Backlog atualizado. `git diff --check` passou; não executei build/testes, não apliquei migrations nem fiz commit/deploy. Próximo passo: seguir fechando a operação inbound/outbound e validar as transições de política por canal sem tocar no ambiente de produção.
- O campo de telefone do cadastro e os demais `PhoneField` usam `libphonenumber-js` (`AsYouType`/metadata min) para formatar números internacionais durante a digitação e preservar o cursor; a API continua recebendo E.164 (`+` e dígitos). Dependência adicionada com versão fixada em `1.13.16`; ainda sem build/teste ou publicação.

## Fechamento de versão — retomada em 18/11/2026

- Criada `docs/sofia_produto/10_checklist_fechamento_versao.md` para consolidar gates de escopo, isolamento/contratos, fluxos inbound/outbound, Evolution, migrations, configuração operacional e publicação. Status continua não pronto: alterações locais sem commit, migration `0056` sem aplicação e sem build/CI/runtime verificados nesta retomada.
- Revisão estática confirmou sino/toast de notificações no shell, consulta a cada 30 segundos e abertura de contexto. Encontrada lacuna: mensagens inbound sem responsável eram encaminhadas ao fallback de equipe apenas em canal outbound. Corrigido o fallback para qualquer modo, limitado à organização, papéis elegíveis e chave idempotente por destinatário/mensagem.
- Não executados build, testes ou validação visual; portanto a mudança de notificação ainda precisa de prova automatizada/manual antes do release. Próxima etapa: revisar diff restante por fronteiras de tenant/validação e decidir escopo; depois, mediante pedido explícito, rodar gates de build/teste e validar UI. Não aplicar migration, commitar, publicar ou enviar mensagens nesta etapa.

### Continuação do fechamento — CI de `b162c70` (18/11/2026)

- GitHub Actions do commit `b162c70` falharam nos dois builds: apóstrofo ASCII em `channels.policyDescription` quebrava o parse do catálogo inglês; `campaigns.service.ts` usava `CampaignStatusChangeRepositoryDto` sem importá-lo. Correções publicadas no commit `559ac4b` em `main`; frontend run `44275539479` e backend run `44275544814` concluíram com sucesso e publicaram as imagens.
- A configuração do webhook Evolution passou a incluir `MESSAGES_EDITED`, `SEND_MESSAGE_UPDATE` e `NEW_TOKEN`; o receiver já registra eventos desconhecidos/conhecidos sem handler em ledger redigido. Suporte/entrega na versão Evolution do ambiente ainda precisa ser confirmado.
- `git diff --check` passou. Build/testes locais não foram executados; a CI de produção comprovou a compilação e publicação. Migration `0056` continua não aplicada; sem deploy ou teste real de WhatsApp nesta etapa.
- Commit `c65f476` ampliou o alerta de falha de entrega: owner ainda membro recebe o alerta; sem owner válido, o fallback tenant-scoped avisa papéis de atendimento, com idempotência por mensagem/destinatário. Backend CI run `44277191439` passou e publicou a imagem.
- Commit `e299604` alinhou o backlog ao comportamento atual. `main` está limpa e atualizada em `origin/main`; imagens frontend/backend publicadas. Próximos gates continuam migration `0056`, configuração operacional e validação ponta a ponta do número de teste; deploy/Argo não executados.

### Validação consistente dos formulários — 18/11/2026

- Regra permanente registrada em `AGENTS.md`: erros de obrigatoriedade aparecem após a primeira tentativa de envio; erros de formato/faixa aparecem após interação/blur; corrigir limpa o erro; mensagem fica fora do input, ligada por `aria-describedby`, sem deslocamentos inesperados.
- Controles compartilhados de texto, telefone, textarea, select, número, moeda e calendário seguem a regra e bloqueiam o popup nativo em favor de mensagens inline acessíveis. Cadastro de canais marca campos obrigatórios com asterisco discreto.
- `git diff --check` passou; build/testes locais não foram executados conforme preferência. Commit `9b9af75` enviado para `main`; GitHub Actions frontend run `44281128471` passou e publicou a imagem. Sem sync do Argo.

### Reconciliação manual de campanhas — implementação local (18/11/2026)

- Adicionada à tela de campanhas uma lista paginada de envios outbound que terminaram em revisão manual, com campanha, lead/contato, telefone e estado da mensagem.
- Owner/admin/manager com acesso a integrações pode confirmar um envio como aceito após conferir o WhatsApp/provedor. A operação exige mensagem local existente, escopo de tenant, transação e auditoria; atualiza estado da mensagem, lead e conclusão da campanha quando apropriado.
- A confirmação nunca reenvia a mensagem. Itens sem mensagem correspondente permanecem visíveis, mas sem ação de confirmação. Nenhuma migration é necessária.
- `git diff --check` passou. Build/testes não foram executados conforme preferência persistente. Revisar o diff e validar os dois builds na GitHub Actions após commit; não houve publicação/sync do Argo nesta etapa.
- Ajuste de interface: a lista agora distingue carregamento, vazio e erro, e desativa atualização/paginação enquanto a consulta está em andamento. `git diff --check` pendente para esta revisão; sem build/testes locais por preferência persistente.
