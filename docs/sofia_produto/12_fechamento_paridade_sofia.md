# Fechamento de paridade funcional com a Sofia

Atualizado em 22/11/2026. Este documento define como fechar uma versão do 30Sales que substitua a operação atual da Sofia apoiada por n8n, Chatwoot e Twenty. “Paridade” significa cobrir os resultados de negócio e os caminhos de exceção usados pela equipe; não significa copiar as telas nem manter os mesmos executores.

## Decisão de arquitetura

- **30Sales** passa a ser a fonte da verdade para CRM, Inbox, campanhas, qualificação, tarefas, handoffs, oportunidades, auditoria e estado das automações.
- **n8n** é referência de comportamento legado para inventário e migração. Cada workflow ativo deve ser traduzido para comando/serviço/worker próprio do 30Sales ou ser explicitamente aposentado. Não manter n8n como executor paralelo de mensagens ou mutações CRM após o corte.
- **Chatwoot** é fonte de histórico a migrar. Conversas novas, ownership, mensagens e operação diária ficam no Inbox nativo do 30Sales. Não usar Chatwoot como runtime nem criar sync contínuo como requisito implícito.
- **Twenty** é fonte de CRM a migrar. Contas, pessoas, leads, oportunidades e atividades passam a ser mantidas no CRM do 30Sales. Sync bidirecional fica fora do fechamento inicial, salvo decisão explícita de coexistência com dono de campo e conflito definidos.
- **Evolution/WhatsApp Cloud API** continuam como transporte de mensagens; não são substitutos de CRM ou de automação de negócio.

## Matriz de cobertura e evidência pendente

| Área | Resultado que precisa continuar funcionando | Situação no código/documentos | Evidência necessária para fechar |
|---|---|---|---|
| CRM antes distribuído no Twenty | Contas, pessoas, leads, relações, oportunidades, tarefas, notas/atividades, campos comerciais e timeline rastreáveis | CRM e pipeline nativos existem. Importação atual é CSV normalizado, limitada a leads novos; candidatos podem ser ligados manualmente, e fatos de qualificação podem ser acrescentados com confirmação explícita, dedupe e auditoria sem substituir fatos anteriores. Não há adapter Twenty nem migração completa de objetos/histórico | Export atual do tenant, contagens por objeto, mapa de cada campo/relação, prévia reconciliada e lote idempotente em staging |
| Atendimento no Chatwoot | Conversas e mensagens históricas localizáveis, com contato, canal, direção, data, status e referências externas | Inbox nativo cobre fila, ownership, mensagens, notas, tags, não lidas e resposta pelos providers. Identidade Chatwoot existe no modelo, mas a importação de conversas/mensagens/anexos ainda não está entregue | Export/API read-only aprovado, contagens e amostras por inbox/status, mapeamento de autores/assignees/anexos, reconciliação de mensagens e teste de continuidade no Inbox |
| Workflows n8n da Sofia | Cada disparo, regra, condição, efeito externo, exceção, retry e notificação legados deve ter destino explícito | Há fluxos nativos de runtime inbound, handoff, campanhas outbound, eventos, notificações e workers. Os exports atuais do n8n não estão presentes neste checkout; os documentos citam workflows A/G, B/F/D/H e C, mas não bastam para demonstrar cobertura ponta a ponta | Export versionado de todos os workflows ativos e inativos relevantes; matriz nó/efeito→comando 30Sales; replay/shadow sem efeitos; resultado aprovado por operação |
| Operação outbound | Preparar público, respeitar opt-out/linha/horário/quota, enviar uma vez, reconciliar entrega/resposta e encaminhar trabalho humano | Campanhas, múltiplos canais, reserva de quota, pausa/revisão, métricas de entrega/resposta/reunião/oportunidade/ganho e acesso ao Inbox estão implementados no código local segundo o backlog recente | Comparar cada fluxo de prospecção n8n com a campanha 30Sales, incluindo timeout ambíguo, duplicidade, resposta inbound e cancelamento |
| Qualificação e handoff | Preservar perguntas/respostas, evidências, lacunas, aceite/devolução, owner e próxima ação | Handoff, tarefas, central do closer e captura assistida de fatos existem no código. No modo humano, o Inbox permite consultar a Sofia sobre a conversa, obter resumo e rascunhar resposta; saídas ficam internas até revisão/envio humano. Histórico legado e conversões de status ainda precisam de regras por amostra real | Mapa de status sem conversão implícita, contagens reconciliadas, amostra de briefs/handoffs e validação das consultas e rascunhos com casos reais aprovados |
| Reuniões e agenda | Convite, horário/fuso, participantes, confirmação, cancelamento e resultado comercial | Atividades CRM existem; integração de agenda/convites e confirmação verificável continuam pendentes no backlog | Definir provedor/fluxo atual a partir do n8n e testar criação, atualização, cancelamento e sincronização com timezone |
| Falhas e controle operacional | Pausar, retomar, revisar, repetir com segurança, saber quem resolve e localizar divergência | Inbox, eventos e filas têm vários controles; a cobertura ainda não prova todos os jobs, integrações e fluxos legados, nem há baseline viva reconciliada | Runbook por processo, owner operacional, fila/retry/dead-letter observável e demonstração de rollback/cutover |

## Ordem para fechar a versão

### 1. Fixar a baseline legada

1. Obter exports aprovados dos workflows n8n e snapshots read-only de Twenty, Chatwoot e Postgres Sofia.
2. Registrar versão/data/hash, contagens e relações sem guardar conteúdo sensível desnecessário.
3. Para cada workflow, registrar gatilho, entradas, filtros, credenciais/serviços usados, ações e efeitos, política de retry, condição de parada e destinatário humano.
4. Para cada objeto do CRM/Inbox, registrar ID externo, tenant/linha de destino, campos, relações, timestamps, anexos, retenção e política de colisão.
5. Resolver divergências entre export, runtime e conhecimento da operação antes de declarar um comportamento como requisito.

### 2. Fechar migração de dados antes de desligar as fontes

1. Estender importação para os objetos necessários com adapters/formatos versionados, prévia, resolução humana de candidatos e idempotência por identidade externa.
2. Migrar primeiro dados CRM do Twenty; depois conversas e mensagens históricas do Chatwoot; por fim estados e relações que só existem no Postgres Sofia.
3. Preservar IDs externos, proveniência, estado original e timestamps. Status sem mapeamento validado ficam para revisão; não converter automaticamente `handoff`, `ganho` ou `perdido` em estado comercial diferente.
4. Migrar anexos somente com política de acesso, retenção e armazenamento privado definida.
5. Reconciliar contagens e amostras por tenant/linha antes e depois de cada lote. Reimportação não pode duplicar ou sobrescrever fato confirmado.

### 3. Demonstrar paridade de workflows

1. Transformar cada workflow legado em cenário observável de entrada, estado anterior, ação esperada e estado/efeito final.
2. Associar o cenário a um command, service ou worker 30Sales; regras determinísticas ficam fora do prompt.
3. Rodar em modo shadow/replay sem envio externo e comparar decisões/roteamento com amostras aprovadas.
4. Para efeitos externos, validar idempotência, opt-out, ownership humano, pausas, horário, quota, timeout ambíguo e falha permanente.
5. Desativar cada executor legado só depois do canary correspondente, reconciliação sem divergências não explicadas e rollback documentado.

### 4. Aceite de release

A versão só pode ser declarada equivalente quando:

- 100% dos workflows ativos observados têm destino no 30Sales ou decisão registrada de aposentadoria, aprovada pelo responsável do processo.
- Contagens e amostras dos objetos incluídos na migração reconciliam; conflitos e itens excluídos têm lista e motivo.
- BDR/SDR/closer conseguem operar CRM, Inbox, campanhas, handoffs, tarefas e reuniões sem voltar às telas de execução legadas.
- Repetição de webhook/import/job não duplica mensagem, fato, tarefa, oportunidade ou notificação.
- Pausa, opt-out e ownership humano bloqueiam efeitos automáticos antes do provider; falhas ambíguas vão para reconciliação/revisão.
- Todo processo migrado tem monitoramento, responsável operacional e instrução de pausa/retomada.
- Migrations necessárias foram aplicadas no ambiente alvo por plano aprovado, CI/build e gates do projeto passaram, e o smoke test autenticado usou dados de teste.

## Primeiro corte de implementação

O primeiro corte após obter os exports é criar a matriz executável de paridade do n8n e ordenar os fluxos por risco/uso. Sem os exports atuais, implementar um adapter ou declarar A/G, B/F/D/H ou C como cobertos pode codificar uma versão antiga ou incompleta do processo. A escrita e resolução operacional da importação permanecem adiadas nesta versão.

## Limites desta fotografia

- Esta matriz é derivada do checkout e da documentação local em 22/11/2026; não confirma serviços, dados, versões nem workflows ativos em produção.
- A busca neste checkout não encontrou os exports n8n mencionados no mapeamento legado. A equipe precisa fornecer ou versionar uma exportação aprovada para fechar essa lacuna.
- Migrations recentes estão geradas e não aplicadas; a prontidão depende do journal e estado do ambiente de release.
- “Funcionalidade equivalente” não autoriza copiar dados reais para dev nem executar envios/mutações nas plataformas legadas.
