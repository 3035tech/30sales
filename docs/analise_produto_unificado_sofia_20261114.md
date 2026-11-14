# Análise: Sofia como produto unificado

> Decisão atualizada em 14/11/2026: Chatwoot não será usado como backend nem executor do produto. Os trechos abaixo que propõem manter Chatwoot conectado descrevem alternativas consideradas antes desta decisão e estão supersedidos. O Inbox será nativo e o transporte será direto por Evolution API ou WhatsApp Business Cloud API.

> Especificação detalhada com telas, campos, dados, estados, integrações e critérios de aceite: [docs/sofia_produto](sofia_produto/README.md).

Data: 14/11/2026  
Escopo: inventário do repositório e proposta de produto/arquitetura. Não houve acesso ao estado vivo de produção nesta análise.

## Resumo executivo

A direção faz sentido. A Sofia já executa funções de SDR, automação de vendas, caixa de entrada, campanhas, CRM e monitoramento operacional, mas elas estão distribuídas entre n8n, Chatwoot, Twenty, PostgreSQL e Evolution. Essa separação aumenta o custo de mudança, cria fontes de verdade concorrentes e torna difícil entender de ponta a ponta por que uma mensagem, tarefa ou estado mudou.

Minha recomendação é construir **um produto operacional único para Sofia**, com módulos internos bem separados e integrações externas substituíveis. O produto conecta diretamente à Evolution API ou WhatsApp Business Cloud API. Chatwoot pode ser fonte histórica de importação, mas não fica conectado ao runtime. Twenty pode permanecer como conector CRM durante a migração.

“Um produto” não precisa significar um único processo ou uma aplicação monolítica sem filas. Recomendo um **monólito modular**, uma base transacional principal, workers assíncronos e uma API/web app. Isso mantém a operação simples sem acoplar os módulos de forma irreversível.

## O que a Sofia faz hoje

| Capacidade | Implementação atual identificada | Papel no produto unificado |
| --- | --- | --- |
| Conversa outbound e inbound | A e G: webhook Chatwoot, histórico, prompt, Claude, parse/guardas e envio pela API Chatwoot | Inbox/conversas, motor de políticas e adaptador de IA/canal |
| Captação cold | C: busca Twenty, seleção de empresa/telefone, validação, quota, ritmo, chip, contato/conversa e abertura | Campanhas e listas, consentimento/eligibilidade, cadência, limites por canal |
| Retornos combinados | B: varredura de follow-ups, janela/feriado, revalidação e envio | Agenda de tarefas e worker de automação |
| Silêncio/abandono | E: cutuca, Claude, regras de perda e sincronização CRM | Playbooks/cadências configuráveis e política de encerramento |
| Indicações e contatos passados | F e fluxo iniciado por A: fila, deduplicação, validação WhatsApp, Person no Twenty, abertura quente | Gestão de referências e novos contatos, com trilha de origem |
| Handoff e alertas | A e D: status, label, nota, monitor de resposta humana, alertas WhatsApp/e-mail | Inbox compartilhada, ownership, SLA e notificações |
| Registro comercial no CRM | H CRM: outbox de eventos, classificação, oportunidade, pessoa, nota e tarefa no Twenty | CRM próprio e integração externa por adaptador |
| Monitor de resposta humana | H monitor: busca conversas abertas, espera e alerta por sequência | Caixa de entrada, fila de atendimento e SLA |
| Saúde dos chips | `workflow_monitor_evolution_sofia`: consulta Evolution, pausa lógica por saúde e alerta | Administração de canais, saúde e circuit breaker |
| Áudio | A/G baixam anexos e usam Whisper; resposta permanece texto | Serviço de mídia/transcrição desacoplado |
| Conhecimento e comportamento | Prompt SQL outbound/inbound, regras embutidas em JS e documentos | Editor/versionamento de playbooks, políticas, conhecimento e avaliação |
| Configuração operacional | `sofia_config`, JSON de chips, inbox, quotas, feriados, prompts e flags | Console administrativo com configuração tipada, auditável e por organização |

## Mapa técnico observado

- **10 exports/workflows n8n** na raiz: A, B, C, D, E, F, G, H monitor, H CRM e monitor Evolution. O A tem 82 nós; os demais têm entre 12 e 71. A, B, C, D, F, H monitor, H CRM e monitor Evolution aparecem como `active=true` nos JSONs locais; E e G como `false`. Esse campo é metadado do export e não prova o estado no servidor.
- **PostgreSQL Sofia** guarda lead, conversa/mensagens, follow-ups, indicações, configuração e filas auxiliares. O schema original contém quatro tabelas centrais (`sofia_leads`, `sofia_mensagens`, `sofia_followups`, `sofia_indicacoes`) e migrações sucessivas acrescentam locks, auditoria, monitoramento e outbox CRM.
- **Chatwoot** fornece inbox/conversas, agentes, labels, notas e webhook de entrada. O envio WhatsApp passa por ele e chega ao Evolution.
- **Twenty** é origem da lista cold e destino de dados comerciais. A lógica de seleção e sincronização depende de campos/API do Twenty.
- **Evolution API** mantém sessões/números WhatsApp e entrega/envia mensagens. Há vários chips com inbox e quotas por chip.
- **Anthropic Claude** conduz conversa e classificação; prompt outbound e inbound são configurações distintas. **Whisper/OpenAI** é usado para transcrever áudio.
- **E-mail/SMTP** aparece como canal de redundância nos alertas; a documentação histórica indica configuração incompleta em alguns snapshots.
- O repositório é sobretudo exports n8n, SQL, documentos e testes pontuais. Não foi identificado aqui um backend/webapp próprio da Sofia que já ofereça um núcleo reaproveitável.

## Evidência, proveniência e limites

1. A raiz e parte da documentação operacional estão desatualizadas: README ainda aponta prompt v923, enquanto o SQL canônico inclui alterações posteriores e termina atribuindo `versao=934`; a revisão de 13/11 descreve v932 como candidata local, com bloqueio de publicação por conflito do webhook do A. O versionamento no SQL, o conteúdo e a evidência de produção precisam ser reconciliados antes da migração.
2. A revisão de conversas de 30/10–13/11 examinou 396 leads: 70% sem resposta registrada e 61 respostas substantivas. É sinal para acompanhar a operação e separar falha de envio de silêncio do lead, mas não demonstra que uma abertura específica causou o resultado.
3. A rampa da Sofia 4 em 09/11 documenta a divisão da cota diária cold de 40 entre chip 1 (30) e chip 4 (10), sem aumento de volume total.
4. A análise não consultou o n8n, bancos, Chatwoot, Twenty, Evolution nem Anthropic em produção. Estados `active`, versões, credenciais, execução real, filas e configurações vivos devem ser exportados e comparados antes de qualquer corte.
5. Não se deve executar as migrações históricas em bloco como se fossem schema inicial; a documentação alerta que várias são incrementais e dependem de estado já existente.

## O produto que eu construiria

### Superfícies de produto

1. **Inbox**: conversas WhatsApp, histórico, status, responsável humano, handoff, notas, labels, busca e respostas humanas. Suporte a várias caixas/números e mensagens de texto/áudio/documentos.
2. **CRM leve**: empresas, pessoas, oportunidades, origem, estágio, tarefas, reuniões/retornos e timeline unificada. Importação/exportação e sincronização bidirecional opcional com Twenty durante a transição.
3. **SDR e campanhas**: prospecção por listas, segmentação, elegibilidade, cadências, quotas por número, janela/feriados, pause/resume, prévia e execução controlada. Inbound de anúncios fica como outra origem/campanha, com configuração e prompt separados quando necessário.
4. **Automação**: regras de follow-up, silêncio, indicações, handoff e monitoramento implementadas como eventos + jobs idempotentes, com retries e dead-letter. Não como fluxos de lógica escondidos em exports.
5. **Estúdio de Sofia**: prompts/playbooks versionados, conhecimento por segmento, regras rígidas fora do prompt, modelos e limites configuráveis, simulação de conversas, aprovação e rollback.
6. **Operação e saúde**: status dos conectores, chips/sessões, filas, falhas, custos/latência da IA, taxa de resposta, handoffs, tarefas vencidas, tentativas e trilha de auditoria.
7. **Configuração e permissões**: tenant/empresa, equipes, papéis, canais, feriados, horários, limites, credenciais secretas e feature flags. Toda mudança relevante auditada.

### Módulos internos sugeridos

`Identity/Organizations` · `Contacts & CRM` · `Conversations/Inbox` · `Channels` · `Campaigns` · `Automation Scheduler` · `AI Orchestrator` · `Knowledge & Policies` · `Human Handoff` · `Integrations` · `Analytics/Audit`.

O núcleo deve ser dono de IDs e estados. Integrações recebem adaptadores com mapeamento explícito; não devem definir o domínio interno. A mesma pessoa/empresa/conversa precisa ter um ID interno estável e IDs externos mapeados por sistema.

### Arquitetura pragmática

- **Web app + API de domínio** como uma aplicação versionada.
- **PostgreSQL** como fonte da verdade do produto, com migrações rastreadas e modelo explícito de organização, contato, lead/oportunidade, conversa, mensagem, tarefa, campanha, canal, execução e evento de integração.
- **Fila durável + workers** para webhooks, envios, cadências, transcrição, sincronização e alertas. Outbox/inbox pattern, idempotency keys, deduplicação por ID externo, retry exponencial e fila de falhas.
- **Adaptador WhatsApp Evolution** para sessão/transportes. Guardar estado da sessão e saúde no produto; não acoplar políticas comerciais ao formato da Evolution.
- **Adaptadores Chatwoot/Twenty** para migração e modo conectado. Um objeto deve ter mapeamento/id externo, origem e política de conflito visíveis.
- **Adaptadores IA** para Anthropic e STT. Separar classificação/decisão da execução de ações; IA sugere ação estruturada, política determinística valida e um executor idempotente realiza.
- **Armazenamento de mídia** em object storage, com acesso assinado e retenção configurável.
- **Observabilidade** por trace ID de ponta a ponta: webhook → decisão → job → envio → confirmação do canal → atualização CRM.

## Escolha de produto: substituir ou apenas consolidar?

Faria a migração em duas camadas:

- **Primeiro unificar a operação**: console, modelo interno, auditoria, scheduler e inbox nativo. No início, usar importações/reconciliação legadas de Chatwoot e manter Twenty como conector CRM para reduzir risco e permitir comparação sem colocar Chatwoot no caminho das mensagens.
- **Depois internalizar as superfícies**: inbox e CRM leve passam a funcionar no produto e os sistemas externos viram opcionais. Não bloquear a operação se a API de um CRM externo estiver indisponível; enfileirar sync e mostrar estado.

Assim, o usuário usa um único produto mesmo enquanto os dados e canais são migrados por trás. Evolution é a exceção razoável a manter: é o gateway de WhatsApp e pode ficar como dependência de transporte, embora a interface de conexão/saúde continue no produto.

## Plano de migração sugerido

### Fase 0 — Baseline e contrato

- Exportar estado atual vivo de n8n, PostgreSQL, Chatwoot, Twenty e Evolution; salvar snapshots e hashes.
- Criar matriz “capacidade → workflow/SQL/tabela → sistema dono → frequência → risco → critério de aceite”. Resolver versão efetiva do prompt, workflows ativos, filas e credenciais sem reproduzir segredos no repositório.
- Inventariar volumes, retenção, duplicatas, APIs usadas, limites, custos e casos de falha; estabelecer métricas de baseline.
- Definir o que é fonte da verdade para empresa, contato, conversa, mensagem, oportunidade e consentimento/opt-out.

### Fase 1 — Núcleo técnico

- Criar API/modelo canônico, autenticação/perfis, auditoria, secrets e configuração tipada.
- Implementar ingestão confiável de webhooks, outbox/inbox, jobs, retry, idempotência e trilha de execução.
- Conectar Chatwoot, Twenty, Evolution e modelo em modo espelho/dry-run, sem enviar nem alterar CRM por duplicidade.

### Fase 2 — Read-only e operação

- Mostrar contatos, conversas, campanhas, filas, tarefas e saúde no novo console.
- Comparar estados calculados com produção; medir drift e resolver mapeamentos.
- Implementar políticas do A e handoff com simulação, mantendo envios desativados até os adapters diretos dos provedores estarem prontos.

### Fase 3 — Escrita controlada

- Migrar primeiro eventos internos/alertas e sincronização CRM via outbox.
- Pilotar respostas inbound de baixo risco e follow-ups com lista allowlist/teste; manter um único consumidor ativo por webhook.
- Depois migrar captação cold com teto abaixo ou igual ao atual, feature flag por chip, pausa imediata e confirmação explícita do envio.
- Tratar indicação, silêncio e inbound ads após fluxo principal e reconciliação.

### Fase 4 — Substituição gradual

- Internalizar inbox; migrar histórico de forma reconciliável e sem duplicar mensagens.
- Internalizar CRM leve e habilitar sync externo opcional por campo e direção.
- Desligar cada workflow n8n somente após janela de observação, reconciliação de fila/estado e rollback exercitado.
- Manter n8n apenas para integrações auxiliares ou removê-lo depois que nenhum fluxo de produção depender dele.

## Riscos que precisam ser tratados desde o desenho

- **Envio duplicado ou perdido**: webhook/retry sem idempotência e dois consumidores concorrentes. Mitigar com chaves idempotentes, ownership de processamento e confirmação do canal antes de marcar enviado.
- **Migração de histórico/IDs**: telefone não é uma identidade suficiente; existem troca de número, múltiplas empresas e indicações. Manter IDs internos e tabela de aliases externos.
- **CRM com conflito de edição**: definir dono por campo, precedência, timestamp/versão e fila de revisão; sincronização “bidirecional” genérica é arriscada.
- **Regras de negócio no prompt**: guardas críticas (opt-out, janela, handoff, quotas, identidade, consentimento, preço permitido) devem ficar em políticas determinísticas e auditáveis.
- **Risco de canal e operação**: limites por chip, saúde, pausa global/por campanha e respeito a regras aplicáveis ao canal precisam continuar visíveis e controláveis.
- **Dados pessoais e mídia**: RBAC, criptografia, retenção/expurgo, log sem segredo, acesso a áudio e trilha de leitura/export.
- **Mudança de comportamento**: usar replay/simulação de conversas anonimizadas e comparação de decisões; nenhum envio real durante shadow mode.
- **Observabilidade/custo**: discriminar custo por organização, campanha, conversa, modelo e transcrição; alertar saldo/API indisponível separadamente do silêncio do lead.

## Métricas de aceite por etapa

- Nenhuma mensagem duplicada ou sem confirmação na amostra migrada.
- Reconciliação exata de IDs, estado, origem e contagens entre sistemas para a janela piloto.
- Zero follow-up vencido perdido; ação e próxima tentativa visíveis.
- 100% dos envios e mudanças de estado com ator, regra, versão de prompt/política, timestamps e correlação.
- Pausa de campanha/chip/global efetiva em tempo operacional definido.
- Handoff apresenta conversa, contexto e responsável; respostas humanas silenciam automação.
- Resync/retry não reabre recusa, opt-out, handoff resolvido ou indicação já processada.
- Comparativo de qualidade de conversa e custo com baseline antes de ampliar volume.

## Minha opinião

Eu seguiria com o produto único. A oportunidade principal não é “colocar os dez workflows numa tela”; é consolidar **estado, operação e governança** para que SDR, inbox, CRM, cadências e conectores operem sobre o mesmo registro e tenham uma trilha observável.

Começaria por núcleo de dados + fila confiável + console/inbox e manteria Evolution, Chatwoot e Twenty integrados durante a transição. Não substituiria simultaneamente automação, canal, inbox e CRM: o maior risco é perder ou duplicar conversas/leads enquanto ainda se tenta reproduzir regras que hoje estão dispersas em prompts, SQL e nós Code.

## Decisões ainda abertas para o desenho detalhado

- O produto será inicialmente interno do 30Pay ou já multiempresa/multi-tenant?
- O CRM interno precisa substituir o Twenty por completo ou basta cobrir as operações usadas pela Sofia e manter sincronização opcional?
- O Chatwoot deve ser substituído desde a primeira versão do inbox ou permanecer como backend por uma fase?
- A primeira entrega deve priorizar operação/visibilidade, inbox, CRM, ou campanha outbound?
- Quais canais além de WhatsApp (Evolution) precisam de suporte na primeira versão?
