# Cobertura de eventos: Evolution e Meta

## Objetivo

Manter o 30Sales como dono do Inbox e do fluxo SDR, usando Evolution (Baileys) ou WhatsApp Business Cloud API como transporte. O webhook de cada canal precisa aceitar eventos sem perder eventos ainda não ligados a uma ação do produto; mensagens e recibos continuam com processamento próprio.

## Comportamento implementado nesta fatia

- Na tela de canais, usuários com permissão de gestão podem enviar/reaplicar a configuração de webhook à instância Evolution cadastrada. A URL de callback é derivada da origem pública da aplicação e usa o ID interno do canal; a chave do webhook segue somente no cabeçalho configurado no provedor. A lista de eventos segue os nomes expostos pela versão Evolution v2.3.7 configurada no GitOps.
- A configuração habilita eventos operacionais e de conversa, desativa `base64` para não transportar mídia no webhook e usa callback único (sem sufixo por evento). Sucesso significa que a Evolution aceitou a requisição; não confirma que a URL pública está alcançável nem que eventos já chegaram. A ação é auditada sem registrar segredo.
- Evolution aceita callback na URL base do canal e na URL com sufixo do evento (`webhook_by_events`). O 30Sales usa URL base (`byEvents: false`). Mensagens recebidas e atualizações de entrega seguem para os handlers existentes.
- Outros eventos Evolution, inclusive eventos futuros desconhecidos, são deduplicados por canal e fingerprint e gravados em `inbox_events`.
- `CONTACTS_UPSERT` e `CONTACTS_UPDATE` atualizam o nome de contatos que já possuem conversa no canal, sem importar toda a agenda nem criar pessoas órfãs. O lookup usa organização, canal e telefone normalizado; contatos LID sem telefone permanecem apenas no ledger.
- `LOGOUT_INSTANCE` e `REMOVE_INSTANCE` marcam o canal como desconectado, reutilizando o alerta in-app de desconexão. `CONNECTION_UPDATE` continua sendo a fonte principal para os estados conectando/conectado/desconectado.
- Eventos Meta `messages` seguem para o handler de mensagens/status. Os demais campos WhatsApp Business Account são associados pelo `phone_number_id` ou pelo WABA ID e gravados no mesmo ledger.
- Payload original não é persistido. O ledger guarda tipo, família, hash e o ID interno do canal; não guarda texto, número de telefone, QR code, token ou credencial.
- A tela de Canais lista o ledger por canal, com provedor, tipo/família, status de registro, horário e tentativas; tem paginação e mostra apenas código de erro, nunca o payload bruto. Essa tela comprova a gravação de eventos aceitos pelo handler, não a chegada de callbacks rejeitados por assinatura/autenticação nem erros anteriores ao ledger.
- Status de mensagem recebido antes da mensagem correspondente também fica registrado como `messages.status.unmatched`; ainda não é reaplicado automaticamente quando a mensagem chegar.
- Eventos genéricos são registrados como capturados, não como efeitos comerciais concluídos. Atualização de estado de conexão, espelhamento de contatos/chats, edição/remoção de mensagens, presença, templates e alertas ainda precisam de handlers próprios.

## Inventário Evolution

O nome canônico abaixo transforma os nomes em maiúsculas da Evolution em minúsculas com pontos. Os eventos conhecidos são registrados; `MESSAGES_UPSERT` e `MESSAGES_UPDATE` têm processamento específico.

| Família | Eventos | Tratamento atual |
| --- | --- | --- |
| Canal | `APPLICATION_STARTUP`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`, `LOGOUT_INSTANCE`, `REMOVE_INSTANCE` | `CONNECTION_UPDATE` persiste saúde e gera alerta na transição para desconectado; logout/remoção também marcam o canal desconectado. Inicialização e QR ficam no ledger; QR não é persistido nem exibido. |
| Mensagens | `MESSAGES_SET`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`, `SEND_MESSAGE` | `UPSERT` inbound e `UPDATE` de entrega têm handlers; snapshot, exclusão e eco de envio são capturados, sem importar/alterar a timeline. |
| Contatos | `CONTACTS_SET`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE` | UPSERT/UPDATE enriquecem nome de pessoa já relacionada a conversa. SET segue apenas no ledger; não importa a agenda inteira nem associa contatos automaticamente a leads. |
| Presença | `PRESENCE_UPDATE` | Capturado; não alimenta indicador de digitando/online. |
| Chats | `CHATS_SET`, `CHATS_UPDATE`, `CHATS_UPSERT`, `CHATS_DELETE` | Capturados. O modelo atual não tem campos de arquivamento/pin/unread do provider; não alteram estado comercial nem removem conversas do CRM. |
| Grupos | `GROUPS_UPSERT`, `GROUP_UPDATE`, `GROUP_PARTICIPANTS_UPDATE` | Capturados; grupos continuam fora da criação automática de conversas de lead. |
| Outros | `LABELS_EDIT`, `LABELS_ASSOCIATION`, `CALL`, `TYPEBOT_START`, `TYPEBOT_CHANGE_STATUS` e eventos desconhecidos | Capturados para diagnóstico; sem efeito no CRM/Inbox. |

Uma instância foi inspecionada no Manager em 17/11/2026: o webhook estava desligado, a URL vazia e todos os eventos desmarcados. Portanto, ela ainda não entrega eventos ao 30Sales. A configuração pela tela Canais do 30Sales habilita URL, segredo e eventos; a captura no Manager é evidência de configuração efetiva somente depois que a ação for executada.

Snapshots `*_SET` são registrados por callback como um único evento, sem explodir listas grandes em milhares de gravações. A importação histórica precisa de paginação, política de retenção e reconciliação antes de ser ativada.

## Inventário Meta WhatsApp

O webhook de mensagens do Cloud API reúne mensagens recebidas, recibos de saída e erros. Outros campos podem ser habilitados conforme produto, versão da Graph API e ativos/assinaturas da conta. O receptor trata campos desconhecidos de forma compatível e grava o campo recebido, limitado e sanitizado.

| Campos conhecidos | Família | Tratamento atual |
| --- | --- | --- |
| `messages` | Mensagem | Mensagens de texto e tipos suportados vão ao Inbox; status `sent`, `delivered`, `read`, `failed` atualizam envio quando há correspondência. |
| `account_update`, `account_alerts`, `account_review_update`, `business_capability_update`, `partner_solutions`, `payment_configuration_update`, `automatic_events` | Conta/canal/atribuição | Ledger; ainda sem atualizar saúde, limites, atribuição de campanha ou alertas. |
| `phone_number_name_update`, `phone_number_quality_update`, `security` | Número/canal | Ledger; ainda sem atualizar o cadastro/saúde do canal. |
| `message_template_status_update`, `message_template_quality_update`, `message_template_components_update`, `template_category_update` | Template | Ledger; não existe catálogo de templates sincronizado ainda. |
| `user_preferences` | Preferências/opt-out | Ledger; ainda não altera preferências de contato. |
| `smb_app_state_sync`, `smb_message_echoes`, `history`, `calls` | Sincronização/eco/chamada | Ledger; sem importação automática ou experiência de chamada. |
| Qualquer outro campo | Outro | Ledger seguro para não descartar notificações novas do provedor. |

## Próximas fatias recomendadas

1. Materializar campos de número/conta da Meta em estado de saúde do canal e alertas.
2. Completar mensagens: localização, contatos/vCard, reação, edição, exclusão, resposta/quote, botões/listas, enquetes e tipos de mídia; mapear os diferentes recibos e erros por provider.
3. Implementar fila de reconciliação para status fora de ordem e envio ambíguo, com retry idempotente e dead-letter observável.
4. Sincronizar contatos/chats e evento de troca de contato com a empresa/lead, mantendo múltiplos contatos e seleção explícita do principal/em conversa.
5. Expor o ledger por tenant na área de canais com filtros, estado de processamento, correlation ID e erros redigidos; nunca mostrar payload bruto com dados pessoais/segredos.
6. Verificar a configuração remota da Evolution e o recebimento ponta a ponta, além de detectar deriva após reinício/alteração da instância.

## Estado de conexão Evolution

- `CONNECTION_UPDATE` atualiza o estado do canal para `connected`, `connecting`, `disconnected` ou `unknown`; somente valores conhecidos são persistidos. O evento segue o ledger existente.
- A tela de canais exibe o estado persistido e o horário da última atualização. A verificação manual de saúde também atualiza esse estado.
- Respostas humanas são recusadas quando o estado conhecido é `connecting` ou `disconnected`. O runtime do assistente pula o envio nesses mesmos estados. Canais sem evento observado (`NULL`/desconhecido) seguem compatíveis com o comportamento anterior; Meta não usa esse bloqueio.
- Ao entrar em `disconnected`, cada membro da organização recebe um alerta in-app, deduplicado por transição e gravado na mesma transação do estado. A notificação leva à área de canais; eventos repetidos enquanto desconectado não geram alertas novos.
- Credenciais alteradas invalidam o estado anterior. A migration aditiva `0054_thin_sheva_callister.sql` foi gerada e ainda não foi aplicada.
- A migration aditiva `0055_curved_shard.sql` adiciona o alvo tenant-scoped para canais na central de notificações e registra o novo tipo de alerta. Também ainda não foi aplicada.
- A validação ponta a ponta do webhook remoto continua pendente; timestamps representam a ordem de recebimento local e callbacks atrasados podem atualizar o estado mais recente.

## Identidade WhatsApp sem telefone

- O handler Meta aceita `user_id`/`from_user_id` como identidade quando telefone (`from`/`wa_id`) não está disponível. A pessoa é resolvida pelo alias tenant-scoped `meta_bsuid` em `external_records`; alias ainda não visto cria pessoa com telefone nulo e mensagem/conversa no Inbox.
- Quando há telefone e BSUID, o alias também é registrado. O identificador externo é namespaced pelo canal para impedir colisão entre ativos; contato previamente resolvido pelo alias mantém a mesma pessoa quando o telefone aparecer depois.
- Sem telefone, o Inbox não habilita resposta humana. O assistente ainda pode transcrever áudio configurado, mas não gera resposta nem tenta envio; o repositório valida novamente o telefone atual no momento do envio.
- Não requer migration: usa `external_records` existente e `people.phone` nullable. Não implementa envio Meta para BSUID; uma identidade sem telefone continua sem destino válido para resposta.
- O Inbox agora permite ao responsável pela conversa vinculá-la a um lead existente e atualizar nome/telefone do contato. O operador pode marcar explicitamente contato principal e interesse; principal atualiza `lead_contacts.is_primary` e `leads.person_id` dentro da mesma transação, serializada pelo lead. O padrão não presume que quem respondeu seja decisor ou esteja interessado. A operação revalida tenant, ownership e lead, e audita a mudança sem guardar telefone no evento. Telefone só habilita envio quando informado em formato internacional válido; o valor persistido é normalizado para dígitos. Erro de telefone inválido tem mensagem específica no formulário.
- Meta documenta BSUID para interações com usuários de username e os campos de identidade nos webhooks; conferir a versão e o produto Meta habilitado antes de depender de envio por BSUID. Fontes: [Meta WhatsApp webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/), [Meta Business Agent changelog](https://developers.facebook.com/documentation/meta-business-agent/changelog/).

## Fontes

- [Evolution API: enum de eventos aceitos pela instância](https://github.com/evolution-foundation/evolution-api/blob/main/src/validate/instance.schema.ts)
- [Evolution Docs: configuração e eventos de webhook](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md)
- [Meta: visão geral de webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/)
- [Meta Graph API: tópicos de webhook, incluindo WhatsApp Business Account](https://developers.facebook.com/docs/graph-api/webhooks/reference)
