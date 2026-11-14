# Padrões de engenharia do 30Sales

Estas instruções se aplicam aos projetos frontend e backend. O 30Sales é SaaS multi-tenant desde o primeiro schema: uma organização/tenant representa a empresa cliente e pode ter muitos usuários; um usuário pode participar de mais de uma organização. Leia também `docs/sofia_produto/` para o domínio comercial.

## Arquitetura e tenant

- `30sales-front` (Vite + React) é cliente da API. `30sales-back` (NestJS) é a autoridade de domínio, acesso a dados, autorização, integrações e execução de comandos.
- PostgreSQL é a fonte da verdade; Drizzle ORM é o acesso tipado e a ferramenta de schema/migrations. Nenhum acesso a banco no frontend.
- Todas as tabelas de domínio tenant-owned têm `organization_id NOT NULL` ou alcançam uma relação pai que o contém e cuja integridade é garantida. Toda relação filha precisa impedir referências cruzadas entre tenants.
- Toda requisição/command resolve `{userId, organizationId, membership, permissions}` pela sessão validada e associação ativa. Revalidar membership/permission no backend para cada operação. IDs, tenant, papel, owner, aprovação ou status enviados pelo cliente/modelo/job/webhook não concedem autoridade.
- Nenhuma leitura/mutação busca recurso tenant-owned apenas por ID. Toda query inclui escopo de tenant no repository/service. Unique keys, idempotency, busca, exportação, jobs e analytics incluem tenant.
- Workers recebem IDs como dica de roteamento; recarregam dados e revalidam tenant, membership, permissão, estado e opt-out antes do efeito externo.
- Sessões/cache/storage/logs/métricas/IA/filas carregam tenant scope. Nunca misturar contexto entre organizações. External IDs são aliases, não primary keys internas.
- Começar com isolamento lógico rigoroso no mesmo PostgreSQL. Avaliar RLS como defesa adicional, sem substituir escopo no código. Não criar banco por cliente sem decisão baseada em requisito.
- Usuários são identidades globais; memberships são por organização. Papéis propostos: owner, admin, manager, bdr, sdr, closer, operations, analyst. Autorizar no servidor, não por botão escondido.

## Padrões de código

- Código-fonte técnico em inglês: nomes de variáveis, funções, classes, DTOs, enums, arquivos, comentários e mensagens técnicas. Texto visível ao usuário fica em catálogos i18n separados (`pt-BR`, `en`), nunca hardcoded em componentes/serviços.
- TypeScript strict; tipos de domínio explícitos; sem `any`, casts não verificados ou JSON solto para estados de negócio. Constantes/enums centralizados para estados, permissões, canais, limites e erros.
- Módulos coesos por domínio. Separar controller/transport, application/domain service, repository e adapter externo quando houver responsabilidade real; evitar abstração sem necessidade concreta.
- Controllers Nest contêm somente a assinatura/metadata dos endpoints e delegam ao service. Não conter regra comercial, autorização, transformação de domínio ou query.
- Usar DTOs nomeados e tipados em cada fronteira entre camadas (HTTP→service, service→repository, retorno service→HTTP). Controllers recebem/retornam DTOs e apenas delegam; validação de entrada ocorre em pipes Zod compatíveis com os DTOs.
- Validar input não confiável na borda com schemas Zod. Preferir contratos compartilhados ou OpenAPI versionado. Retornar erro tipado e estável, sem stack/segredo.
- PostgreSQL + Drizzle: schema tipado, relações/índices/unique constraints pelo ORM e migrations geradas/versionadas. Não escrever SQL manual na aplicação, testes, scripts ou migrations. Acesso DB somente em repositories/data modules tipados.
- Transações para invariantes de negócio, concorrência, dedupe, idempotência e outbox. Não marcar envio concluído sem confirmação do provider definida pelo adapter.
- Integrações (Evolution, Chatwoot, Twenty, Anthropic, STT, calendário) ficam atrás de adapters tipados com timeout, payload limitado, retry limitado, circuit breaker quando apropriado, tratamento de timeout ambíguo e redaction. Não expor credenciais ao browser/modelo/log.
- Estado comercial separado de status técnico de job e status de transporte. Transições são commands validados por state machine/tabela de regras, com ator, motivo, tenant e histórico.
- Ações externas têm autorização de servidor, audit event, idempotency key e estado explícito de falha. Retries não duplicam mensagens, oportunidades ou tarefas.
- Segredos em secret manager/env; `.env.example` contém apenas nomes/valores fictícios. Nunca commitar tokens, dumps de produção ou dados pessoais reais.

## Banco, processamento e escala

- PostgreSQL é fonte da verdade. Índices tenant-first para os caminhos de consulta. Paginar listagens e limitar tamanho de request/resposta.
- Começar com monólito modular + API Nest + worker no mesmo repositório/backend quando necessário. Jobs duráveis usam outbox/inbox e idempotência; Redis/BullMQ só após selecionar e justificar transporte de fila. Não criar microserviços cedo.
- Jobs longos (campanhas, IA, sincronização, alertas, transcrição) não bloqueiam requests de usuário. Backoff limitado, dead-letter/revisão, correlation ID e owner operacional.
- Não usar n8n, Chatwoot ou Twenty como fonte da verdade final; durante migração, são conectores com mapeamento, direção de sync e política de conflito explícitos. Evolution é provider WhatsApp.

## Segurança e confiabilidade

- Fail closed: sem sessão/configuração válida/tenant/permissão, não executar. Verificar tenant e membership de novo antes de operações sensíveis.
- CORS allowlist; preferir frontend e API sob a mesma origem via reverse proxy. Cookies `HttpOnly`, `Secure`, `SameSite` quando autenticação baseada em cookie; proteger mutações contra CSRF. Nunca guardar segredo/token de serviço no bundle frontend.
- Uploads, URLs externas e callbacks são input não confiável. Prevenir SSRF, redirects inseguros, resposta sem limite, arquivos perigosos, prompt injection e retry storm.
- Opt-out, pausa de campanha/canal/chip, ownership humano e limites têm bloqueio determinístico imediatamente antes do envio.
- Log não contém token, conteúdo integral sensível, áudio, signed URL ou credencial. Auditar acesso/exportação de dados sensíveis. Definir retenção e expurgo por categoria.
- Cada serviço tem health/readiness separadas. Erros externos não alteram falsamente estado comercial.

## Frontend, design e localização

- Interface pt-BR e en desde a primeira funcionalidade. Usar catálogo i18n; strings, erros e validações de usuário não ficam hardcoded em componentes/serviços.
- Reutilizar design tokens e componentes acessíveis. Usar Radix primitives embrulhadas em componentes próprios e Lucide para ícones quando necessário. Não espalhar controles não estilizados nem duplicar componentes.
- Acessibilidade por teclado, foco visível, labels, contraste, leitores de tela, responsividade e `prefers-reduced-motion`. Implementar carregamento, vazio, erro, sucesso e dado desatualizado.
- Toda requisição HTTP do frontend, incluindo autenticação Better Auth, passa pelo único client `30sales-front/src/lib/api/client.ts`; componentes/features não usam `fetch`, `axios` ou `authClient` diretamente. O client centraliza credentials, erros, correlation ID, contratos e métodos por domínio.
- O frontend nunca calcula autorização como fonte da verdade. API é sempre revalidada; estado otimista não pode afirmar que ação externa foi concluída.
- Formatação de data/hora/moeda é locale-aware; timestamps persistidos em UTC com timezone explícito em compromissos.

## Dependências e decisões

- Antes de adicionar biblioteca, procurar uso existente no workspace e documentação oficial; avaliar manutenção, segurança, licença, compatibilidade e impacto de bundle/runtime. Pin de versões e lockfile versionado.
- O 30studio usa Next.js App Router, Drizzle, Better Auth, Zod, next-intl, Radix e Lucide. No 30Sales, preservar os padrões de domínio, tenant, segurança, validação, persistência e UI; adaptar integrações de framework: Vite/React Router/i18next no front e módulos Nest no back.
- Validar especificamente autenticação multi-tenant compatível com SPA + Nest antes de escolher Better Auth ou alternativa. Não copiar integração Next.js do 30studio.
- Preferir documentação oficial/primária para decisões técnicas e registrar tradeoffs relevantes.

## Entrega

- Antes de cada slice, definir resultado observável, tenant boundary e comportamento de falha. Implementar pequeno fluxo vertical completo.
- Não publicar/deployar nem enviar mensagens reais sem autorização explícita e plano aprovado. Não usar dados de produção em dev.
- Ao receber pedido explícito de testes/verificação, rodar checagens relevantes e relatar evidência/limitações.
