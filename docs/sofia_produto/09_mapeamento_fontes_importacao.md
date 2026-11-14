# Sofia → 30Sales: fontes e regras de importação

## Evidência e limite

Este mapeamento foi feito a partir dos exports versionados de n8n em `workspace/ferramentas/n8n` e do schema SQL local da Sofia. É uma leitura estática: não confirma o estado atual dos serviços, bancos, exports vivos nem o volume em produção. Antes de importar, comparar com exports e amostras atuais aprovados.

## Fontes observadas

| Fonte | Identidade externa observada | Dados úteis | Papel no fluxo atual |
|---|---|---|---|
| Twenty | Company `id` | `name`, telefone principal (`phonesPrimaryPhoneNumber`, `phones.primaryPhoneNumber` ou variações), `createdAt` | Origem de prospecção cold; o Workflow C evita duplicar pelo telefone ou `twenty_id` e atualiza status de abordagem |
| Postgres Sofia | `sofia_leads.id`; `twenty_id`; telefone | nome, empresa, inbox/chip, status operacional, origem, handoff, follow-ups, indicação | Estado operacional SDR/BDR e relacionamento com Twenty/Chatwoot |
| Postgres Sofia — mensagens | `sofia_mensagens.id`; `external_ref` quando disponível | lead, papel, texto, horário | Histórico da conversa; pode conter dados pessoais e precisa de política de retenção/redação |
| Chatwoot (legado) | account + conversation ID; message ID | inbox, contato, status, assignee, mensagens, direção/horário, anexos | Fonte opcional de importação histórica; não executa mensagens no 30Sales |
| Evolution | instância/chip | saúde e transporte do WhatsApp | Provider de canal; não é identidade primária de conta ou pessoa |

O Workflow C local consulta Twenty Companies e extrai `id`, `name`, telefone e `createdAt`. A Sofia deduplica sua fila pelo telefone ou `twenty_id`; isso é uma regra legada de ingestão, não uma autorização para fundir registros automaticamente no 30Sales.

O schema base `01_schema.sql` é histórico e não descreve sozinho todas as evoluções. Usar os SQLs incrementais e workflows atuais como mapa complementar; não tratar esse arquivo isolado como schema vivo.

## Identidade no 30Sales

- `external_records` usa `(organization_id, provider, record_type, external_id)` para localizar um objeto externo. FKs compostas mantêm o vínculo no tenant correto.
- IDs diferentes da mesma origem podem apontar para um objeto interno comum após revisão/merge; número de telefone, nome ou e-mail não substitui o ID externo.
- `conversations` já tem identidade Chatwoot por organização, provider e `external_conversation_id`; mensagens são deduplicadas dentro da conversa por `external_message_id`.
- Telefone normalizado pode gerar candidato de pessoa para revisão. Nunca fundir empresa, pessoa ou lead automaticamente apenas por telefone ou nome.
- Preservar `source_status`, origem e horários do legado. Status operacional da Sofia não equivale diretamente a status de lead nem à etapa/resultado da oportunidade.

## Mapeamento de status — decisão pendente de amostra real

O legado distingue pelo menos `novo`, `em_conversa`, `aguardando_followup`, `handoff`, `perdido` e `ganho`. O 30Sales separa status de lead, oportunidade, handoff, tarefa e transporte de mensagem. Não fazer conversão automática de `perdido` ou `ganho` para etapa terminal sem motivo, evidência e data verificáveis. `handoff` também não significa reunião aceita ou oportunidade ganha.

Durante o preview, mostrar status de origem e destino sugerido lado a lado. Valores sem regra confirmada devem aparecer como conflito para revisão; nenhum deles deve desaparecer por normalização.

## Fluxo de importação proposto

1. Capturar exports/read-only snapshots aprovados de Twenty, Chatwoot e Postgres Sofia e guardar contagens, instante e hash do arquivo sem reter payload sensível por padrão.
2. Normalizar cada objeto para contrato interno versionado; preservar IDs, tipo de objeto e valores de origem.
3. Fazer identity check tenant-scoped; identificar IDs já vinculados, sem vínculo, ID duplicado no lote e conflito de vínculo.
4. O endpoint `POST /api/v1/imports/reconciliation-preview` recebe até 100 registros já normalizados e devolve vínculos externos existentes, conflitos de tipo, candidatos exatos e `sourceStatus`; não escreve nem envia mensagens. A busca atual considera nome exato normalizado de conta e e-mail/telefone normalizados para pessoa/lead; oportunidades são candidatas pela conta. Não faz fuzzy match nem confirma uma reconciliação.
5. Reconciliar contagens e amostra de IDs/relacionamentos; exigir revisão dos conflitos e aprovação de um operador autorizado.
6. Importar em lotes idempotentes com `external_records`, histórico/auditoria e progresso de job; replay não cria segundo registro nem apaga fato confirmado.

## Pendências antes do primeiro lote

- Export vivo atual de workflows e schema Postgres; reconciliar divergências com os arquivos locais.
- Amostras anonimizadas de cada fonte e contagens por status/inbox/origem.
- Campo exato do Company no Twenty usado como telefone e enum/IDs reais dos status.
- Contrato de identificação de mensagem Chatwoot, autoria, mídia e estado de entrega.
- Mapeamento de indicações, follow-ups pendentes, eventos CRM, handoffs e links entre as fontes.
- Regras de colisão de telefone, merge, retenção de mensagens e provenance por campo.
- Staging/database aprovado e plano de rollback; migrations 0001–0011 continuam sem aplicação.

## Escopo implementado do preview

- O contrato aceita `provider` (`twenty`, `chatwoot`, `sofia_postgres`), tipo e ID externo, tipo canônico pretendido e campos normalizados de nome da conta/contato, e-mail, telefone e status de origem. Payloads brutos dos conectores ainda precisam de adapters.
- Limite do lote: 100 registros; IDs externos repetidos no lote são rejeitados. A busca não usa fuzzy matching, domínio, empresa alternativa nem regra histórica de deduplicação por telefone isoladamente.
- `already_linked` informa vínculo existente do mesmo tipo; vínculo existente de outro tipo retorna `type_conflict`. Sem vínculo, candidatos podem resultar em `possible_match`, `ambiguous` ou `no_match`.
- A saída é apenas apoio à revisão. Não há ação para aprovar candidato, gravar `external_records`, resolver conflito, importar histórico ou registrar progresso de job.
- A tela **Importações** recebe CSV UTF-8 com os campos normalizados listados acima e encaminha a prévia pelo client central da aplicação. Ela não persiste o arquivo ou resultado. O CSV ainda precisa ser preparado manualmente; não é um adapter Twenty, Chatwoot ou Postgres Sofia.
