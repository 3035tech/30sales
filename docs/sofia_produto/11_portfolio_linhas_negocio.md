# Portfólio e linhas de negócio no 30Sales

## Status registrado em 20/11/2026

Implementação iniciada em 18/11/2026. O código local cobre cadastro e equipes por linha, pipeline/etapas, configurações do Assistente com herança global, canais, campanhas, Leads, Inbox, handoffs, tarefas, notificações, relatórios e acesso de gestores por linha ou consolidado. Consultas e comandos principais validam linha ativa e membership; jobs revalidam o escopo antes de efeitos externos. As migrations aditivas 0059–0071 estão versionadas. O estado de aplicação em ambientes compartilhados ou de produção deve ser conferido no journal Drizzle correspondente. Em 19/11, os builds de produção do front e back passaram; a checagem Drizzle e o teste unitário existente passaram. As migrations também foram aplicadas duas vezes em um PostgreSQL descartável, e uma fixture confirmou o backfill de pipeline legado, linha padrão e membership.

Validação local atualizada em 20/11: build de produção front/back passaram; a suíte de isolamento em PostgreSQL descartável passou com 13 testes, incluindo transições cross-line, concorrência, rollback e reconciliação de métricas conhecidas por linha/empresa. Isso não substitui validação com dados reais conhecidos nem um ensaio de falha operacional no ambiente de lançamento. O endpoint de responsáveis retorna memberships ativos por linha, e o seletor do Pipeline filtra os closers pela linha da oportunidade; o backend também valida a atribuição. Conta e pessoa continuam identidades compartilhadas no tenant; a operação e visibilidade são limitadas pelos leads/conversas associados, e alterações de pessoa ligada a mais de uma linha são bloqueadas. O provisionamento da empresa é feito no console da plataforma por super admin, que convida o owner; ainda não há cadastro self-service nem wizard transacional de onboarding. A UX da conta vazia direciona o owner à configuração. A tela de linhas explica empresa → produto/serviço e mostra roteiro acionável para equipe, pipeline, Assistente, canal e leads; inbound pode começar com canal conectado e outbound também exige leads. ESLint do backend também permanece bloqueado por milhares de violações de formatação já espalhadas pelo repositório; não aplicar correção automática global sem uma fatia própria.

## Problema e objetivo

Uma empresa pode vender produtos ou serviços diferentes, cada um com público, processo comercial, equipe, canais e abordagem próprios. Por exemplo, a 3035 Group pode operar as linhas 30Grow, 30Pay, 30Sales e 30Studio.

O 30Sales deve permitir que a empresa configure e opere cada linha de forma independente, sem misturar leads, conversas, oportunidades, automações ou métricas. A gestão da empresa deve conseguir alternar para uma linha específica ou consultar uma visão consolidada do portfólio.

O resultado observável é: um administrador cria uma linha de negócio; configura nela seu pipeline, equipe e SDR; associa canais e campanhas; usuários operam apenas as linhas autorizadas; gestores consultam a performance por linha e no consolidado.

## Vocabulário e hierarquia

- **Plataforma 30Sales:** SaaS que oferece capacidades conforme plano/entitlements.
- **Empresa/organização (tenant):** cliente e limite de isolamento de segurança. Uma empresa tem usuários, memberships e pode operar várias linhas de negócio.
- **Linha de negócio:** unidade comercial configurável dentro de uma empresa, como 30Pay ou 30Grow. Organiza processos, dados comerciais e operação.
- **Produto/serviço vendido:** oferta da linha. Uma linha pode começar representando um produto/serviço; catálogo com várias ofertas por linha pode ser uma evolução separada.

No exemplo, 3035 Group é uma organização tenant e 30Grow, 30Pay, 30Sales e 30Studio são linhas de negócio. Eles não são tenants independentes e não são, por si só, módulos licenciados do SaaS. O entitlement controla quais capacidades a empresa contratou; a linha organiza o trabalho comercial que usa essas capacidades.

## Escopo funcional por linha

Cada linha pode ter sua própria configuração e operação:

- nome, identificador, descrição, status e responsáveis administrativos;
- pipeline próprio, etapas, ordem, regras de transição e campos obrigatórios;
- equipes e usuários autorizados, com papéis compatíveis com a linha;
- configuração do SDR/agente, prompt, instruções, versão publicada, modelo permitido e limites;
- canais WhatsApp associados, modo inbound/outbound/híbrido, horários e responsáveis;
- campanhas, públicos, cadências, quotas, origem e políticas de abordagem;
- leads, conversas, oportunidades, handoffs, tarefas e atividades associados à linha;
- relatórios, metas e métricas comerciais da linha.

Configurações e IDs de pipeline, etapa, agente, campanha e canal devem pertencer à mesma organização e linha, quando aplicável. Reutilização de configuração entre linhas deve ser uma ação explícita de copiar/publicar; alterar uma linha não altera outra.

## Dados e limites de isolamento

O tenant continua sendo a fronteira obrigatória de segurança. `business_line_id` adiciona um segundo escopo operacional dentro do tenant; nunca substitui `organization_id`.

- Toda entidade operacional que pertence a uma linha registra a linha explicitamente ou a herda de uma relação pai com integridade garantida.
- Relacionamentos filhos validam simultaneamente organização e linha. Uma oportunidade não pode apontar para lead, pipeline, etapa ou conversa de outra linha.
- Jobs, outbox/inbox, webhooks, métricas, exportações, idempotência e auditoria carregam o escopo da linha e continuam tenant-scoped.
- Um ID enviado pelo cliente não concede acesso à linha. O servidor valida membership, permissão e atribuição a cada operação.
- Usuários podem participar de várias linhas. Membership na organização não implica acesso automático a todas as linhas.
- Dados de contato/empresa podem representar uma identidade compartilhada, mas a operação de cada linha deve ser separada. Para permitir reutilização sem vazamento, usar vínculos explícitos tenant-scoped entre conta/pessoa e linha; cada linha vê apenas os dados compartilhados autorizados e seus próprios leads, conversas, oportunidades, notas, tarefas e histórico.
- Compartilhamento entre linhas deve ser explícito, auditável e mínimo. Uma busca ou relatório de uma linha não inclui dados de outra linha por coincidência de telefone, email ou nome.
- Integrações e canais são associados a uma linha por padrão. Compartilhar um canal entre linhas exige política explícita para roteamento, ownership, automação, limites, deduplicação e atribuição de resultados; não assumir esse compartilhamento implicitamente.

## Usuários, papéis e visibilidade

Manter identidades globais e memberships por organização. Acrescentar atribuição do membro a uma ou mais linhas e permissões de gestão compatíveis com os papéis atuais.

- **SDR/BDR/closer:** opera leads, conversas e oportunidades das linhas às quais foi atribuído.
- **Gestor de linha:** administra configurações e acompanha dados/performance das linhas delegadas.
- **Administrador da empresa/owner:** configura linhas e pessoas e pode consultar todas as linhas da organização conforme permissões.
- **Super admin da plataforma:** atua na administração da plataforma. Acesso a dados operacionais de clientes precisa seguir a política de suporte, auditoria e acesso temporário; `super_admin` não deve virar atalho para misturar dados no uso normal.

A interface esconde ações não permitidas para orientar o usuário, mas toda autorização é aplicada e revalidada no backend. O seletor de linha mostra apenas opções autorizadas. A opção “Todas as linhas” aparece apenas para quem tem permissão de visão consolidada.

## Navegação e fluxos principais

### Criar uma linha

1. Administrador informa nome, identificador, descrição e status.
2. Escolhe se inicia com configuração vazia ou copia um template/configuração existente.
3. Define equipe e usuários com acesso.
4. Configura pipeline e etapas.
5. Configura SDR/agente e publica uma versão inicial do prompt.
6. Associa canais e define modo, horários e responsáveis.
7. Cria ou associa campanhas e revisa a prontidão.
8. A linha só passa a operar quando os requisitos mínimos estiverem válidos; falhas são mostradas por etapa de configuração.

Cadastro deve ser guiado por etapas, salvamento explícito e estados de rascunho/ativo/pausado/arquivado. Pausar uma linha bloqueia novos envios e novas execuções automáticas, mas preserva leitura, histórico e reconciliação de jobs em andamento.

### Operar e trocar de linha

O seletor persistente de contexto permite escolher uma linha autorizada. O contexto escolhido filtra Inbox, Leads, Pipeline, campanhas, tarefas e relatórios. Toda tela indica claramente a linha ativa; mudanças de contexto não alteram atribuições nem dados.

### Ver performance

Gestores podem alternar entre:

- **Uma linha:** métricas, filtros, listas e detalhes daquela operação.
- **Portfólio consolidado:** comparação entre linhas e totais da empresa, sem perder a opção de abrir o detalhe de uma linha.

O consolidado não soma valores incompatíveis de moedas, períodos, definições ou coortes. Comparações mostram período, definição, denominador, fonte e atualização; itens sem permissão ou sem dados aparecem como indisponíveis, nunca como zero enganoso.

## Métricas e atribuição

Relatórios devem filtrar por `organization_id` e, quando aplicável, `business_line_id`. Indicadores iniciais por linha:

- leads criados e elegíveis;
- primeiras abordagens solicitadas, aceitas pelo provider, entregues e falhas/ambíguas;
- respostas e tempo até primeira resposta;
- handoffs solicitados/aceitos e tempo de aceite;
- oportunidades por etapa, ganhas/perdidas, valor e tempo de ciclo;
- atividades vencidas, próximas ações ausentes e carga por responsável;
- desempenho de agente/prompt por versão, com custo estimado separado do custo faturado;
- saúde dos canais e notificações operacionais.

O registro do evento preserva a linha vigente no momento da ocorrência. Reatribuir um lead ou oportunidade não reescreve o histórico. Relatórios devem declarar se usam linha atual ou linha histórica do evento. Não atribuir conversão a SDR, prompt ou canal sem eventos e definição de coorte suficientes.

### Contrato atualmente implementado no relatório de funil

- **Janela:** `from` e `to` são datas inclusivas. O backend converte cada limite para meia-noite UTC e consulta até meia-noite UTC do dia seguinte (`[from, to + 1 dia)`). Gráficos diários e coortes também usam UTC. Os indicadores com janela incluem criação de oportunidade/lead, fechamento, aceite de handoff, eventos e transições de coorte dentro do período.
- **Retratos atuais:** oportunidades abertas, carteira por etapa, idade na etapa, ações ausentes/vencidas, status atual de leads e valor do pipeline aberto refletem o estado no instante da consulta; não são limitados ao período selecionado. Valor aberto soma somente oportunidades abertas com valor e moeda e agrupa por etapa/moeda. O contador sem valor inclui registros sem valor **ou** sem moeda.
- **Fechamentos:** ganhos e perdas contam oportunidades terminais pela data real `closedAt` dentro da janela. Taxa de ganho é `ganhos / (ganhos + perdas)`; sem fechamentos, a taxa não é calculada. Valor ganho é agrupado por moeda e não convertido; registros sem moeda não entram em uma soma identificável. O relatório não combina BRL, USD, EUR etc.
- **Coortes:** cada linha é o dia UTC de criação do lead. Denominador é a quantidade de leads criados nessa data e escopo de linha. Numeradores são leads distintos com transição de status para `responded` ou `converted_to_sdr`, e leads distintos ligados a oportunidade criada até o fim do período. Taxas usam o tamanho total da coorte; coortes recentes são observadas por menos tempo e não representam conversão final.
- **Primeira atividade após handoff:** o denominador de tempo médio são somente handoffs aceitos no período que têm primeira atividade elegível registrada depois do aceite. O relatório separa aceitos, acompanhados e pendentes; pendentes não entram na média.
- **Escopo consolidado:** a query sem `businessLineId` agrega registros da organização. Comparação com uma linha é tenant-scoped; a fixture sintética validou que linhas da organização somam, enquanto uma quarta oportunidade de outro tenant (ganho de GBP 999) não aparece no consolidado.
- **Falhas de fonte:** o endpoint de funil executa suas consultas em lotes; qualquer consulta rejeitada faz o relatório inteiro falhar, sem devolver um consolidado parcial ou zeros substitutos. A tela mostra erro e, se houver resultado anterior para o mesmo escopo, o mantém visível como dado anterior. Uso de IA vem de endpoint separado: falha nele marca apenas o painel de IA como indisponível e mantém os demais indicadores carregados. Hoje não há campo de cobertura/atualização por fonte no DTO do relatório principal.
- O painel de IA é carregado em paralelo ao funil, informa explicitamente o período e separa carregamento, resultado sem registros e fonte indisponível. A resposta é vinculada à combinação linha + datas; não reaproveita valores de outro período como se fossem atuais.

### Reconciliação sintética executada em 20/11/2026

Janela de um dia UTC, com dados controlados em duas linhas da organização A e uma organização B:

| Escopo | Leads criados | Oportunidades criadas | Abertas agora | Ganhas no período | Perdas no período | Valor ganho |
|---|---:|---:|---:|---:|---:|---|
| Linha Alpha | 2 | 2 | 1 | 1 | 0 | USD 150.00 |
| Organização A (Alpha + Beta) | 3 | 3 | 1 | 2 | 0 | USD 150.00 + EUR 200.00 |

Para Alpha, a coorte conhecida teve denominador 2: 2 responderam (100%), 1 converteu para SDR (50%) e 2 receberam oportunidade (100%). Na visão da empresa, o denominador 3 produziu 2/3 respondidos (66,7%), 1/3 convertidos para SDR (33,3%) e 3/3 com oportunidade (100%). O total de moeda preservou USD e EUR em linhas distintas. A oportunidade da organização B não foi incluída. Teste `test:business-lines`, PostgreSQL descartável: 13/13 passaram, incluindo esta reconciliação.

## Modelo conceitual sugerido

Adicionar `business_lines` com `id`, `organization_id`, `name`, `slug`, `description`, `status`, timestamps e autoria. Garantir unicidade do identificador dentro da organização e FKs compostas tenant-scoped.

Adicionar vínculos de membros com linhas e papéis/escopos mínimos, por exemplo `business_line_memberships` ligado à membership da organização. A forma final deve reaproveitar o RBAC existente e evitar criar um permission builder genérico.

Para entidades operacionais, avaliar por tabela quais precisam de `business_line_id` direto e quais podem herdar com integridade: leads, campanhas, canais, conversas, oportunidades, pipelines/etapas, configurações e execuções de agente, atividades e eventos de auditoria. Chaves únicas, índices tenant-first, deduplicação, idempotência e consultas devem respeitar o escopo necessário.

Configurações versionadas de agente/prompt e pipeline guardam `business_line_id`, versão e estado de publicação. Jobs guardam o escopo de roteamento, mas recarregam a entidade e revalidam tenant, linha, membership, permissão, estado, canal, janela e opt-out imediatamente antes de efeitos externos.

O modelo final deve ser definido após inventário do schema e das consultas atuais. Este blueprint não autoriza adicionar `business_line_id` indiscriminadamente nem usar JSON como substituto de relações tipadas.

## Migração e compatibilidade

Implementar como migração aditiva e por etapas:

1. Inventariar tabelas, caminhos de leitura/escrita, jobs, eventos, índices, FKs e migrations ainda pendentes.
2. Criar linha padrão por organização e backfill dos registros existentes para essa linha; não inferir produto a partir de texto, canal ou nome sem evidência.
3. Adicionar relações/FKs e índices com compatibilidade temporária para dados legados, quando necessário.
4. Atualizar backend para gravar e consultar linha; durante a transição, derivar linha apenas onde a relação pai seja inequívoca.
5. Atualizar frontend com seletor, filtros, onboarding e visão consolidada.
6. Reconciliar contagens, relações, eventos e métricas por organização e linha.
7. Tornar a linha obrigatória nos caminhos definidos e remover compatibilidade antiga somente em migration posterior comprovada.

Rollback deve preservar linhas e atribuições. Não excluir nem mover dados automaticamente entre linhas. A migration não deve ser aplicada antes de confirmar o inventário, plano de backfill e verificação de integridade.

## Critérios de aceite

1. Owner/admin cria, edita, pausa e arquiva linhas de negócio dentro de uma organização.
2. Cada linha tem pipeline/etapas e configuração SDR/prompt versionados e independentes.
3. Membro pode ser autorizado para uma ou várias linhas; associação à empresa, isoladamente, não libera linhas restritas.
4. Leads, conversas, campanhas, oportunidades e atividades são consultados e alterados somente dentro da linha autorizada e da organização ativa.
5. Canal/campanha inbound ou outbound roteia para a linha configurada e não inicia automação de outra linha.
6. Trocar o seletor atualiza contexto e filtros de todas as áreas sem alterar ownership ou dados.
7. Usuário autorizado compara métricas por linha e consulta consolidado da empresa, com período/definição/denominadores explícitos.
8. Tentativas de cruzar linha ou tenant são negadas no backend e cobertas por verificações automatizadas no gate de qualidade.
9. Eventos, logs e auditoria mantêm escopo e histórico da linha; não incluem prompt, credenciais ou conteúdo sensível indevido.
10. Dados atuais são atribuídos a uma linha padrão de forma reconciliável; nenhuma linha existente perde registros durante rollout/rollback.

## Falhas esperadas

- Linha inexistente, arquivada ou fora do tenant: falha fechada com erro estável.
- Usuário sem membership/atribuição: negar leitura e escrita, mesmo que conheça o ID.
- Configuração/pipeline/canal de outra linha: rejeitar associação; não aplicar fallback silencioso.
- Linha pausada: bloquear novos efeitos externos e deixar estado/reconciliação visíveis.
- Consolidação parcial por permissão ou falha de fonte: identificar a cobertura incompleta; não apresentar total como completo.
- Backfill ambíguo: manter o item para revisão; não adivinhar a linha.

## Fases sugeridas do backlog

### Fase 0 — Discovery e decisões de domínio

- Inventariar schema, rotas, queries, workers e relatórios afetados.
- Decidir se conta/pessoa são identidade compartilhável com vínculos por linha ou se também serão duplicadas por linha; recomendação: identidade controlada compartilhada e jornadas operacionais separadas.
- Definir linha padrão, papéis, permissões consolidadas, política de super admin e compartilhamento de canal.
- Fechar contrato para estágio de configuração, pausa, arquivamento e cópia de templates.

### Fase 1 — Fundação e segurança

- Schema `business_lines`, memberships e constraints compostas.
- Backfill aditivo para linha padrão.
- Resolvedor de contexto da linha e autorização centralizada por operação.
- Atualizar APIs e comandos base com linha explícita; adicionar auditoria/correlation ID.

### Fase 2 — Configuração comercial isolada

- Pipeline/etapas independentes.
- Times e memberships por linha.
- Agentes, prompts e versões publicados por linha.
- Canais, horários e campanhas vinculados a linha; health/readiness por linha.

### Fase 3 — Operação vertical

- Seletor de linha e contexto persistente.
- Leads, Inbox, Pipeline, tarefas e handoffs filtrados e autorizados.
- Roteamento inbound/outbound pelo vínculo de canal/campanha.
- Pausa, idempotência e reconciliação de jobs mantendo escopo da linha.

### Fase 4 — Performance do portfólio

- Relatórios por linha e visão consolidada.
- Definições de métricas, coortes, snapshots históricos e moeda documentados.
- Comparativo de pipeline, equipe, campanhas, canais e agente/prompt.

### Fase 5 — Lançamento controlado

- Exercitar cross-tenant/cross-line, concorrência, rollback e backfill em ambiente não produtivo.
- Canary para uma organização/linha, reconciliar dados e monitorar falhas operacionais.
- Liberar gradualmente depois que isolamento, métricas e rollback forem demonstrados.

## Fora do escopo desta proposta

- Criar banco de dados separado por linha ou por produto.
- Transformar linhas de negócio em tenants ou memberships de organização independentes.
- Criar billing, marketplace, catálogo complexo de preços ou provisionamento automático de produto.
- Permitir compartilhamento implícito de dados/canais entre linhas.
- Usar o modelo de IA para selecionar tenant, linha ou conceder acesso.
- Reescrever toda a aplicação em microserviços.
