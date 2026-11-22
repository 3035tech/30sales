# 30Sales backend

API e workers de domínio do 30Sales, implementados com NestJS, TypeScript, PostgreSQL e Drizzle ORM. O backend é a autoridade para autenticação, contexto da organização, permissões, regras comerciais, persistência e integrações externas.

## Executar localmente

```bash
npm ci
cp .env.example .env
```

Configure pelo menos `DATABASE_URL` e `BETTER_AUTH_SECRET` no `.env`. O segredo Better Auth precisa ter pelo menos 32 caracteres. Com PostgreSQL local disponível, aplique as migrations:

```bash
npm run db:migrate
npm run start:dev
```

A API escuta na porta `3000` por padrão e expõe `GET /health`. Não aplique migrations a bancos compartilhados ou de produção a partir do fluxo de desenvolvimento.

## Configuração

`.env.example` documenta as variáveis disponíveis. Redis é opcional no desenvolvimento e obrigatório em produção. Em produção também é necessária `CHANNEL_CREDENTIALS_ENCRYPTION_KEY`, codificada em base64 e representando exatamente 32 bytes. SMTP, chaves de IA, credenciais Meta e bucket S3 habilitam recursos específicos e podem ser opcionais conforme o fluxo utilizado.

Gere a chave de criptografia uma vez com `openssl rand -base64 32` e armazene-a em um gestor de segredos. Não a altere sem recriptografar as credenciais de canais já armazenadas.

## Comandos

```bash
npm run start:dev           # desenvolvimento com watch
npm run build               # build NestJS
npm test                    # testes unitários
npm run test:e2e            # testes end-to-end
npm run test:business-lines # isolamento entre organizações e linhas
npm run db:generate         # gerar migrations Drizzle
npm run db:migrate          # aplicar migrations no banco configurado
```

Os testes e2e precisam de ambiente de teste separado. `test:business-lines` requer `BUSINESS_LINES_TEST_DATABASE_URL`; use um banco descartável, nunca dados de produção.

## Organização

`src/` agrupa domínios como `auth`, `leads`, `business-lines`, `campaigns`, `inbox`, `channels`, `agents`, `opportunities`, `handoffs`, `reports` e `notifications`. Dentro dos módulos, controllers delegam aos services; regras e autorização ficam na camada de serviço, e acesso persistente passa por repositories tipados.

As migrations versionadas ficam em `drizzle/`. Em produção, o comando `start:prod` aplica migrations pendentes antes de iniciar a API. O endpoint `/health` indica que o processo está respondendo; a prontidão também depende de inicialização bem-sucedida de banco, Redis e migrations.

Veja o [README do projeto](../README.md), os [padrões do backend](AGENTS.md), a [arquitetura técnica](../docs/arquitetura_tecnica.md) e o [guia de imagens e GitOps](../docs/container-images.md).
