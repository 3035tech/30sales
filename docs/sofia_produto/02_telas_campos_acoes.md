# 2. 30Sales — especificação de telas, campos e ações

Convenções: **M** = obrigatório para criar/avançar naquele fluxo; **O** = opcional; **Auto** = sistema; **MVP** = versão inicial. Campos de auditoria aparecem em histórico, não como entrada editável comum.

## 2.1 Hoje — fila de trabalho

**Objetivo:** orientar o usuário sobre a próxima ação útil.

| Componente/campo | Tipo | Regra |
| --- | --- | --- |
| Aba da fila | filtro: Minhas tarefas, Sem responsável, Vencidas, Hoje, Próximos 7 dias, Falhas | Respeita papel e equipe |
| Busca/filtros | texto, equipe, campanha, etapa, origem, prioridade | Persistir filtros por usuário |
| Prioridade | badge + motivo | SLA vencido, aceite novo, cliente respondeu, reunião próxima, falha operacional |
| Próxima ação | texto + tipo | Sempre mostrar responsável e prazo/fuso |
| Conta/pessoa/oportunidade | links | Abrir detalhe sem perder filtros |
| Última atividade | timestamp/canal/resumo | Distinguir enviada, entregue, recebida e falha |
| Ações | Abrir, atribuir, concluir, reagendar, dispensar alerta | Concluir exige resultado; dispensar exige motivo quando alerta de risco |

**Conclusão de tarefa no MVP:** escolher resultado (ação concluída, contato realizado, sem resposta ou retorno necessário) e registrar nota opcional. Ao escolher retorno, informar ação e data futura; a tarefa seguinte é criada na mesma operação, com responsável preservado. A conclusão atualiza a próxima ação do lead e registra auditoria. Valores históricos sem resultado permanecem desconhecidos.

Estados: carregando, sem tarefas (com link para filas), erro recuperável, sem permissão, dados desatualizados com horário do último sync.

## 2.2 Inbox

Layout em três painéis: filas/conversas; thread e composer; contexto da pessoa/conta/oportunidade.

| Campo | Tipo | Regra/edição |
| --- | --- | --- |
| Canal/inbox | enum + identidade do número | Auto; admin configura |
| Status da conversa | enum | Nova, aguardando Sofia/SDR, em atendimento, aguardando lead, retorno agendado, handoff pendente, assumida pelo closer, resolvida, opt-out, falha |
| Responsável/ownership | usuário/equipe/Sofia | Alteração grava evento e silencia automação quando humano assume |
| Pessoa e telefone | links + fonte | Telefone normalizado; conflitos explícitos |
| Conta | relação | Pode ser desconhecida; associação exige evidência ou revisão |
| Oportunidade vinculada | relação opcional | Pode existir mais de uma; selecionar contexto ativo para conversa comercial |
| Tags | multi-select | Ex.: inbound/outbound, urgência; não substituem estado |
| SLA | timestamp + semáforo | Mede fila interna, não promessa ao cliente |
| Mensagem | texto, anexo, áudio | Composer valida canal, ownership, opt-out e limite |
| Estado de envio | solicitado, aceito, entregue, lido (se fornecido), falhou | Nunca derivar resposta do lead de estado de envio |
| Nota interna | texto estruturado ou livre | Não enviada ao contato |
| Resumo Sofia | texto + versão + fatos | Sugestão automática com link às mensagens fonte |
| Ações | assumir, transferir, encerrar, criar tarefa, vincular oportunidade, solicitar handoff | Operações relevantes confirmadas e auditadas |

Composer: prévia de destinatário e número, bloqueio visível, enviar; opção “sugerir resposta” não envia; anexos respeitam tipos/tamanho. Resposta gerada mostra fatos usados e edição humana.

## 2.3 Contas — lista e detalhe

### Lista

Colunas configuráveis: conta, segmento, região, status BDR, proprietário, contato principal, última atividade, próxima ação, origem, campanha, última sincronização. Filtros salvos, importação CSV, exportação permitida, deduplicação/revisão, atribuição.

**Segmentação inicial entregue no código:** categorias configuráveis por organização, uma por empresa; owner/admin/manager mantêm a lista e classificam contas na tela Contas. Leads podem filtrar pela categoria ou por “Sem segmento”. A classificação é tenant-scoped, auditada e não é inferida na importação. Segmentos dinâmicos multicritério e dimensões firmográficas ainda não estão incluídos.

### Cadastro de conta

| Campo | Tipo | Obrigatório | Fonte/validação |
| --- | --- | --- | --- |
| Nome de uso | texto | M | Nome para operação; 1–200 caracteres |
| Razão social | texto | O | Se conhecido |
| Domínio/site | URL/texto | O | Normalizar host |
| Segmento | enum controlado | O na criação; M antes de campanha segmentada | Não inferir como confirmado |
| Subsegmento | enum/texto | O | Escola, futebol, academia, estúdio etc. |
| País/UF/cidade | códigos + texto | O | Usar códigos normalizados quando disponíveis |
| Porte/volume | faixas + valor | O | Estimativa e confirmado em campos distintos |
| Sistemas atuais | relação/texto | O | Evidência, data e autor |
| Telefone geral | telefone E.164 | O | Validar formato; não prova WhatsApp |
| E-mail geral | e-mail | O | Normalizar lower-case |
| Status de prospecção | enum | Auto/manual permitido com motivo | Fluxo de status BDR |
| Não abordar | boolean + motivo + data | M quando acionado | Bloqueio global imediato |
| Fonte de criação | enum/texto | M | Integração, importação, manual, indicação, anúncio |
| Proprietário/equipe | relação | O/M para fila ativa | Permissões de atribuição |
| IDs externos | lista read-only | Auto | Twenty etc. |

Detalhe em tabs: Resumo, Pessoas, Conversas, Leads/Campanhas, Oportunidades, Atividades, Dados externos, Auditoria. Cabeçalho com status agregado e próxima ação; status agregado nunca substitui estados dos objetos.

## 2.4 Pessoas

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| Nome declarado | texto | O no cadastro; obrigatório para classificar interlocutor como identificado | Não usar nome do perfil como confirmado |
| Nome do perfil | texto | Auto | Marcar como fonte externa/não confirmado |
| Cargo/função | texto/enum | O | Decisor, financeiro, recepção, contador etc. como papel, não cargo presumido |
| Telefones | lista E.164 + tipo + validade | Pelo menos um canal para contato | Deduplicação com revisão em conflito |
| E-mails | lista | O | Validar sintaxe; não confirmar posse sem evidência |
| Conta(s) | relação N:N | O | Relação pode ser contestada |
| Papel na compra | enum múltiplo | O | Decisor, influenciador, usuário, gatekeeper, desconhecido |
| Preferência/restrição de contato | enum/horário | O | Respeitar opt-out e origem |
| Consentimento/base de contato | estado + fonte + timestamp | Conforme política aplicável | Sem consentimento válido, canal pode ficar bloqueado |
| Não abordar | boolean + escopo | M quando acionado | Pessoa, conta ou canal; expansão conservadora |

## 2.5 Campanhas e lista BDR

Campos de campanha: nome (M), objetivo (M), origem/canal (M), público/segmento, proprietário, estado (rascunho/revisão/ativa/pausada/concluída), playbook e versão, janela/fuso, feriados, quota diária global e por canal, limite por conta/pessoa, critérios de elegibilidade, regra de saída, remetentes/chips permitidos, data início/fim, aprovação.

Tela de prévia mostra: número de contas elegíveis/excluídas por motivo, amostra dos destinatários e mensagens, quota/ritmo projetado, saúde dos canais, alterações vs versão publicada. “Ativar” exige permissão e confirmação de resumo. Campanha ativa pode pausar; reduzir quota é imediato, aumentar pode exigir aprovação.

Lista BDR por conta: status, motivo do status, contato validado, última tentativa, resposta, próximo passo, campanha e responsável. “Solicitar contato” cria item de execução e respeita todas as guardas; não executa uma segunda cadência paralela.

## 2.6 Qualificação SDR e ficha do lead

Campos de fato qualificado, cada um com `valor`, `estado` (confirmado/desconhecido/não aplicável/conflito), `fonte`, `mensagem_id` opcional e `atualizado_em`:

- segmento e contexto da empresa;
- interlocutor/função/participação na decisão;
- problema ou motivação;
- processo e sistema atuais;
- volume informado e unidade (alunos, cobranças/mês, clientes etc.);
- necessidade/uso esperado;
- objeções e perguntas sem resposta;
- interesse explícito e texto/evidência do aceite;
- disponibilidade/retorno;
- produto/condição discutidos;
- próxima ação, responsável e prazo.

Tela tem checklist de prontidão, fatos e lacunas, timeline compacta, playbook usado e ações: continuar, solicitar humano, agendar retorno, handoff, desqualificar com motivo, opt-out. Qualquer “desqualificar/opt-out” exige motivo; pedido explícito de humano não pode ser bloqueado pelo checklist.

## 2.7 Oportunidade — pipeline/closer

### Campos

| Campo | Tipo | Obrigatório/regra |
| --- | --- | --- |
| Nome da oportunidade | texto | M; conta + produto/necessidade em forma legível |
| Conta | relação | M |
| Contato principal | relação | O; lacuna visível |
| Owner/equipe | relação | M para oportunidade ativa |
| Produto/linha | enum | M antes de proposta |
| Origem/campanha | relação/enum | M se conhecida; “desconhecida” permitido com revisão |
| Pipeline/etapa | enum configurável | M; transição validada |
| Resultado | aberta/ganha/perdida/desqualificada | Auto/manual conforme etapa |
| Valor e moeda | decimal + ISO currency | O até proposta; obrigatório em ganho se aplicável |
| Plano/interesse | enum/texto | O; confirmado ou estimado claramente separado |
| Data de fechamento | data/hora | Obrigatória para ganho; data real |
| Motivo de perda | enum + texto | Obrigatório para perdida; lista versionada |
| Próxima ação | texto/tipo | M enquanto aberta (exceto aguardando evento externo com data) |
| Próxima ação em | timestamp + timezone | M enquanto aberta |
| Reunião | relação agenda + estado | “Confirmada” só após aceite/reserva |
| Resumo comercial Sofia | texto e versão | Auto, editável como anotação humana preservando original |
| Prioridade/forecast | enum | O; justificativa/autor |
| Empresa indicadora | relação | Condicional à origem por indicação |

### Layout

Cabeçalho: conta, valor/etapa, owner, estado e próxima ação. Coluna principal: timeline e notas. Painel lateral: brief, contatos, qualificação, riscos/lacunas. Pipeline drag-and-drop permitido apenas se passar validação e exigir campos no avanço; registrar de/para e ator.

**Primeiro corte operacional:** quadro por etapa com vistas Minha carteira, Todas, Sem responsável, Sem próxima ação, Ação vencida e Paradas há 7+ dias. Cards destacam próxima ação, prazo, owner, contato, valor e idade da etapa. A ação Atualizar etapa abre formulário com os campos exigidos pelo destino. O histórico mostra ator, etapa e nota. Ainda não há edição de conta/contato, previsão de fechamento, reunião nem drag-and-drop.

## 2.8 Handoff

Resumo e confirmação antes de transferir: destino (closer/equipe), conta, contato, oportunidade, motivo, aceite/evidência, lacunas, data de compromisso, link da conversa, prazo do primeiro contato.

Estados: `rascunho`, `solicitado`, `na_fila`, `aceito`, `devolvido`, `cancelado`. Aceitar transfere ownership e inicia SLA. Devolver exige motivo e cria tarefa para SDR/gestor; não apaga oportunidade. Expiração de SLA escala para gestor, sem reativar Sofia automaticamente.

## 2.9 Agenda e atividades

Atividade: tipo (ligação, reunião, mensagem, e-mail, tarefa, nota, pesquisa), assunto (M), owner (M), status (pendente/em andamento/concluída/cancelada), vencimento (M para tarefa), conta, pessoa, oportunidade, conversa, resultado, notas e evidência.

Evento de reunião inclui início/fim, fuso, participantes, local/link, calendário externo, estado (proposto/aguardando aceite/confirmado/realizado/cancelado/no-show), origem da confirmação e ID externo. Alteração de horário cria histórico; não sobrescreve o compromisso anterior sem evento.

## 2.10 Relatórios e dashboards

### Dashboard gerencial

Área de gestão para responder onde o funil trava, quem precisa de apoio e se o SDR IA está gerando oportunidades úteis. Deve oferecer período/coorte, pipeline, equipe, vendedor/owner, segmento, origem/campanha e canal como filtros apenas quando houver dados para o recorte. O escopo de tenant, equipe e carteira vem da autorização no servidor. Cada indicador informa período, definição, numerador/denominador quando aplicável, fuso e horário de atualização; gráficos têm alternativa tabular acessível.

**Vendas e closers**
- Entradas e saídas do pipeline no período; distribuição atual por etapa; valor aberto por etapa e moeda (sem somar moedas diferentes).
- Ganhos, perdas e taxa de ganho calculada somente como ganhos ÷ (ganhos + perdas) fechados no mesmo período/coorte. Mostrar quantidade junto com valores.
- Tempo entre handoff aceito, primeira atividade humana confirmada e fechamento; mediana e percentis devem acompanhar médias quando a distribuição for assimétrica.
- Oportunidades sem próxima ação, ações vencidas, idade na etapa e oportunidades paradas; detalhamento abre a fila correspondente.
- Comparação por vendedor: oportunidades recebidas/ativas, ganhos/perdas, valor fechado por moeda, taxa de ganho e tempo de resposta. Comparações de período usam coortes e denominadores equivalentes; metas e atingimento só aparecem quando configurados e versionados.
- Conversões entre etapas usam histórico de transições e coorte de entrada, não um retrato atual do pipeline. Volume de atividade é indicador de esforço e nunca substitui resultado comercial.

**BDR, SDR IA e handoff**
- Leads elegíveis, tentativas de contato, respostas humanas, conversas qualificadas, handoffs solicitados/aceitos/devolvidos e oportunidades criadas; conversão entre etapas exibe contagem-base e janela de conversão.
- Separar atuação iniciada pela IA, intervenção humana e conversa compartilhada. Medir mensagens geradas e confirmadas pelo canal, falhas, tempo até resposta humana, taxa de handoff aceito, devoluções e conversão posterior em oportunidade/ganho.
- Qualidade da qualificação: completude dos fatos/campos exigidos, lacunas e motivo de devolução, sempre por amostra e com denominador explícito. Não inferir qualidade a partir de volume ou da decisão do próprio modelo.
- Campanha/canal: público elegível, envios confirmados, falhas, respostas humanas, opt-out, custo e conversão. Respeitar pausa, consentimento e regras vigentes; opt-out é também métrica de proteção.

**Operação e eficiência**
- SLA por tipo de evento/papel, fila pendente e vencida, tempo de aceite e primeira ação humana; tarefas criadas/concluídas/vencidas e agenda confirmada/cancelada/no-show quando integração e estados existirem.
- Saúde de canais, conectores e jobs: disponibilidade, fila, retry, falhas permanentes, latência, gasto de IA por provedor/modelo e custo por resultado. Indicadores técnicos ficam separados dos resultados comerciais.
- Cobertura e qualidade dos dados: origem, segmento, contato principal/interessado, valores ausentes, vínculos empresa-contato e oportunidades sem owner/próxima ação. Mostrar como qualidade de cadastro, não como desempenho do vendedor.

Gráficos priorizam séries temporais, funis/coortes, barras comparativas e distribuições de tempo. Tabelas de detalhe mantêm busca, filtros, ordenação e paginação no servidor. Exportação respeita escopo/permissão; export sensível é auditado. Nenhuma meta, conversão, custo, atribuição ou tendência pode ser estimada sem sua fonte e definição aprovadas.

**Limite atual:** o relatório implementado é um primeiro agregado do funil e SLA de handoff; ainda não oferece comparativo por vendedor, tendências/coortes, campanhas ou painel de custo/qualidade da IA. A primeira instrumentação do assistente persiste tentativas do modelo Anthropic, tokens, latência, intenção, fingerprint do prompt efetivo e vínculo às mensagens/conversa. Ainda faltam custo com tabela de preços versionada, telemetria do Whisper, histórico de owner/equipe e eventos de campanha para KPIs de custo completo, comparação retroativa e ROI.

## 2.11 Conhecimento e console de operação

Conhecimento: playbook, segmento, versão, fonte/fato, regra rígida, exemplos de teste, responsável, revisão e status (rascunho, avaliação, aprovado, publicado, arquivado). Publicação mostra diff e plano de rollback.

Operação: cartões de saúde por integração, canal/chip, backlog por estado, falhas permanentes, retries, custo/latência, última confirmação, correlation ID e log redigido. Ações admin: pausar, retentar com chave idempotente, marcar para revisão, reconciliar; reenvio externo exige preview e autorização adicional.
