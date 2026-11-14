# Contexto de continuidade — 30Sales

Atualizado em 14/11/2026. Leia este arquivo ao retomar uma sessão longa para recuperar decisões recentes, estado do código e próximo passo. As regras permanentes de engenharia estão em [`../AGENTS.md`](../AGENTS.md); este documento complementa essas regras e não as substitui.

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

- Branch atual: `develop`; working tree limpa antes da atualização desta memória.
- Último commit: `273c154 feat(inbox): ingest WhatsApp inbound webhooks`.
- Fatias recentes já integradas em `develop`:
  - envio de respostas humanas pelos adapters Evolution/Cloud API, com credenciais cifradas e idempotência (`7c156db`);
  - notas internas na timeline com autor/auditoria (`35cd4df`);
  - etiquetas tenant-scoped e filtro por etiqueta (`caf2e2d`);
  - ingestão inbound autenticada/deduplicada para Evolution e Cloud API (`273c154`).
- Antes dessas, já estavam implementados ownership/atribuição de conversas e controles de modo de automação (`dc60b74`, `880920e`).
- Migrations versionadas até `0018_abandoned_hydra.sql`. As migrations continuam **não aplicadas** em qualquer banco/ambiente nesta sessão. A ingestão inbound não precisou de migration nova.
- Não houve deploy, envio real de mensagem ou aplicação de migration.

## Comportamento inbound entregue no código

- Meta Cloud API: callback GET verifica `META_WEBHOOK_VERIFY_TOKEN`; POST valida HMAC SHA-256 em `X-Hub-Signature-256` usando `META_APP_SECRET` e o corpo bruto.
- Evolution: `POST /api/v1/webhooks/evolution/:channelId` exige `X-30Sales-Webhook-Key`, segredo exclusivo de webhook por canal; verifica também a instância configurada. A API key de envio é separada.
- Evolution `MESSAGES_UPSERT` e Cloud `entry[].changes[].value.messages` são deduplicados em `inbox_events` e persistidos com tenant, contato, conversa e mensagem. Conversa inbound reabre como `open`.
- Ignora eventos Evolution originados pelo próprio número, grupos, broadcast e LID sem telefone resolvível. Texto/caption e algumas respostas interativas são extraídos; mídia sem texto fica sem anexos estruturados por enquanto.
- Identidade só associa a pessoa/lead/oportunidade quando encontrada no tenant. Número desconhecido pode criar Person sem inventar conta ou lead.
- Conversa nova inicia com automação `paused`, owner vazio; runtime da Sofia ainda não foi ligado ao 30Sales.
- Configuração e instruções de callback foram acrescentadas a `.env.example`, tela de canais e documentação. `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` são configurações do servidor.

## Próximo passo recomendado

Continuar o Inbox implementando callbacks de estado de envio/entrega/leitura/falha:

1. Consultar documentação oficial atual de Meta Cloud API e Evolution antes de codificar payloads/eventos.
2. Aceitar os callbacks dentro das rotas autenticadas existentes; Evolution deve passar a tratar também `MESSAGES_UPDATE` além de `MESSAGES_UPSERT`.
3. Mapear status externo para `messages.deliveryState`, correlacionando pela ID externa do provider e canal/tenant; deduplicar callbacks repetidos e proteger transições contra regressão (por exemplo, `read` não voltar para `sent`).
4. Tratar lote, evento incompleto, callback sem mensagem local, mensagem duplicada, falha de parsing e IDs desconhecidos sem cruzar tenant. Preservar assinatura/HMAC e segredo específico Evolution.
5. Expor o estado de envio/entrega na timeline do Inbox e documentar estados, limites e pendências.
6. Atualizar backlog, arquitetura técnica e este contexto. Usar Git Flow e integrar a feature em `develop` quando a implementação estiver completa.

Depois: anexos inbound, health check/cadastro de conexão, eventos/notificações para closer, worker/outbox/retry e reconciliação de timeout; por fim, integrar o runtime da Sofia para respeitar modo/ownership e suportar sugestão sem envio versus retomada explícita.

## Limites e forma de retomar

- O próximo passo acima é uma recomendação de continuidade, não prova de que o callback já foi implementado.
- Ao começar a próxima sessão, verificar `git status`, `git log`, ler este documento, `AGENTS.md` e as seções pertinentes de `docs/arquitetura_tecnica.md` e `docs/sofia_produto/06_backlog_aceite_entrega.md`. O estado do repositório prevalece sobre este resumo se houve alterações posteriores.
- Não presumir que migrations foram aplicadas, integrações configuradas em produção ou callbacks recebidos só porque o código/documentação existem.
