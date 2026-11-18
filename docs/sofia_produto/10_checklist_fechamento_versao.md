# Checklist para fechamento da próxima versão

Atualizado em 18/11/2026. Esta checklist acompanha o backlog funcional em [`06_backlog_aceite_entrega.md`](06_backlog_aceite_entrega.md) e registra evidências necessárias para declarar uma versão pronta.

## Estado atual

- Branch atual: `main`.
- Commit `b162c70` está em `origin/main`; a árvore estava limpa após o push. A correção de CI descrita abaixo está local e ainda não foi commitada.
- A migration Drizzle `0056_minor_exodus.sql` está versionada e ainda não foi aplicada.
- A máscara internacional de telefone está versionada, mas ainda não passou por build bem-sucedido nem inspeção no navegador.
- Um log anterior do backend informou que o runtime da assistente estava desativado por falta de `ANTHROPIC_API_KEY`. Confirmar a configuração atual antes de aceitar o chatbot inbound.
- O `npm install` da biblioteca de telefone reportou cinco vulnerabilidades altas na árvore de dependências. Identificar os pacotes e impacto antes do release; não aplicar correções automáticas sem revisar.
- GitHub Actions do commit `b162c70` falharam nos builds/publicações de frontend e backend. O frontend falhou por apóstrofo ASCII não escapado na tradução inglesa de `channels.policyDescription`; já corrigido localmente. O backend falhou porque `campaigns.service.ts` usava `CampaignStatusChangeRepositoryDto` sem importá-lo; import adicionado localmente.

## 1. Escopo e revisão do código

- [ ] Revisar o diff completo e definir o conjunto exato que entra na versão.
- [ ] Confirmar contratos frontend/backend, isolamento por organização, autorização e auditoria nos fluxos alterados.
- [ ] Confirmar máscara internacional em números brasileiros e de outros países; validar colagem, edição no meio do número e valor E.164 enviado à API.
- [ ] Atualizar o registro de continuidade com o escopo final e as limitações conhecidas.

### Revisão feita nesta rodada

- Revisão estática parcial confirmou que o endpoint de notificações e o sino no shell já existem, com atualização periódica de 30 segundos e toast para novos alertas.
- Corrigido `webhooks.repository.ts`: mensagem inbound sem responsável elegível agora também notifica membros com papéis de atendimento, sem restringir o fallback a canais outbound. A consulta permanece limitada à organização e a inserção idempotente por destinatário.
- Ainda falta validar visualmente o sino/toast e comprovar comportamento com usuário atribuído, sem atribuição e sem membro elegível.
- A validação da máscara internacional e a revisão completa do diff continuam pendentes.
- Corrigida a string `campaign's` para `campaign’s`, causa confirmada do erro de parse no build do frontend do commit `b162c70`.
- A configuração Evolution agora assina `MESSAGES_EDITED`, `SEND_MESSAGE_UPDATE` e `NEW_TOKEN`, eventos que o receiver já registrava quando recebidos manualmente; validar compatibilidade no próximo build e na Evolution usada pelo ambiente.

## 2. Critérios funcionais inbound/outbound

- [ ] Inbound/hybrid: validar assistente nos modos sempre, dentro do expediente, fora do expediente e desativada.
- [ ] Outbound: validar que a janela limita somente a primeira abordagem; respostas recebidas reabrem a conversa e podem receber resposta humana em qualquer horário.
- [ ] Outbound: confirmar que a assistente automática não responde e que a conversa inicia pausada; hybrid mantém a automação inbound configurada.
- [ ] Campanhas: validar janela do canal e da campanha, fuso, virada da meia-noite, quota, opt-out, pausa e retomada sem envio fora das condições.
- [ ] Notificações: validar responsável de conversa/lead/oportunidade, fallback para equipe elegível sem responsável e idempotência sem duplicatas.
- [ ] Inbox: validar assumir, atribuir, devolver e responder manualmente, inclusive em conversas outbound durante fins de semana.
- [ ] Testar fluxo Evolution completo com número de teste: pareamento por QR, webhook inbound, resposta e atualização de estado. Não usar contatos de clientes.

## 3. Gates técnicos e de dados

- [ ] Executar build/typecheck e checagens automatizadas relevantes para frontend e backend.
- [ ] Revisar as cinco vulnerabilidades altas reportadas pelo npm e confirmar se alguma afeta dependências de produção.
- [ ] Revisar a migration `0056` contra o schema Drizzle e confirmar compatibilidade com banco existente e instalação nova.
- [ ] Aplicar migration somente após identificar o banco/ambiente correto e aprovar a janela de mudança; validar backup e resultado.
- [ ] Confirmar configuração operacional de Anthropic para chatbot inbound e de armazenamento de mídia caso anexos inbound façam parte do escopo.
- [ ] Confirmar SMTP e entrega de e-mail apenas se recuperação de senha/convites estiverem no escopo desta versão.

## 4. Publicação e operação

- [ ] Revisar e commitar somente o escopo aprovado; preservar alterações que ficarem fora da versão.
- [ ] Confirmar sucesso dos GitHub Actions do frontend e backend e registrar os SHAs/digests gerados.
- [ ] Confirmar que GitOps aponta para as imagens geradas pela versão e sincronizar pelo Argo CD.
- [ ] Verificar estado Healthy/Synced, pods prontos, health endpoint e carregamento do frontend.
- [ ] Fazer smoke test autenticado e repetir o fluxo de telefone/canais/inbox com dados de teste.
- [ ] Declarar a versão pronta apenas após todos os gates obrigatórios acima terem evidência registrada.

## Regras de execução

- Não enviar mensagens reais nem aplicar migrations em produção sem autorização explícita e plano aprovado.
- Não corrigir vulnerabilidades em massa; revisar cada atualização e seu impacto antes de alterar lockfiles.
- Enquanto houver mudança local sem build/CI e sem validação de ambiente, estado da versão permanece **não pronta para release**.
