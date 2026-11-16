# Documentação do 30Sales

## Retomada de trabalho

- [Contexto de continuidade da sessão](CONTEXTO_SESSAO_30SALES.md): objetivo, decisões persistentes, estado atual do código e próximo passo recomendado.

## Produto

- [Especificação do produto](sofia_produto/README.md): visão, navegação, telas, campos, dados, estados, integrações, segurança, backlog e oportunidades de valor.
- [Análise da operação Sofia](analise_produto_unificado_sofia_20261114.md): fontes e fluxos que serão consolidados.
- [Especificação SDR, BDR e closer](especificacao_produto_sofia_sdr_bdr_closer_20261114.md).
- [Identidade visual](identidade_visual_30sales.md): conceito, paleta, tipografia e uso dos assets.

## Implementação atual

- [Arquitetura e fluxo de dados](arquitetura_tecnica.md): Git Flow, API client, DTOs, camadas Nest, isolamento de tenant, endpoints e migrations.
- [Imagens de contêiner](container-images.md): builds independentes do backend e frontend, tags GHCR e requisitos para o GitOps/Argo CD.

O produto começou como SaaS multi-tenant. Frontend Vite/React e backend NestJS estão separados. Login e identidade usam Better Auth + PostgreSQL/Drizzle; organizações têm papéis tipados, convites exigem verificação de e-mail e envio configurável por SMTP. O frontend contém shell, aceite de convite, gestão básica da equipe, fila de leads e assets oficiais da marca. Todas as chamadas passam por um client central.

### Limites desta etapa

- O banco local/Dublin ainda não foi conectado e nenhuma migration foi aplicada.
- Host, usuário e senha SMTP ainda precisam ser definidos em ambiente seguro.
- É necessário provisionar com segurança o primeiro owner/tenant antes do uso por clientes.
- A primeira API de leads já está criada com escopo obrigatório de tenant. Outros domínios comerciais ainda serão implementados.
- Não houve deploy.

## Ambiente de desenvolvimento

1. Copiar `30sales-back/.env.example` para um arquivo local ignorado pelo Git e configurar PostgreSQL, `BETTER_AUTH_SECRET` e SMTP.
2. Executar `npm run db:migrate` em `30sales-back`.
3. Iniciar `npm run start:dev` em `30sales-back` e `npm run dev` em `30sales-front`.
4. Criar/provisionar o primeiro owner por fluxo administrativo seguro antes de habilitar a operação.

O kit original está versionado em `30sales-front/public/brand-kit/`; consulte as instruções incluídas no kit antes de produzir materiais externos.
