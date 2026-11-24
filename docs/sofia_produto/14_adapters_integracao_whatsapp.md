# Adapters de integração WhatsApp

## Objetivo

Evolution e WhatsApp Business Cloud API são transportes diferentes para o mesmo domínio de atendimento do 30Sales. A Inbox, o histórico, ownership, automação, auditoria, autorização e tenancy pertencem ao 30Sales. Formato de webhook, autenticação, IDs externos, recursos, limites e regras de entrega pertencem a cada adapter.

Um caso de uso do domínio deve pedir uma operação sem conhecer URL, DTO ou credencial de provider. O adapter selecionado pelo canal traduz a operação para o provider e devolve resultado tipado, incluindo falha ou confirmação ambígua. Capacidade indisponível deve ser declarada por operação, não inferida da marca do provider.

## Fronteiras

| Área | Contrato comum do produto | Responsabilidade de cada adapter |
| --- | --- | --- |
| Mensagens | enviar texto, resposta, reação, mídia e contato; resultado de entrega | payload/endpoint, IDs, tipos aceitos e limitações |
| Entrada | mensagem, status, mutação, contato, estado de chat, grupo e presença normalizados | autenticar callback, reconhecer eventos, validar payload e converter IDs/timestamps |
| Mídia | arquivo recebido/pronto para visualizar ou baixar | recuperar mídia, expiração, URL, autenticação, checksum e MIME |
| Conversa | pessoa ou grupo, destinatário externo e participantes | identidade externa e fontes de metadados/membros |
| Operação de canal | conectar, saúde, configuração e estado técnico | lifecycle e APIs de gerenciamento próprias do provider |

Adapters compartilham contratos de domínio; não compartilham payloads, DTOs externos, credenciais nem pressupostos sobre os identificadores. IDs externos são sempre escopados por tenant, canal e provider.

## Capacidades e diferenças conhecidas

- Evolution/Baileys expõe conexão de dispositivo, callbacks de eventos e JIDs; permite consultar participantes de um grupo existente pela instância conectada. Grupos observados não são automaticamente equivalentes a grupos administrados pela API Meta.
- WhatsApp Business Cloud API usa Graph API, tokens e phone number IDs. Seu Groups API é uma capacidade separada e restrita a negócios elegíveis com Official Business Account; grupos são criados pela API e têm limites/tipos de mensagem próprios. Grupos dessa API não significam acesso a todos os grupos WhatsApp já existentes.
- Os contratos precisam expressar as capacidades em runtime. “Suporta grupos” não basta: identificar grupos existentes, buscar participantes, enviar texto/mídia, receber membros via webhook, templates, reações e administrar grupo são capacidades distintas.
- Webhook Meta pode identificar participantes por número ou BSUID, inclusive sem telefone. O domínio não pode exigir telefone como identidade universal. A modelagem atual de grupo/effect deve ser generalizada antes de ativar grupos Meta de ponta a ponta.

## Estado da implementação

- Envio de texto, mídia e contato e download de mídia recebida passaram para adapters Evolution/Meta com um registry comum. O envio mantém o resultado de entrega já usado pelos fluxos de Inbox, campanha e assistente.
- Consulta de participantes do Inbox usa o contrato comum: Evolution consulta pela instância; Meta consulta `/{group-id}?fields=participants`. Participantes Meta sem telefone ficam identificados pelo BSUID/username; não são descartados por falta de telefone.
- A camada de Inbox trata o identificador de grupo como opaco e delega sua validação ao adapter. Evolution continua exigindo JID `@g.us`; o adapter Meta valida o ID Graph sem impor formato Evolution. Isso não habilita envio/ingestão de grupos Meta.
- Prévia autenticada de imagem, vídeo, áudio e PDF usa blob do endpoint do Inbox; os outros formatos seguem como download.
- Cartões Evolution `externalAdReply` preservam título, corpo e link HTTPS/HTTP; links remotos de thumbnail não são buscados pelo servidor. Tipos ainda não reconhecidos preservam um identificador sanitizado para diagnóstico e são apresentados como não suportados, sem armazenar o payload bruto.
- A autenticação e normalização dos envelopes Evolution/Meta foram extraídas para adapters e têm fixtures sintéticas para autenticação, lotes de eventos e assinatura Meta. A camada de serviço ainda escolhe canal e despacha eventos; isso é roteamento de aplicação, não parsing do formato externo.
- **Ainda não é a separação completa:** ingestão de grupos Meta continua desabilitada e envio em grupo continua bloqueado para Meta. A reconciliação de ecos Evolution inclui anexos, mas sua concorrência ainda precisa de teste de integração com banco.
- Diretriz atual: priorizar Evolution e manter Meta somente no nível de contratos/assinaturas de adapter. Próximas etapas Evolution: operacionalizar reconciliação/dead-letter sem risco de duplicação e validar entrega ponta a ponta contra instância configurada. A verificação periódica de deriva do webhook está disponível na aba Monitoramento enquanto ela permanece aberta.
- Critério observável para concluir: mensagens individuais Evolution e Cloud continuam criando/atualizando a mesma forma canônica de Inbox; provider e identidade são preservados; grupos Meta permanecem sem ingestão habilitada até o comando/repositório aceitar o contrato comum e testes sintéticos cobrirem BSUID, deduplicação e tenant. Validar ainda assinatura e envelopes com fixtures redigidas de cada provider, e mídia/card Evolution sem acesso a URLs arbitrárias.
- Não ligar grupos Meta até validar elegibilidade, callbacks `group_lifecycle_update`/`group_participants_update`, participantes por BSUID, anexos, status e envio no ambiente de integração Meta. Não prometer paridade total quando uma API não oferece uma operação.

## Referências primárias

- [Meta WhatsApp Groups API: elegibilidade e limites](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)
- [Meta Groups API: participantes e metadados do grupo](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference)
- [Meta Group Messaging: envio e webhooks de mensagem de grupo](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging)
- [Evolution API: webhooks](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md)
