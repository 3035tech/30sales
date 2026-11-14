# 30Sales

30Sales é uma plataforma SaaS multi-tenant para operações comerciais de BDR, SDR e closer. Cada empresa cliente é uma organização isolada, com seus próprios usuários, dados, configurações, integrações e auditoria. Sofia é a assistente SDR virtual que opera dentro da plataforma.

## Projetos

- `30sales-front`: Vite + React + TypeScript + Tailwind CSS v4. Interface autenticada, acessível e localizada.
- `30sales-back`: NestJS + TypeScript. API de domínio, autorização, integrações e processamento.
- `docs/sofia_produto`: especificação funcional, telas, campos, modelo de dados, estados, integrações e backlog.

## Regra arquitetural principal

Toda operação de produto acontece no contexto de um tenant resolvido pelo backend a partir da sessão autenticada e da associação usuário-organização. Um `organizationId` enviado pelo navegador, modelo de IA, webhook ou job nunca é autoridade. Não existe consulta, cache, arquivo, mensagem, métrica ou execução de IA sem escopo de tenant.

## Instruções para agentes e engenharia

Leia [`AGENTS.md`](AGENTS.md) antes de alterar o produto. O repositório segue Git Flow: `main`, `develop` e branches `feature/*`, `release/*` e `hotfix/*`. Consulte [`docs/arquitetura_tecnica.md`](docs/arquitetura_tecnica.md). Os diretórios `30sales-front` e `30sales-back` têm instruções complementares próprias. Os padrões foram adaptados do projeto 30studio para a arquitetura Vite + React + NestJS.

## Situação

**Fase 1 iniciada:** login por e-mail/senha, sessão Better Auth, seleção da organização ativa, schema inicial de identidade multi-tenant no PostgreSQL (`auth`) e shell inicial do workspace. O frontend e o backend compilam. Banco e e-mail ainda não foram conectados; a migration ainda não foi aplicada. Hospedagem inicial planejada no k3s de Dublin, sem deployment configurado ou executado. Próximos cortes: import read-only/reconciliação de conversas Chatwoot e writers/workers idempotentes sobre as tabelas base de eventos, jobs e auditoria. O Inbox visual está read-only e sem dados até a migração/importação.
