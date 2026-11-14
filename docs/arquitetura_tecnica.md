# Arquitetura técnica do 30Sales

## Repositório e fluxo Git

Frontend, backend, documentação e contratos pertencem ao monorepo `30sales`; os apps continuam deployáveis separadamente. Git Flow configurado com `main` como produção, `develop` para integração e prefixos `feature/`, `release/`, `hotfix/` e `support/`. `develop` é a branch atual de integração; não há remote configurado ainda.

## Frontend

React + Vite + TypeScript + Tailwind CSS v4. Toda chamada ao backend, incluindo Better Auth, sai de `30sales-front/src/lib/api/client.ts`. Features e componentes não fazem `fetch` nem instanciam o cliente Better Auth. O client centraliza origem da API, cookies, request ID, validação Zod de respostas e métodos por domínio. Labels e mensagens visíveis usam catálogos i18next para `pt-BR` e `en`, com seletor de idioma; identificadores e mensagens técnicas do código permanecem em inglês.

## Backend e transporte

NestJS + TypeScript organiza a feature por domínio. O controller só declara endpoints, parâmetros e DTOs HTTP, aplica os pipes de validação e delega ao service. Nenhuma regra comercial, autorização ou query pertence ao controller.

```text
API client → DTO HTTP → Zod pipe → Controller (delegação)
          → Service (autorização + regra + fluxo)
          → DTO de repository → Repository Drizzle tenant-scoped
          → DTO de saída → API client
```

DTOs explícitos são usados entre camadas. Schemas Zod validam body, query e IDs de rota. O service resolve a sessão, a organização ativa, membership e permissão no servidor antes de chamar o repository.

## Tenant e dados

Better Auth mantém identidades e memberships no schema PostgreSQL `auth`. Contas comerciais, pessoas, leads e histórico ficam em `public`, com `organization_id` obrigatório. Toda consulta filtra por tenant. FKs compostas de leads e histórico fazem o banco rejeitar relações entre empresas diferentes. O navegador nunca escolhe o tenant de uma query: o backend obtém o contexto pela sessão e membership ativa.

## API inicial

- `GET /api/v1/leads?status=&assignedToUserId=&limit=&offset=`: mantém a resposta array usada pelos leitores existentes. `GET /api/v1/leads/table?status=&source=&assignedToUserId=&search=&sortBy=&sortDirection=&limit=&offset=`: resposta paginada, server-side filtrável/ordenável e com total; inclui responsável, aceita `assignedToUserId=unassigned` e somente campos de ordenação allowlisted.
- `POST /api/v1/leads`: cria conta, pessoa, lead e estado inicial em uma transação. Exige empresa, contato e e-mail ou telefone; atribui o lead ao criador.
- `PATCH /api/v1/leads/:id/status`: valida transição no service e registra alteração atomicamente.
- `GET /api/v1/leads/assignees`: lista membros do tenant para a seleção de responsável; exige `leads.assign`.
- `PATCH /api/v1/leads/:id/assignee`: atribui ou remove o responsável, exige `leads.assign`, confirma membership no tenant e grava auditoria antes/depois com correlation ID.
- `GET /api/v1/leads/tasks?from=&to=&status=&limit=`: lista tarefas por intervalo e estado na organização ativa.
- `POST /api/v1/leads/:id/tasks`: cria tarefa com descrição e prazo, associada ao lead; atualiza `next_action_at` para o prazo aberto mais próximo.
- `PATCH /api/v1/leads/tasks/:taskId/complete`: registra resultado (`completed`, `contacted`, `no_response` ou `follow_up`) e nota. Quando há retorno, cria a tarefa seguinte na mesma transação e preserva responsável. A ausência de body antigo mantém compatibilidade usando `completed`; a tela atual exige escolha explícita.
- `GET /api/v1/handoffs?status=requested|accepted|returned`: lista os briefs e filas da organização ativa.
- `POST /api/v1/handoffs`: cria ou reutiliza a oportunidade do lead e solicita o handoff com evidência, fatos, lacunas e próxima ação.
- `PATCH /api/v1/handoffs/:id/accept`: closer/gestor aceita, vira owner da oportunidade e inicia a etapa de contato.
- `PATCH /api/v1/handoffs/:id/return`: closer/gestor devolve com motivo; lead volta à fila SDR e tarefa com prazo é atribuída a quem pediu a passagem.
- `GET /api/v1/opportunities?view=mine|all|unassigned|no_next_action|overdue|stale&stage=`: pipeline tenant-scoped com foco na carteira do usuário e filas de risco.
- `PATCH /api/v1/opportunities/:id/stage`: valida etapa, owner, campos de próxima ação, ganho/perda e histórico.
- `GET /api/v1/reports/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD`: resumo tenant-scoped com snapshot atual de oportunidades abertas, ações faltantes/vencidas e decisões fechadas no período; exige `reports.read`. Valores ganhos são agregados por moeda e taxa de ganho usa somente ganhos + perdas fechados no intervalo (datas UTC).
- `GET /api/v1/opportunities/:id/history`: histórico de mudanças com ator, etapa, data e nota.
- `GET /api/v1/session`: identidade, organizações acessíveis e tenant ativo.
- `GET /api/v1/conversations?status=&limit=&offset=`: lista tenant-scoped de conversas, ordenada pela atividade mais recente.
- `GET /api/v1/conversations/:id/messages?limit=&offset=`: histórico somente leitura; verifica conversa e mensagens no tenant ativo. Ambos exigem `inbox.read`.
- `GET /api/v1/audit-events?action=&entityType=&entityId=&from=&to=&limit=&offset=`: consulta paginada por tenant; exige `audit.read` (owner/admin/manager/operations). A resposta inclui o correlation ID para rastrear a requisição. Eventos principais de CRM são gravados atomicamente com lead/status, tarefa, handoff, etapa da oportunidade e criação de atividade, junto com o `x-request-id` recebido (quando válido; até 128 caracteres seguros). Hooks Better Auth registram criação, aceite e cancelamento de convites depois das mutações de auth; não são atômicos com as tabelas `auth`. Sign-in/sign-out, remoção/alteração de papel de membro e conectores ainda não geram eventos.
- `POST /api/v1/imports/identity-check`: prévia somente leitura, tenant-scoped, de até 500 pares de IDs (`provider`, `recordType`, `externalId`); exige `integrations.manage` (owner/admin/operations). Retorna `linked` com entidade canônica/ID ou `unmapped`. Não importa payload, cria vínculo ou altera dados. É um preflight para o futuro adapter de importação, não substitui o preview de campos/conflitos.
- `POST /api/v1/imports/reconciliation-preview`: prévia tenant-scoped, somente leitura, de até 100 registros normalizados; exige `integrations.manage`. Consulta vínculos externos existentes e candidatos por nome exato normalizado da conta, e-mail/telefone normalizados de pessoa/lead; oportunidade usa nome exato da conta. Retorna `already_linked`, `type_conflict`, `possible_match`, `ambiguous` ou `no_match`, candidatos e `sourceStatus` sem traduzi-lo. Não cria, atualiza, funde, vincula nem envia mensagens. Ainda não aceita payloads brutos dos conectores nem resolve ambiguidades.
- A tela **Importações** aceita CSV UTF-8 normalizado de até 100 linhas, deixa escolher Twenty, Chatwoot ou Postgres Sofia e apresenta status/candidatos; é somente leitura e usa o client centralizado. Não adapta exports brutos, grava o arquivo, aprova candidatos ou importa registros.

## Tabelas operacionais

O frontend usa o componente genérico `DataTable` controlado por props/callbacks; ele não importa nem conhece métodos HTTP ou domínios. A feature monta colunas e filtros tipados e usa o client centralizado. A listagem de leads aplica busca, status, origem, ordenação e paginação no backend, com whitelist de colunas, desempate estável por ID e total de resultados. Tamanho inicial 25; opções 10/25/50/100.

## Fila de tarefas

A tela Tarefas mostra vencidas, de hoje e dos próximos sete dias, usando o fuso local do navegador para definir os limites diários. Tarefas são sempre ligadas a um lead e possuem descrição, prazo, estado, criador, responsável opcional e timestamp de conclusão. A FK composta impede a associação a lead de outro tenant.

## Oportunidade e handoff

O BDR/SDR pode passar um lead respondido com motivo, evidência de interesse, fatos confirmados, lacunas e próxima ação datada. A operação cria ou reutiliza a oportunidade do lead e registra eventos de solicitação, aceite e devolução; leads retornados voltam a `responded` e recebem tarefa atribuída a quem solicitou a passagem. Aceite e devolução exigem `pipeline.update` e papel owner/admin/manager/closer. A migration `0004` é aditiva e mantém `tasks.assigned_to_user_id` nullable para compatibilidade com gravações da versão anterior; no deploy futuro, preencher responsáveis existentes e só depois avaliar torná-la obrigatória. Rollback de aplicação consiste em voltar o código e manter as novas tabelas/coluna aditivas; remover os objetos exige migração separada e confirmação de que nenhum dado novo precisa ser preservado. Nenhuma migration foi aplicada.

O Inbox de conversas existe em modo somente leitura; ainda não há importação Chatwoot, webhook, busca por mensagens, anexos ou resposta pelo produto. O envio continua no Chatwoot.

Limitação desta fatia: o modelo permite uma oportunidade por lead. Ainda faltam adapters e importação de conversas/mensagens, evidências ligadas às mensagens, catálogo de produtos, previsão configurável, agenda/reuniões e múltiplas oportunidades por lead; por isso, a migração ainda não substitui integralmente Twenty/Chatwoot.

## Pipeline CRM do closer

A tela apresenta a carteira do closer em colunas por etapa, valor potencial por moeda, próxima ação e idade da etapa. Vistas operacionais: minha carteira, todas, sem owner, sem próxima ação, ação vencida e paradas há mais de sete dias. Mudança de etapa segue a sequência definida em `opportunities.constants.ts` e grava `opportunity_stage_history`; ajustes sem trocar etapa também exigem nota e ficam no histórico. Toda etapa aberta exige ação e data; ganho exige valor, moeda e data real não futura; perda exige motivo. O backend restringe edição ao owner closer ou a owner/admin/manager, e aceita concorrência apenas quando a etapa de origem ainda corresponde ao estado enviado. O campo amount é potencial enquanto aberto e fechado real em `won`; totais são agrupados por moeda, sem conversão implícita. A migration `0005` só adiciona campos/tabela e não remove nem reescreve dados; rollback de app mantém o schema aditivo, e remoção posterior exige migração específica após retenção/export do histórico.

## Visão Hoje

A página inicial agrega em paralelo tarefas abertas vencidas/do dia e leads respondidos atribuídos ao usuário, handoffs solicitados compartilhados e oportunidades em risco da carteira individual. Leads respondidos sem responsável também aparecem para distribuição. Cada indicador leva à fila existente; o painel não executa mudanças. Consultas permanecem no tenant ativo; oportunidades usam `view=mine` com até 100 itens. Falha parcial preserva os demais indicadores. Recorte por equipe e paginação de riscos ainda não existem.

## Persistência e operação

Migrations Drizzle versionadas em `30sales-back/drizzle/`. A migration 0001 acrescenta tipos/tabelas/índices/constraints; 0002 mantém a evolução compatível do enum de status; 0003 acrescenta tarefas; 0004 oportunidades/handoffs; 0005 campos financeiros e histórico de etapa; 0006 atividades; 0007 conversas/mensagens; 0008 corrige exclusão referencial; 0009 ajusta a deduplicação por organização/conversa; 0010 adiciona tabelas base de inbox/outbox de eventos, jobs e auditoria; 0011 cria `external_records` para associar IDs de provedores e tipos de registro externos a contas, pessoas, leads e oportunidades; 0012 adiciona responsável nullable a leads e índice tenant/assignee/status. Todas permanecem sem aplicação em banco. As migrations são aditivas/corretivas; rollback da aplicação mantém schema/dados, e qualquer remoção exige migration separada após retenção/export. A tabela de auditoria já recebe os eventos de CRM descritos acima e tem endpoint de leitura; inbox/outbox e jobs ainda não têm consumidores/workers. `external_records` e endpoints de identidade/preview existem, mas ainda não há adapters de fonte ou importação persistente. Antes de ambiente partilhado, provisionar owner/tenant e aplicar migrations somente em ambiente aprovado.

A migration `0013_task_outcomes` adiciona resultado e nota nullable às tarefas; tarefas já concluídas permanecem intactas e sem resultado histórico inventado. O rollback de aplicação mantém as colunas aditivas. A projeção `leads.next_action_at` agora é limpa quando não há tarefas abertas.

## Referências de produto

- [Especificação detalhada](sofia_produto/README.md)
- [Modelo de dados](sofia_produto/03_modelo_de_dados.md)
- [Identidade visual](identidade_visual_30sales.md)
- [Padrões para agentes](../AGENTS.md)
