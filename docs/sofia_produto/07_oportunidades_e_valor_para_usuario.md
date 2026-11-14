# 7. 30Sales — oportunidades de produto vistas pelo usuário

Este documento amplia a especificação a partir da pergunta: **se eu fosse BDR, SDR, closer ou gestor usando o sistema todo dia, que trabalho gostaria que ele tirasse do meu caminho e que oportunidade gostaria que revelasse?**

As propostas abaixo são possibilidades de produto, não funcionalidades já existentes. Prioridade recomendada:

- **Essencial:** protege a operação e torna o trabalho diário confiável.
- **Alto valor:** economiza tempo ou aumenta conversão depois que os fundamentos funcionam.
- **Exploração:** pode criar vantagem, mas precisa ser validada por uso e dados.

## 1. A promessa do produto na linguagem de quem usa

### BDR

“Não quero gastar o dia procurando telefones ruins, ligando para empresas duplicadas ou abordando quem já pediu para parar. Quero saber quem vale abordar, por qual canal, qual mensagem usar e o que aconteceu depois.”

### SDR

“Não quero repetir perguntas, interpretar sozinha dezenas de automações, nem deixar um lead esperando porque a conversa ficou escondida numa caixa. Quero saber o contexto, a pergunta certa e quando preciso assumir.”

### Closer

“Não quero fazer trabalho de pesquisa nem descobrir do zero o que já foi falado. Quero abrir uma oportunidade e entender rapidamente por que estão conversando, o que a empresa precisa, quem decide, o que foi prometido e qual é o passo para fechar.”

### Gestor

“Não quero um dashboard com números sem explicação. Quero saber onde o funil está travando, quem precisa de ajuda, que problema é de processo/canal e que comportamento realmente leva a venda.”

## 2. Oportunidades além de CRM + inbox

### 2.1 Um cockpit de trabalho, não só cadastro

**Dor:** o usuário abre sistemas diferentes para descobrir o que fazer e cada um mostra uma fatia do problema.

**Funcionalidade:** “Meu dia” junta tarefas, respostas novas, retornos combinados, handoffs, reuniões, propostas paradas, falhas de canal e tarefas vencidas, ordenadas por ação recomendada e impacto.

Cada cartão explica: **por que apareceu, qual evidência, quem é responsável, qual prazo e qual ação resolve**. O usuário pode concluir, reagendar, transferir ou marcar como revisão. A fila se atualiza após ação, sem exigir refresh ou busca manual.

**Valor:** reduz troca de contexto e leads esquecidos.

**Prioridade: essencial.**

### 2.2 Brief vivo para o closer

**Dor:** resumo estático envelhece; o closer lê informação desatualizada e repete perguntas.

**Funcionalidade:** brief consolidado e atualizado com fatos confirmados, origem, linha do tempo, objetivo do contato, sistema atual, volume declarado, decisores, objeções, material enviado, promessas feitas, pendências e compromisso seguinte. Cada fato aponta para a mensagem/nota que o sustenta e mostra quando foi confirmado.

O closer pode corrigir ou contestar um fato. A correção fica registrada e não apaga a evidência anterior. Antes de uma ligação/reunião, o sistema prepara um “pré-voo” de 30 segundos e sugere perguntas ainda não respondidas.

**Valor:** o closer entra direto no diagnóstico e na decisão, sem refazer o trabalho do SDR.

**Prioridade: essencial.**

### 2.3 Detector de compromissos esquecidos

**Dor:** “me chama amanhã”, “vou ver com meu sócio”, “manda a proposta” e “retorno na semana que vem” aparecem em mensagens, mas nem sempre viram uma tarefa clara.

**Funcionalidade:** detectar linguagem de compromisso no histórico e propor tarefa com data, dono, canal e trecho de evidência. Se a data for ambígua (“semana que vem”), pedir confirmação ao usuário ou criar lembrete de resolução, sem inventar um dia. Distinguir promessa do vendedor, intenção do lead e prazo interno.

Antes de concluir uma conversa ou fechar a tela, avisar: “Há um compromisso sem tarefa”. Permitir criar com um clique.

**Valor:** recupera oportunidades sem aumentar disparos automáticos.

**Prioridade: essencial.**

### 2.4 Memória comercial e prevenção de repetição

**Dor:** a mesma pergunta sobre cobrança, volume, preço ou decisão é feita de novo em outro canal ou por outra pessoa.

**Funcionalidade:** memória por conta, pessoa e oportunidade, com fatos confirmados e validade. Antes de sugerir uma pergunta, a Sofia verifica se a resposta existe, se foi respondida por essa pessoa, quando e em qual contexto. Diferencia “não respondeu”, “não sabe”, “não aplicável” e “ainda não perguntado”.

**Valor:** conversa mais natural, menos atrito e handoff mais confiável.

**Prioridade: essencial.**

### 2.5 Pesquisa prévia de conta para o BDR

**Dor:** BDR pesquisa cada empresa manualmente e alterna entre CRM, site, planilha e ferramentas públicas.

**Funcionalidade:** ficha de preparação antes do contato: atividade/segmento provável, unidades, contato conhecido, canais válidos, origem e data das fontes, sinais de aderência e perguntas que ainda precisam ser verificadas. Enriquecimento externo só por conectores autorizados, com custo/limite configurado e fonte registrada.

O sistema nunca transforma inferência em fato. Exibe “parece ser escola de futebol — confirmar” e permite corrigir segmento antes de campanha.

**Valor:** mais contas realmente abordáveis por hora e menos abertura inadequada.

**Prioridade: alto valor.**

### 2.6 Triagem de respostas e “caixa de exceções”

**Dor:** boa parte das conversas iniciais são ausência, menu, recepção, contador, número errado ou transferência; o time revisa tudo como se fosse oportunidade.

**Funcionalidade:** classificar respostas em filas operacionais distintas: resposta humana, automação/ausência, transferência, contato de outra empresa, indicação, número errado, recusa, opt-out, resposta comercial, áudio sem transcrição e dúvida de política. Mostrar confiança e trecho detectado. Casos incertos vão para revisão, não para campanha automática.

**Valor:** reduz falso positivo e protege experiência/reputação do canal.

**Prioridade: essencial.**

### 2.7 Painel de capacidade e previsão de carga

**Dor:** gerar mais leads sem saber se existem pessoas para atender pode piorar o tempo de resposta e perder oportunidades quentes.

**Funcionalidade:** comparar abordagens previstas, respostas esperadas pela taxa observada, handoffs pendentes, capacidade diária do BDR/SDR/closer e SLA. Se a fila de handoff ou tarefas estiver acima da capacidade, recomendar reduzir/pausar a prospecção antes de aumentar volume.

Mostrar cenários (“com o volume atual, 18 tarefas de primeiro contato entram amanhã”), explicando as premissas. Não mudar quota automaticamente.

**Valor:** alinha aquisição à capacidade real de fechamento.

**Prioridade: alto valor.**

### 2.8 Roteamento inteligente de oportunidades

**Dor:** distribuir tudo igualmente ignora especialidade, região, disponibilidade, carga atual e continuidade do relacionamento.

**Funcionalidade:** sugerir owner por regras configuráveis: carteira existente, segmento, região, idioma, valor/potencial, disponibilidade e carga. Preferir manter o mesmo responsável quando já existe relação. Mostrar por que foi roteado; permitir override com motivo.

**Valor:** menor tempo até o contato e melhor aproveitamento de especialização.

**Prioridade: alto valor**, depois de dados de disponibilidade/capacidade estarem confiáveis.

### 2.9 “Próxima melhor ação” com evidência

**Dor:** CRM mostra status, mas não ajuda a decidir o que fazer agora.

**Funcionalidade:** recomendar ação específica por estágio e contexto: confirmar decisor, marcar diagnóstico, esclarecer taxa, enviar material, consultar especialista, aguardar data combinada ou encerrar. Exibir a razão, o dado que falta e a política aplicada. Ações automáticas só para rotinas aprovadas; as comerciais continuam como sugestão até autorização.

**Valor:** padroniza boas práticas sem transformar vendedor em operador de checklist cego.

**Prioridade: alto valor.**

### 2.10 Captura automática de atividade por evidência

**Dor:** depois da ligação/reunião, atualizar CRM é trabalho administrativo e fica para depois.

**Funcionalidade:** após chamada/reunião integrada, gerar rascunho de resumo, tópicos, participantes, objeções, decisão, próximos passos e responsáveis. Usuário revisa antes de gravar. Mensagens enviadas podem preencher a tentativa, mas não afirmar que houve conversa ou resposta.

**Valor:** CRM mais completo e menos tempo de registro.

**Prioridade: alto valor**; depende de integrações, qualidade de gravação/transcrição e política de privacidade.

### 2.11 Ajuda contextual e coaching para o closer

**Dor:** vendedor novo não sabe como conduzir uma objeção; gestor escuta amostras tarde demais.

**Funcionalidade:** durante preparação da reunião, mostrar playbook do estágio, objeções relevantes, perguntas sugeridas e fatos do caso. Depois, comparar registro com critérios de processo (necessidade entendida? decisor? próximo passo?). Coaching privado e agregado; não pontuar personalidade/emoção nem publicar ranking sem contexto.

**Valor:** reduz ramp-up e torna aprendizagem replicável.

**Prioridade: exploração** após conteúdo de vendas validado.

### 2.12 Aprendizado por motivos de perda e feedback de produto

**Dor:** motivo “perdido” vira campo genérico e não alimenta decisões de produto, preço ou posicionamento.

**Funcionalidade:** taxonomia de perda que separa timing, concorrente, preço, falta de aderência, prioridade, produto/integração, ausência de decisor e sem retorno; evidência textual e confiança. Relatório aponta segmentos/problemas repetidos e encaminha feedback para produto, sem expor conversa além de permissões.

**Valor:** marketing, produto e vendas aprendem com mercado real, não só com anedotas.

**Prioridade: alto valor.**

### 2.13 Experimentos comerciais controlados

**Dor:** alterar abertura ou roteiro sem saber se melhorou; comparar períodos com público diferente.

**Funcionalidade:** experimento por coorte com hipótese, público, variantes, guardrails, janela, resultado primário e métricas de segurança. Randomização/atribuição persistente; controlar segmento, horário e canal; encerrar automaticamente só por limite de segurança previamente aprovado, nunca declarar vencedor com amostra insuficiente.

Guardrails: opt-out, bloqueios, reclamações, taxa de falha, carga de handoff e qualidade; não otimizar apenas resposta inicial.

**Valor:** melhora contínua da abordagem baseada em evidência.

**Prioridade: alto valor** depois de tracking e volumes consistentes.

### 2.14 Central de saúde e “o que quebrou?”

**Dor:** silêncio do lead, erro de API, saldo do modelo esgotado, chip offline e webhook perdido podem parecer o mesmo problema.

**Funcionalidade:** timeline técnica por lead/campanha: evento recebido, regra avaliada, decisão, job, provider, retorno, retry e confirmação. Alertas com causa provável, impacto, owner e instrução de recuperação. Painel separa falha comercial, canal, CRM, IA e dado.

**Valor:** suporte resolve falhas antes de alguém abordar o lead por fora e duplicar mensagem.

**Prioridade: essencial.**

### 2.15 Busca de rede e relações entre empresas

**Dor:** a mesma pessoa pode atender várias unidades ou empresas; indicações conectam negócios; números de contador/consultoria aparecem na base como se fossem o prospect.

**Funcionalidade:** grafo leve de relações: empresas relacionadas, unidades, contador/consultoria, pessoa compartilhada, indicada por, grupo econômico e conflito. Exibir relação e fonte antes de criar/abordar. Não inferir que duas empresas são a mesma por telefone compartilhado.

**Valor:** melhora dedupe, roteamento e interpretação de respostas de terceiros.

**Prioridade: alto valor.**

### 2.16 Portal de revisão e aprovação

**Dor:** mudanças de prompt, preço, campanha e regras ficam em SQL/JSON ou dependem de operação técnica.

**Funcionalidade:** fluxo de draft → simulação → revisão → aprovação → publicação gradual → rollback. Separar criador e aprovador para alterações de canal, preço, opt-out, quota e ações de envio. Mudança mostra diff, público afetado e estimativa de impacto.

**Valor:** negócio consegue evoluir o processo sem publicar mudanças invisíveis ou não rastreáveis.

**Prioridade: essencial para operação autônoma; editor rico pode vir depois.**

## 3. Funcionalidades que fazem o closer “só fechar”

Para chegar perto dessa promessa, o sistema deve executar ou organizar tudo antes da oportunidade chegar ao closer:

1. Localizar empresa e contato, remover duplicatas e resolver a origem.
2. Validar canal e disponibilidade, aplicar supressão e evitar contato proibido.
3. Fazer abordagem e classificar resposta/automação sem confundir os dois.
4. Conversar, registrar fatos e identificar lacunas sem repetir perguntas.
5. Confirmar intenção e organizar reunião/contato com o calendário real.
6. Roteá-la para closer com capacidade e especialidade compatíveis.
7. Criar oportunidade, brief, atividade, SLA, link de conversa e alertas.
8. Monitorar aceite/primeiro contato e escalar atraso.
9. Capturar resultado da reunião/proposta e atualizar o CRM com revisão humana.
10. Encerrar com motivo ou criar próxima ação até decisão.

O closer ainda pode precisar fazer diagnóstico e descobrir detalhes relevantes — isso é parte do fechamento. “Só fechar” significa retirar dele **pesquisa de lista, triagem, saneamento, busca de histórico, agendamento operacional e registro repetitivo**, não remover o julgamento comercial.

## 4. Ideias para uma experiência realmente proativa

### Alertas acionáveis, não notificações genéricas

- “O lead respondeu há 11 min e a conversa ainda está com a Sofia. A Sofia está aguardando confirmação de X; assumir ou manter automação?”
- “A reunião começa amanhã; briefing está 80% pronto e falta confirmar participante decisor.”
- “A proposta está sem próximo passo há 4 dias; a última mensagem foi visualizada, mas não houve resposta. Criar tarefa ou aguardar?”
- “A campanha tem 27 leads sem contato válido; pausar a lista e revisar fonte?”

Cada alerta deve conter ação segura e explicação, com opção de dispensar e motivo.

### Resumos sob demanda por contexto

- **Antes de ligar:** brief de 30 segundos e 3 pontos a confirmar.
- **Depois de uma reunião:** rascunho de CRM e tarefas.
- **Antes de enviar proposta:** checklist de escopo, participantes, preço aprovado e data de validade.
- **Na revisão de carteira:** oportunidades sem próximo passo, mudanças e riscos desde a última visita.
- **Para o gestor:** gargalo do funil com evidência por coorte e amostra de registros.

## 5. Pacotes de valor potencial

| Pacote | Funcionalidades | Benefício a medir |
| --- | --- | --- |
| Tempo de resposta | Fila Hoje, roteamento, SLA, notificações e disponibilidade | Minutos até primeira ação humana |
| Mais reuniões úteis | Triagem, qualificação, calendário e brief | Handoffs aceitos que viram reuniões realizadas |
| Mais tempo de fechamento | Memória, resumo pré-call e captura de atividade | Tempo do closer gasto em venda vs administração |
| Melhor base | Enriquecimento com fonte, dedupe e grafo | Percentual de contas com contato válido e correções |
| Menos risco de canal | Opt-out central, quotas, health gate e auditoria | Falhas/duplicatas/opt-outs e incidentes |
| Aprendizado contínuo | Experimentos, motivos de perda e feedback | Melhoria por coorte sem piorar guardrails |

## 6. Priorização recomendada

### Construir no núcleo primeiro

1. Cockpit “Meu dia” e filas por papel.
2. Brief vivo e memória com evidência.
3. Tarefas a partir de compromissos, com revisão e owner.
4. Caixa de exceções e triagem de automações/terceiros.
5. Painel técnico por lead para separar silêncio de falha.
6. Prevenção de repetição de perguntas e ownership claro.

### Próxima camada de vantagem

7. Capacidade e previsão de carga antes de aumentar prospecção.
8. Roteamento por especialidade e carga.
9. Próxima melhor ação com explicação.
10. Captura de reunião/chamada revisada pelo usuário.
11. Taxonomia de perdas e feedback de produto.
12. Experimentos comerciais bem controlados.

### Explorar depois de validar uso e dados

13. Grafo avançado de empresas/contatos.
14. Coaching/treinamento adaptativo.
15. Enriquecimento externo automatizado em escala.
16. Forecast probabilístico e copiloto de gestor.

## 7. Como validar cada oportunidade

Antes de desenvolver uma funcionalidade avançada, medir:

- Quantas vezes por semana o usuário enfrenta a dor e quanto tempo consome.
- Quantos leads/operações são afetados e qual valor potencial.
- Se o dado necessário existe e tem fonte confiável.
- Se uma automação pode causar contato indevido, duplicidade ou falsa promessa.
- Qual grupo piloto aceita revisar sugestões e qual é o fallback manual.
- Qual métrica muda e qual guardrail não pode piorar.

Recomendação prática: acompanhar BDR, SDR e closer em alguns turnos reais e registrar observação de tarefas, interrupções e retrabalho. Usar a especificação existente para prototipar três fluxos: resposta nova, preparação de handoff e preparação de fechamento. Só depois consolidar o backlog de telas avançadas.

## 8. Limites de design

- Não transformar o sistema em um “painel de IA” com recomendações sem ação clara.
- Não automatizar cobrança de atividade por volume bruto de mensagens.
- Não ranquear vendedores sem contexto, qualidade e dificuldade de carteira.
- Não otimizar campanha apenas para resposta; considerar interesse qualificado, opt-out e resultado comercial.
- Não confundir “mais campos preenchidos” com “mais prontidão”; fatos úteis e confiáveis importam.
- Não esconder incerteza da IA nem permitir que uma pontuação substitua pedido humano.
- Não disparar cadência automática para preencher dashboard ou forecast.
