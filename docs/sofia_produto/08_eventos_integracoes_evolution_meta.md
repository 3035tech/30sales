# Cobertura de eventos: Evolution e Meta

## Objetivo

Manter o 30Sales como dono do Inbox e do fluxo SDR, usando Evolution (Baileys) ou WhatsApp Business Cloud API como transporte. O webhook de cada canal precisa aceitar eventos sem perder eventos ainda não ligados a uma ação do produto; mensagens e recibos continuam com processamento próprio.

## Comportamento implementado nesta fatia

- Na tela de canais, usuários com permissão de gestão podem enviar/reaplicar a configuração de webhook à instância Evolution cadastrada. A URL de callback é derivada da origem pública da aplicação e usa o ID interno do canal; a chave do webhook segue somente no cabeçalho configurado no provedor. A lista de eventos segue os nomes expostos pela versão Evolution v2.3.7 configurada no GitOps.
- Na tela de canais, o operador informa o nome de instância desejado e pode iniciar o pareamento sem abrir o Manager Evolution. O backend lista as instâncias pela integração configurada: se encontrar o nome, solicita conexão; se não encontrar, cria uma instância `WHATSAPP-BAILEYS` com QR habilitado e exibe o QR temporário. O mesmo comando configura o webhook e os eventos na Evolution; se essa etapa falhar, o QR continua disponível e a interface informa que o canal não receberá callbacks até a configuração ser reaplicada. O cadastro local e as credenciais precisam existir antes dessa ação. O telefone ainda precisa escanear o QR no WhatsApp. A criação automática requer uma API key da Evolution com permissão administrativa; chaves restritas a uma instância existente não conseguem criar outras.
- O QR é validado como data URL de imagem, tem limite de tamanho e só permanece no estado da tela enquanto o modal está aberto; não é persistido em banco, logs, eventos ou auditoria. Fechar o modal descarta o QR. A configuração do webhook também pode ser reaplicada por sua ação própria na tela Canais.
- A aba Monitoramento acompanha os estados Evolution persistidos pelos eventos de conexão e atualiza a lista a cada 30 segundos enquanto está aberta. O operador pode consultar a saúde real do provedor por número; esse comando persiste o resultado e pode gerar o alerta de desconexão. Um sinal com mais de cinco minutos é marcado como antigo para não sugerir que o estado observado é necessariamente atual.
- A configuração habilita eventos operacionais e de conversa, desativa `base64` para não transportar mídia no webhook e usa callback único (sem sufixo por evento). Depois do POST, o backend consulta `GET /webhook/find/{instance}` e só confirma a configuração se URL, segredo, opções e a lista completa de eventos estiverem salvos. Isso comprova configuração no provider, mas não alcançabilidade pública nem recebimento de callbacks; a ação é auditada sem registrar segredo.
- Evolution aceita callback na URL base do canal e na URL com sufixo do evento (`webhook_by_events`). O 30Sales usa URL base (`byEvents: false`). Mensagens recebidas e atualizações de entrega seguem para os handlers existentes.
- Outros eventos Evolution, inclusive eventos futuros desconhecidos, são deduplicados por canal e fingerprint e gravados em `inbox_events`.
- `CONTACTS_UPSERT` e `CONTACTS_UPDATE` atualizam o nome de contatos que já possuem conversa no canal, sem importar toda a agenda nem criar pessoas órfãs. O lookup usa organização, canal e telefone normalizado; contatos LID sem telefone permanecem apenas no ledger.
- `LOGOUT_INSTANCE` e `REMOVE_INSTANCE` marcam o canal como desconectado, reutilizando o alerta in-app de desconexão. `CONNECTION_UPDATE` continua sendo a fonte principal para os estados conectando/conectado/desconectado.
- Eventos Meta `messages` seguem para o handler de mensagens/status. Os demais campos WhatsApp Business Account são associados pelo `phone_number_id` ou pelo WABA ID e gravados no mesmo ledger.
- Payload original não é persistido. O ledger guarda tipo, família, hash e o ID interno do canal; não guarda texto, número de telefone, QR code, token ou credencial.
- A tela de Canais lista o ledger por canal, com provedor, tipo/família, status de registro, horário e tentativas; tem paginação e mostra apenas código de erro, nunca o payload bruto. Essa tela comprova a gravação de eventos aceitos pelo handler, não a chegada de callbacks rejeitados por assinatura/autenticação nem erros anteriores ao ledger.
- Status de mensagem recebido antes do retorno do envio fica temporariamente registrado com o ID externo e o estado de entrega, sem conteúdo da mensagem. Quando o retorno do provider salvar esse ID, o ledger é associado à mensagem e o estado é reaplicado; se o webhook chegar depois, o status é aplicado diretamente. Status sem mensagem correspondente continuam visíveis como `messages.status.unmatched`.
- Eventos genéricos são registrados como capturados, não como efeitos comerciais concluídos. Espelhamento de chats, presença, templates, alertas e mensagens antigas ainda precisam de handlers/fluxo próprios. Eventos de edição e exclusão atualizam mensagens existentes quando o provider entrega ID e, para edição, conteúdo legível.

## Inventário Evolution

O nome canônico abaixo transforma os nomes em maiúsculas da Evolution em minúsculas com pontos. Os eventos conhecidos são registrados; `MESSAGES_UPSERT` e `MESSAGES_UPDATE` têm processamento específico.

| Família | Eventos | Tratamento atual |
| --- | --- | --- |
| Canal | `APPLICATION_STARTUP`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`, `LOGOUT_INSTANCE`, `REMOVE_INSTANCE` | `CONNECTION_UPDATE` persiste saúde e gera alerta na transição para desconectado; logout/remoção também marcam o canal desconectado. Inicialização e QR ficam no ledger; QR não é persistido nem exibido. |
| Mensagens | `MESSAGES_SET`, `MESSAGES_UPSERT`, `MESSAGES_EDITED`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`, `SEND_MESSAGE`, `SEND_MESSAGE_UPDATE` | `UPSERT` inbound, recibos (`MESSAGES_UPDATE` e `SEND_MESSAGE_UPDATE`), edição com texto disponível e exclusão de mensagem existente atualizam o Inbox. `MESSAGES_SET` é enfileirado em lotes cifrados e idempotentes; o worker importa mensagens inbound para conversas diretas ou grupos já existentes, sem executar automações ou alertas retroativos. Ecos de envio seguem no ledger. Edição sem conteúdo legível e mutação sem mensagem correspondente não alteram a timeline. |
| Contatos | `CONTACTS_SET`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE` | Eventos atualizam o nome de pessoas já relacionadas a conversas; não importam a agenda inteira nem associam contatos automaticamente a leads. |
| Presença | `PRESENCE_UPDATE` | `composing` e `recording` são publicados por SSE para conversas Evolution existentes e autorizadas. A indicação expira no cliente; JIDs sem correspondência segura são ignorados. |
| Chats | `CHATS_SET`, `CHATS_UPDATE`, `CHATS_UPSERT`, `CHATS_DELETE` | O receptor persiste arquivamento, fixação, contador de não lidas e remoção, quando presentes, em colunas técnicas separadas do status comercial e da leitura individual; remoção não apaga a conversa nem mensagens. Grupos e chats ainda não associados a um contato ficam apenas no ledger. A Evolution 2.3.7 reporta descarte de `archived`/`unreadCount` antes do webhook, então a plataforma não consegue sincronizar esses valores até correção/upgrade do provider. |
| Grupos | `GROUPS_UPSERT`, `GROUP_UPDATE`, `GROUP_PARTICIPANTS_UPDATE` | `GROUPS_UPSERT`/`GROUP_UPDATE` atualizam o nome de grupo já existente no Inbox quando JID e título estão disponíveis. `GROUP_PARTICIPANTS_UPDATE` continua no ledger; eventos de grupo não criam leads nem contatos. |
| Outros | `LABELS_EDIT`, `LABELS_ASSOCIATION`, `CALL`, `TYPEBOT_START`, `TYPEBOT_CHANGE_STATUS` e eventos desconhecidos | Capturados para diagnóstico; sem efeito no CRM/Inbox. |

Uma instância foi inspecionada no Manager em 17/11/2026: o webhook estava desligado, a URL vazia e todos os eventos desmarcados. Portanto, ela ainda não entrega eventos ao 30Sales. A configuração pela tela Canais do 30Sales habilita URL, segredo e eventos; a captura no Manager é evidência de configuração efetiva somente depois que a ação for executada.

Snapshots de mensagens e contatos `*_SET` são registrados sem persistir o payload bruto. `MESSAGES_SET` é convertido em mensagens normalizadas, cifrado e colocado na fila `evolution_history_batches` em lotes de até 25, com retry limitado e limpeza do payload ao concluir ou esgotar tentativas. A reconciliação exige conversa direta ou de grupo já conhecida; mensagens anteriores à conversa não criam contatos/conversas. `CHATS_SET` atualiza estado dos chats diretos já existentes. A migration da fila precisa ser aplicada antes de ativar este worker no ambiente.

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
2. Completar mensagens: replies/quotes, botões/listas, enquetes, reações estruturadas e tipos de mídia restantes; mapear os diferentes recibos e erros por provider. Localização e vCard simples aparecem como texto legível; atualização e exclusão são aplicadas quando o ID da mensagem é identificável.
3. Implementar fila de reconciliação para status fora de ordem e envio ambíguo, com retry idempotente e dead-letter observável.
4. Sincronizar contatos/chats e evento de troca de contato com a empresa/lead, mantendo múltiplos contatos e seleção explícita do principal/em conversa.
5. Expor o ledger por tenant na área de canais com filtros, estado de processamento, correlation ID e erros redigidos; nunca mostrar payload bruto com dados pessoais/segredos.
6. Verificar a configuração remota da Evolution e o recebimento ponta a ponta, além de detectar deriva após reinício/alteração da instância.

## Estado de conexão Evolution

- `CONNECTION_UPDATE` atualiza o estado do canal para `connected`, `connecting`, `disconnected` ou `unknown`; somente valores conhecidos são persistidos. O evento segue o ledger existente.
- A tela de canais exibe o estado persistido e o horário da última atualização. A verificação manual de saúde também atualiza esse estado.
- A aba de monitoramento consulta o estado atual da Evolution a cada minuto, em grupos de até 20 canais, sem persistir cada leitura nem gerar auditoria recorrente. Exibe quando a última consulta falhou, quando o último sinal de conexão tem mais de cinco minutos e a contagem de falhas de entrega de mensagens recebidas por webhook nas últimas 24 horas. O endpoint limita IDs à organização ativa e exige permissão de leitura de integrações.
- Respostas humanas são recusadas quando o estado conhecido é `connecting` ou `disconnected`. O runtime do assistente pula o envio nesses mesmos estados. Canais sem evento observado (`NULL`/desconhecido) seguem compatíveis com o comportamento anterior; Meta não usa esse bloqueio.
- Ao entrar em `disconnected`, cada membro da organização recebe um alerta in-app, deduplicado por transição e gravado na mesma transação do estado. A notificação leva à área de canais; eventos repetidos enquanto desconectado não geram alertas novos.
- Credenciais alteradas invalidam o estado anterior. A migration aditiva `0054_thin_sheva_callister.sql` implementa essa mudança; confira o journal Drizzle do ambiente para saber se foi aplicada.
- A migration aditiva `0055_curved_shard.sql` adiciona o alvo tenant-scoped para canais na central de notificações e registra o novo tipo de alerta. Confira o journal Drizzle do ambiente para saber se foi aplicada.
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
