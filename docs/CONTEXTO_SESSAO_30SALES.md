# Contexto de continuidade — 30Sales

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
- Ignora eventos Evolution originados pelo próprio número, grupos, broadcast e LID sem telefone resolvível. Texto/caption e algumas respostas interativas são extraídos. Esta fatia adiciona anexos de imagem, vídeo, áudio, documento e figurinha, com payload de recuperação cifrado, download por adapter e blob fora do PostgreSQL.
- Identidade só associa a pessoa/lead/oportunidade quando encontrada no tenant. Número desconhecido pode criar Person sem inventar conta ou lead.
- Conversa nova inicia em `assistant` se o tenant habilitou o agente; sem configuração, inicia em `paused`. Ownership humano permanece separado da origem/número do canal.
- Configuração e instruções de callback foram acrescentadas a `.env.example`, tela de canais e documentação. `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` são configurações do servidor.

## Última fatia concluída: status outbound do WhatsApp

Meta Cloud API oficial documenta callbacks de estado no campo `value.statuses[]`, separado de `messages`; status pode chegar em eventos distintos (`sent`, `delivered`, `read`) e usa `statuses[].id` para correlação. Evolution documenta `MESSAGES_UPDATE`; os tipos atuais do projeto indicam estados `PENDING`, `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `ERROR` etc. Fontes primárias consultadas: [Meta messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) e [Evolution webhook configuration](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md).

Implementação integrada na `feature/inbox-delivery-status`: reconhecer ambos os eventos de status, mapear status para o enum existente (`sent`/`SERVER_ACK` → `accepted`; entrega → `delivered`; leitura → `read`; erro → `failed`), correlacionar por organização/provedor/canal/ID externo, deduplicar com ID determinístico e não regredir estado terminal/mais avançado. Nenhuma migration necessária. A UI já exibe `deliveryState` e já possui catálogos pt-BR/en para os estados.

Limitação tratada: callback sem mensagem local é ignorado, então a corrida rara em que o callback antecede a gravação do ID externo exige futura reconciliação com worker/outbox. Sem migrations aplicadas, deploy ou teste/build nesta sessão.

## Últimas fatias do Inbox

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

## Auditoria de desalinhamento dos controles — em correção

- O relato de desalinhamento após a padronização levou a uma revisão transversal da cascata CSS dos controles. A causa encontrada: seletores base `.ui-field-control.ui-text-field`, `.ui-field-control.ui-select` e `.ui-field-control.ui-textarea` tinham especificidade maior do que regras de tela como `.inbox-list-pagination select` e `.inbox-composer textarea`, impedindo alturas e espaçamentos compactos.
- Na branch `fix/ui-control-layout-cascade`, os seletores base foram reduzidos para `.ui-text-field`, `.ui-select` e `.ui-textarea`. Regras de layout de cada tela agora podem ajustar o componente sem perder os estilos compartilhados de identidade visual.
- Busca estática confirma que features e `App.tsx` não declaram controles nativos fora da camada compartilhada. `git diff --check` passou.
- Inspeção visual em navegador não foi possível nesta retomada: o host de acesso ao Chrome estava indisponível e Playwright não está instalado no workspace. Front e API locais estão rodando; portanto, ainda falta confirmar em runtime os alinhamentos em desktop/mobile e percorrer os fluxos após esta correção.
