# 30Sales

Plataforma comercial para equipes BDR, SDR e closer. O 30Sales reúne prospecção, atendimento de leads, pipeline e acompanhamento da operação em workspaces isolados por empresa. Sofia é a assistente de IA configurável para apoiar qualificação e conversas.

O produto está em evolução. As áreas abaixo descrevem domínios presentes no código; o nível de integração e prontidão pode variar. Para decisões e escopo funcional, consulte a [documentação de produto](docs/sofia_produto/README.md).

## O que há no produto

- **Prospecção:** leads e contas, filtros e atribuição, tarefas, campanhas outbound e revisão da fila de envios.
- **Atendimento:** Inbox de WhatsApp, notas e etiquetas, ownership humano, passagens para closer, anexos e eventos de conversa.
- **Vendas:** pipeline por linha de negócio, oportunidades, atividades, próxima ação e relatórios de funil.
- **Configuração:** equipe e permissões, linhas de negócio, assistente, canais WhatsApp, etapas de pipeline e configuração operacional.
- **Administração da plataforma:** provisionamento de empresas e configuração de integrações compartilhadas.

Os canais podem integrar Evolution API ou WhatsApp Business Cloud API. A arquitetura do produto mantém o Inbox sob responsabilidade do 30Sales; Chatwoot é considerado apenas para dados históricos/importação, não como runtime.

## Arquitetura

Este é um monorepo com aplicações implantáveis separadamente:

- [`30sales-front`](30sales-front/README.md): SPA em Vite, React e TypeScript.
- [`30sales-back`](30sales-back/README.md): API e workers NestJS em TypeScript.
- `30sales-back/drizzle`: schema e migrations PostgreSQL/Drizzle.
- [`docs`](docs/README.md): arquitetura, especificações, decisões e operação.
- [`gitops`](gitops): configuração Argo CD deste repositório.

```text
Browser → Vite/NGINX frontend → /api → NestJS
                                      ├─ PostgreSQL (Drizzle)
                                      ├─ Redis (sessões em produção)
                                      └─ APIs externas (WhatsApp, IA, e-mail, mídia)
```

O frontend chama a API pelo client centralizado em `30sales-front/src/lib/api/client.ts`. No desenvolvimento, o Vite encaminha `/api` para `http://localhost:3000` por padrão. Em produção, frontend e API compartilham a origem; o proxy encaminha `/api` ao backend.

### Isolamento por empresa

Uma organização representa o workspace de uma empresa. Usuários globais podem participar de organizações diferentes por meio de memberships. O backend deriva a organização e as permissões da sessão validada; valores enviados pelo cliente não autorizam acesso. Repositórios consultam dados tenant-owned com escopo de organização e o banco reforça relações com constraints compostas onde aplicável.

Linhas de negócio organizam operações de produtos ou serviços dentro da empresa. Equipe, canais, configuração da assistente, campanhas e dados comerciais são associados à linha conforme o domínio. A autorização continua sendo validada no servidor.

## Requisitos locais

- Node.js 24 (mesma versão da imagem de build).
- npm.
- PostgreSQL disponível para a API.
- Redis é opcional no desenvolvimento e obrigatório em produção.

## Executar localmente

### 1. Preparar a API

```bash
cd 30sales-back
npm ci
cp .env.example .env
```

Edite `30sales-back/.env`. Para começar, configure `DATABASE_URL` com um banco local e defina `BETTER_AUTH_SECRET` com pelo menos 32 caracteres. O arquivo `.env.example` lista também as integrações opcionais e seus parâmetros.

Aplique as migrations somente ao banco local de desenvolvimento:

```bash
npm run db:migrate
```

Inicie a API:

```bash
npm run start:dev
```

A API fica em `http://localhost:3000`; o endpoint de health check é `GET /health`.

### 2. Preparar a interface

Em outro terminal, na raiz do repositório:

```bash
cd 30sales-front
npm ci
npm run dev
```

Abra o endereço local informado pelo Vite, normalmente `http://localhost:5173`. O proxy `/api` aponta para `http://localhost:3000`. Para outra origem de API durante o desenvolvimento, defina `VITE_API_PROXY_TARGET` antes de iniciar o Vite.

### Configurações de integração

A aplicação inicia sem a maioria dos serviços externos, mas as funções correspondentes ficam indisponíveis até serem configuradas. Em especial:

- Convites e recuperação de acesso precisam de SMTP configurado.
- Credenciais de canais exigem `CHANNEL_CREDENTIALS_ENCRYPTION_KEY`, uma chave base64 de exatamente 32 bytes. Gere uma chave com `openssl rand -base64 32` e guarde-a num gestor de segredos. Em produção, a variável é obrigatória; não a troque sem planejar a recriptografia das credenciais existentes.
- Sessões Better Auth usam Redis em produção (`REDIS_URL`).
- Recursos de IA, transcrição de áudio, anexos e WhatsApp dependem das respectivas chaves e configurações externas.

Não use credenciais ou dados de produção no ambiente local. Nunca versionamos arquivos `.env` ou segredos.

## Comandos úteis

| Aplicação | Comando | Uso |
| --- | --- | --- |
| Frontend | `npm run build` | TypeScript e build de produção Vite |
| Frontend | `npm run lint` | Oxlint |
| Backend | `npm run build` | Build NestJS |
| Backend | `npm test` | Testes unitários Jest |
| Backend | `npm run test:e2e` | Testes end-to-end; requer ambiente de teste configurado |
| Backend | `npm run test:business-lines` | Teste de isolamento de linhas; requer `BUSINESS_LINES_TEST_DATABASE_URL` |
| Backend | `npm run db:generate` | Gerar migrations Drizzle a partir do schema |
| Backend | `npm run db:migrate` | Aplicar migrations no banco apontado pela configuração local |

Execute os comandos dentro da pasta da aplicação correspondente. O frontend ainda não declara um script de testes automatizados no `package.json`.

## Build e publicação

Cada aplicação tem Dockerfile e workflow próprios em `.github/workflows/`. Os workflows constroem imagens separadas para frontend e backend; a configuração de Argo CD fica no repositório GitOps. Consulte [imagens de contêiner e atualização GitOps](docs/container-images.md) antes de alterar o processo de publicação. O backend aplica migrations pendentes antes de iniciar em produção.

## Documentação

- [Índice da documentação](docs/README.md)
- [Especificação funcional e backlog](docs/sofia_produto/README.md)
- [Arquitetura técnica e contratos da API](docs/arquitetura_tecnica.md)
- [Portfólio de linhas de negócio](docs/sofia_produto/11_portfolio_linhas_negocio.md)
- [Eventos e integrações de WhatsApp](docs/sofia_produto/08_eventos_integracoes_evolution_meta.md)
- [Imagens e GitOps](docs/container-images.md)
- [Padrões de engenharia](AGENTS.md)
