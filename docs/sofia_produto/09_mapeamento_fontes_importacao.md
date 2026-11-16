# Sofia → 30Sales: fontes e regras de importação

## Evidência e limite

Este mapeamento foi feito a partir dos exports versionados de n8n em `workspace/ferramentas/n8n` e do schema SQL local da Sofia. É uma leitura estática: não confirma o estado atual dos serviços, bancos, exports vivos nem o volume em produção. Antes de importar, comparar com exports e amostras atuais aprovados.

## Fontes observadas

| Fonte | Identidade externa observada | Dados úteis | Papel no fluxo atual |
|---|---|---|---|
| Twenty | Company `id` | `name`, telefone principal (`phonesPrimaryPhoneNumber`, `phones.primaryPhoneNumber` ou variações), `createdAt` | Origem de prospecção cold; o Workflow C evita duplicar pelo telefone ou `twenty_id` e atualiza status de abordagem |
| Postgres Sofia | `sofia_leads.id`; `twenty_id`; telefone | nome, empresa, inbox/chip, status operacional, origem, handoff, follow-ups, indicação | Estado operacional SDR/BDR e relacionamento com Twenty/Chatwoot |
| Postgres Sofia — mensagens | `sofia_mensagens.id`; `external_ref` quando disponível | lead, papel, texto, horário | Histórico da conversa; pode conter dados pessoais e precisa de política de retenção/redação |
| Chatwoot (legado) | account + conversation ID; message ID | inbox, contato, status, assignee, mensagens, direção/horário, anexos | Fonte opcional de importação histórica; não executa mensagens no 30Sales |
| Evolution | instância/chip | saúde e transporte do WhatsApp | Provider de canal; não é identidade primária de conta ou pessoa |

O Workflow C local consulta Twenty Companies e extrai `id`, `name`, telefone e `createdAt`. A Sofia deduplica sua fila pelo telefone ou `twenty_id`; isso é uma regra legada de ingestão, não uma autorização para fundir registros automaticamente no 30Sales.

O schema base `01_schema.sql` é histórico e não descreve sozinho todas as evoluções. Usar os SQLs incrementais e workflows atuais como mapa complementar; não tratar esse arquivo isolado como schema vivo.

## Inspeção ao vivo do Twenty — 16/11/2026

Inspecionei em modo somente leitura o workspace `3035TECH`, nas telas Companies, People, Tasks e Notes e em fichas relacionadas. Os campos abaixo são os que estavam visíveis na configuração/tela observada; valores vazios não provam que o dado não exista em outro registro. A inspeção de uma tela não substitui export/API para contagens e tipos completos.

| Objeto | Campos observados |
|---|---|
| Company — padrão | Name, Domain Name, Account Owner, Annual Revenue, Address, Linkedin, Creation date, Created by, Industry, Phones / Primary Phone Number |
| Company — personalizados | Account Status, Client Type, MRR / Contract Value, School Segment, Instagram, Student Count, Status Abordagem, Chip, Data de abordagem, ID Sofia, Cnpj, Origem do lead, Primeira resposta Sofia em, Aceite comercial Sofia em, Motivo recusa Sofia, Negocios indicados, Primeira abordagem Sofia em, Conversa Sofia |
| People | Name, Emails, Company, Phones, Job Title, Linkedin, Creation date, Created by |
| Tasks | Title, Task Type, Status, Due Date, Assignee, Created by, Creation date, Body, Relations; também aparece o campo personalizado Prioridade Sofia |
| Notes | Title, Body, Relations, Created by, Creation date. Notas de integração podem guardar um snapshot estruturado de handoff, indicação, lacunas de qualificação e trechos de conversa no corpo livre. |
| Timeline de Company | Criação, alterações de campos com valores anterior/novo, relações com notas e tarefas, horário e detalhes expansíveis. |
| Files e Emails | Existem como abas de relações na ficha. Nas fichas abertas durante esta inspeção não havia arquivos nem troca de email associados; os exemplos não permitem determinar o esquema completo dessas integrações. |

### Tipos e opções configuradas no Twenty

Conferência de **Data model → Companies** no workspace aberto, em 16/11/2026. É uma fotografia da configuração atual do tenant, não um contrato para fixar no código do 30Sales.

| Campo Twenty | Tipo observado | Decisão de mapeamento |
|---|---|---|
| Account Status | Select | Catálogo configurável: Active, Expansion, At Risk, Renewed, Churned. Preservar valor/API value e label de origem. |
| Client Type | Select | Catálogo configurável: Active Client, Prospect, Partner, Reseller. |
| Industry | Select | Taxonomia extensa, com setores genéricos e subsegmentos de tecnologia; não copiar uma lista incompleta para enum global. |
| School Segment | Select | Usado como taxonomia de segmento escolar/esportivo; opções abaixo. Separar de uma classificação livre de carteira. |
| Status Abordagem | Select | Etapa operacional da abordagem; opções abaixo. Mapear para estado de lead/conversa com regra explícita, não para etapa de oportunidade. |
| Origem do lead | Select | Catálogo de aquisição; opções abaixo. Guardar também código/label original e proveniência. |
| Student Count | Number | Inteiro não negativo no modelo canônico, sujeito a validação contra valores reais antes de importar. |
| Annual Revenue, MRR / Contract Value | Currency | Valor monetário decimal mais código de moeda; não converter para inteiro nem somar moedas distintas. |
| Cnpj, Chip | Text | Normalizar CNPJ/telefone em colunas tipadas próprias; preservar valor de origem para reconciliação. |
| Data de abordagem, Primeira abordagem Sofia em, Primeira resposta Sofia em, Aceite comercial Sofia em | Date and Time | Timestamp com timezone/fuso conhecido e proveniência. |
| Motivo recusa Sofia | Text | Motivo narrativo; não usar diretamente como critério automático de segmento. |
| Conversa Sofia | Links | Referência externa; importar como alias, nunca como ID primário. |

Opções visíveis de **School Segment** (API value → label): `EARLY_CHILDHOOD_DAYCARE` → Early Childhood / Daycare; `ELEMENTARY_SCHOOL_FUNDAMENTAL` → Elementary School (Fundamental); `HIGH_SCHOOL_MEDIO` → High School (Médio); `HIGHER_EDUCATION_COLLEGE` → Higher Education / College; `TECHNICAL_VOCATIONAL` → Technical / Vocational; `LANGUAGE_SCHOOL` → Language School; `SCHOOL_NETWORK_GROUP` → School Network / Group; `MARTIAL_ARTS` → Martial Arts; `MUSIC_SCHOOL` → Music School; `BALLET_DANCE` → Ballet / Dance; `SWIMMING` → Swimming; `SPORTS_SCHOOL` → Sports School; `ARTS_THEATER` → Arts / Theater; `TUTORING_TEST_PREP` → Tutoring / Test Prep; `OTHER` → Other; `GYM` → Gym; `FOOTBALL` → Futebol; `FUTSAL` → Futsal; `TENNIS` → Tênis; `BEACH_TENNIS` → Beach Tennis; `VOLLEYBALL` → Vôlei; `FOOTVOLLEY` → Futevôlei; `BASKETBALL` → Basquete; `HANDBALL` → Handebol; `GYMNASTICS` → Ginástica; `PILATES` → Pilates; `YOGA` → Yoga; `MULTISPORT` → Várias modalidades.

Opções visíveis de **Status Abordagem**: `NAO_ABORDADO` (Não abordado), `EM_CONVERSA` (Em conversa), `HANDOFF` (Handoff / quer reunião), `GANHO` (Ganho), `PERDIDO` (Perdido), `SEM_WHATSAPP` (Sem WhatsApp), `TELEFONE_INVALIDO` (Telefone inválido).

Opções visíveis de **Origem do lead**: `OUTBOUND_SOFIA` (Outbound — Sofia), `OUTBOUND_SALES` (Outbound — vendedor), `REFERRAL` (Indicação), `INBOUND_SITE` (Inbound site), `ADS_GOOGLE` (Google Ads), `ADS_INSTAGRAM` (Instagram Ads), `OTHER` (Outra origem). A descrição do campo no Twenty diz para não inferir origem só pela existência de mensagens do agente; origem da oportunidade acompanha o negócio até o fechamento.

Opções visíveis de **Account Status**: Active, Expansion, At Risk, Renewed, Churned. De **Client Type**: Active Client, Prospect, Partner, Reseller. Seus API values podem diferir dos labels e devem ser lidos do export/API antes da reconciliação.

O modelo-alvo mantém taxonomias externas versionadas por tenant/provedor, com código original, label, origem e mapeamento canônico revisável. Valores não mapeados continuam visíveis como desconhecidos e não são descartados. Catálogos estáveis do domínio 30Sales podem usar enums/constantes; rótulos editáveis no CRM não devem virar enums globais de aplicação.

### Consequências para o modelo do 30Sales

- A primeira segmentação manual por categoria é insuficiente como modelo-alvo. O CRM usa atributos distintos de perfil da empresa, qualificação comercial, estado de abordagem, relacionamento e atividade.
- Levar para campos tipados de Company, depois de confirmar tipo/opções em export: identificador CNPJ, endereço em partes normalizadas, domínio, indústria, segmento/subsegmento, quantidade de alunos, tipo/status de cliente, valor recorrente/contratual, origem e estado de abordagem, chip e marcos de abordagem/resposta/aceite/recusa. “Student Count” deve ser inteiro; datas devem ser timestamps; status e tipo precisam de catálogo centralizado e mapeamento de origem preservado.
- People permanece uma entidade relacionada à Company, com email/telefone/cargo e papel comercial; flags de contato principal/interessado continuam no vínculo do lead/contato, não como atributo da empresa.
- Tasks, Notes, Files, Emails e Timeline são objetos/atividades relacionados, não atributos achatados da empresa. Segmentos podem filtrar fatos tipados e sinais calculados (por exemplo, tarefa aberta ou atividade recente), mas não texto bruto de nota, email ou conversa. Fatos extraídos de narrativa exigem fonte, data, estado de confirmação e revisão antes de qualificar ou disparar campanha.
- A timeline deve preservar eventos e mudanças, sem tentar sobrescrever esses registros com o estado atual. Notes e emails podem conter dados pessoais/conteúdo de conversa; importação precisa de escopo, redaction/retention e acesso auditado. Files devem importar metadados e vínculo; conteúdo binário só após decidir retenção e destino privado S3.
- A aba Emails estava vazia nos exemplos consultados. Antes de implementar o adapter, inspecionar um registro com mensagem real e confirmar provedor, direção, participantes, timestamps, anexos e identidade externa. Da mesma forma, confirmar tipos e opções de todos os campos personalizados via export/API read-only.

## Identidade no 30Sales

- `external_records` usa `(organization_id, provider, record_type, external_id)` para localizar um objeto externo. FKs compostas mantêm o vínculo no tenant correto.
- IDs diferentes da mesma origem podem apontar para um objeto interno comum após revisão/merge; número de telefone, nome ou e-mail não substitui o ID externo.
- `conversations` já tem identidade Chatwoot por organização, provider e `external_conversation_id`; mensagens são deduplicadas dentro da conversa por `external_message_id`.
- Telefone normalizado pode gerar candidato de pessoa para revisão. Nunca fundir empresa, pessoa ou lead automaticamente apenas por telefone ou nome.
- Preservar `source_status`, origem e horários do legado. Status operacional da Sofia não equivale diretamente a status de lead nem à etapa/resultado da oportunidade.

## Mapeamento de status — decisão pendente de amostra real

O legado distingue pelo menos `novo`, `em_conversa`, `aguardando_followup`, `handoff`, `perdido` e `ganho`. O 30Sales separa status de lead, oportunidade, handoff, tarefa e transporte de mensagem. Não fazer conversão automática de `perdido` ou `ganho` para etapa terminal sem motivo, evidência e data verificáveis. `handoff` também não significa reunião aceita ou oportunidade ganha.

Durante o preview, mostrar status de origem e destino sugerido lado a lado. Valores sem regra confirmada devem aparecer como conflito para revisão; nenhum deles deve desaparecer por normalização.

## Fluxo de importação proposto

1. Capturar exports/read-only snapshots aprovados de Twenty, Chatwoot e Postgres Sofia e guardar contagens, instante e hash do arquivo sem reter payload sensível por padrão.
2. Normalizar cada objeto para contrato interno versionado; preservar IDs, tipo de objeto e valores de origem.
3. Fazer identity check tenant-scoped; identificar IDs já vinculados, sem vínculo, ID duplicado no lote e conflito de vínculo.
4. O endpoint `POST /api/v1/imports/reconciliation-preview` recebe até 100 registros já normalizados e devolve vínculos externos existentes, conflitos de tipo, candidatos exatos e `sourceStatus`; não escreve nem envia mensagens. A busca atual considera nome exato normalizado de conta e e-mail/telefone normalizados para pessoa/lead; oportunidades são candidatas pela conta. Não faz fuzzy match nem confirma uma reconciliação.
5. Reconciliar contagens e amostra de IDs/relacionamentos; exigir revisão dos conflitos e aprovação de um operador autorizado.
6. Importar em lotes idempotentes com `external_records`, histórico/auditoria e progresso de job; replay não cria segundo registro nem apaga fato confirmado.

## Pendências antes do primeiro lote

- Export vivo atual de workflows e schema Postgres; reconciliar divergências com os arquivos locais.
- Amostras anonimizadas de cada fonte e contagens por status/inbox/origem.
- Campo exato do Company no Twenty usado como telefone e enum/IDs reais dos status.
- Contrato de identificação de mensagem Chatwoot, autoria, mídia e estado de entrega.
- Mapeamento de indicações, follow-ups pendentes, eventos CRM, handoffs e links entre as fontes.
- Regras de colisão de telefone, merge, retenção de mensagens e provenance por campo.
- Staging/database aprovado e plano de rollback; migrations 0001–0011 continuam sem aplicação.

## Escopo implementado do preview

- O contrato aceita `provider` (`twenty`, `chatwoot`, `sofia_postgres`), tipo e ID externo, tipo canônico pretendido e campos normalizados de nome da conta/contato, e-mail, telefone e status de origem. Payloads brutos dos conectores ainda precisam de adapters.
- Limite do lote: 100 registros; IDs externos repetidos no lote são rejeitados. A busca não usa fuzzy matching, domínio, empresa alternativa nem regra histórica de deduplicação por telefone isoladamente.
- `already_linked` informa vínculo existente do mesmo tipo; vínculo existente de outro tipo retorna `type_conflict`. Sem vínculo, candidatos podem resultar em `possible_match`, `ambiguous` ou `no_match`.
- A saída é apenas apoio à revisão. Não há ação para aprovar candidato, gravar `external_records`, resolver conflito, importar histórico ou registrar progresso de job.
- A tela **Importações** recebe CSV UTF-8 com os campos normalizados listados acima e encaminha a prévia pelo client central da aplicação. Ela não persiste o arquivo ou resultado. O CSV ainda precisa ser preparado manualmente; não é um adapter Twenty, Chatwoot ou Postgres Sofia.
