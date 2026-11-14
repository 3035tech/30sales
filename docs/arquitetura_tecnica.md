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

- `GET /api/v1/leads?status=&limit=&offset=`: fila paginada e filtrável, isolada por organização.
- `POST /api/v1/leads`: cria conta, pessoa, lead e estado inicial em uma transação. Exige empresa, contato e e-mail ou telefone.
- `PATCH /api/v1/leads/:id/status`: valida transição no service e registra alteração atomicamente.
- `GET /api/v1/leads/tasks?from=&to=&status=&limit=`: lista tarefas por intervalo e estado na organização ativa.
- `POST /api/v1/leads/:id/tasks`: cria tarefa com descrição e prazo, associada ao lead; atualiza `next_action_at` para o prazo aberto mais próximo.
- `PATCH /api/v1/leads/tasks/:taskId/complete`: conclui uma tarefa aberta e recalcula a próxima ação do lead na mesma transação.
- `GET /api/v1/handoffs?status=requested|accepted|returned`: lista os briefs e filas da organização ativa.
- `POST /api/v1/handoffs`: cria ou reutiliza a oportunidade do lead e solicita o handoff com evidência, fatos, lacunas e próxima ação.
- `PATCH /api/v1/handoffs/:id/accept`: closer/gestor aceita, vira owner da oportunidade e inicia a etapa de contato.
- `PATCH /api/v1/handoffs/:id/return`: closer/gestor devolve com motivo; lead volta à fila SDR e tarefa com prazo é atribuída a quem pediu a passagem.
- `GET /api/v1/session`: identidade, organizações acessíveis e tenant ativo.

## Fila de tarefas

A tela Tarefas mostra vencidas, de hoje e dos próximos sete dias, usando o fuso local do navegador para definir os limites diários. Tarefas são sempre ligadas a um lead e possuem descrição, prazo, estado, criador, responsável opcional e timestamp de conclusão. A FK composta impede a associação a lead de outro tenant.

## Oportunidade e handoff

O BDR/SDR pode passar um lead respondido com motivo, evidência de interesse, fatos confirmados, lacunas e próxima ação datada. A operação cria ou reutiliza a oportunidade do lead e registra eventos de solicitação, aceite e devolução; leads retornados voltam a `responded` e recebem tarefa atribuída a quem solicitou a passagem. Aceite e devolução exigem `pipeline.update` e papel owner/admin/manager/closer. A migration `0004` é aditiva e mantém `tasks.assigned_to_user_id` nullable para compatibilidade com gravações da versão anterior; no deploy futuro, preencher responsáveis existentes e só depois avaliar torná-la obrigatória. Rollback de aplicação consiste em voltar o código e manter as novas tabelas/coluna aditivas; remover os objetos exige migração separada e confirmação de que nenhum dado novo precisa ser preservado. Nenhuma migration foi aplicada.

Limitação desta fatia: o modelo permite uma oportunidade por lead. Pipeline completo, transições de etapa, valor, motivo de perda e várias oportunidades do mesmo lead ainda precisam ser implementados antes de usar como CRM de fechamento.

## Persistência e operação

Migrations Drizzle versionadas em `30sales-back/drizzle/`. A migration 0001 acrescenta tipos/tabelas/índices/constraints; 0002 substitui o enum de status pela máquina BDR documentada; 0003 acrescenta a fila de tarefas; 0004 acrescenta oportunidades, handoffs, histórico de transições e responsável opcional da tarefa. Essas migrations ainda não foram aplicadas; 0002 existe para manter compatibilidade com a definição 0001 durante a implementação. Depois da primeira implantação, qualquer mudança de enum exige estratégia de expansão e migração compatível com os status persistidos. Nenhuma migration foi aplicada em banco. Antes de ambiente partilhado, provisionar owner/tenant com fluxo administrativo seguro, configurar PostgreSQL e SMTP, aplicar migration e exercitar os fluxos com contas de teste isoladas.

## Referências de produto

- [Especificação detalhada](sofia_produto/README.md)
- [Modelo de dados](sofia_produto/03_modelo_de_dados.md)
- [Identidade visual](identidade_visual_30sales.md)
- [Padrões para agentes](../AGENTS.md)
