# Auditoria geral de UX — 30Sales

Data: 15/11/2026  
Escopo: inspeção em runtime no Chrome, no desktop e em viewport responsivo de 390×844, com tenant e dados fictícios isolados. Login, navegação, listas, filtros, contagens e notificações foram percorridos manualmente.

## Continuação: acesso e controles de ação

- Login, carregamento de sessão e seleção de organização ficam fora do shell autenticado. Em sessão anônima no Chrome, a tela apresentou somente a marca e o cartão de acesso, sem menu lateral ou cabeçalho de workspace.
- O login agora inclui “Lembrar de mim” (marcado inicialmente) e “Esqueci minha senha”. A recuperação usa o fluxo nativo do Better Auth, entrega o link pelo SMTP já configurado no backend, valida token e senha nova numa rota independente e revoga sessões anteriores após a troca. A resposta de solicitação não revela se o e-mail existe.
- O fluxo visual de login sem sessão foi inspecionado no Chrome. Não foi enviado pedido de recuperação por e-mail nem exercitada a troca de senha; o ambiente SMTP local e uma caixa de teste não foram usados nesta inspeção.
- Ícone sem texto visível cabe em ações frequentes e inequívocas, com nome acessível e foco visível: abrir/fechar navegação móvel, abrir notificações, atualizar uma lista e baixar um anexo identificado. Navegação lateral, editar oportunidade, responder, salvar, atribuir e resolver devem preservar texto visível; são ações primárias ou cujo significado depende do contexto.
- Pendências registradas para a próxima rodada: remover o título duplicado entre cabeçalho global e conteúdo; configurar um canal fictício para percorrer uma conversa completa no Inbox; avaliar divisão do bundle frontend que ultrapassou o aviso de 500 kB.

## Inspeção visual e funcional em runtime

- Login e seleção da organização funcionaram. Hoje, Tarefas, Leads, Contas, Pipeline, Passagens para closer e Relatórios carregaram dados. Inbox exibiu o estado vazio esperado porque não há canal WhatsApp configurado no ambiente local.
- A notificação de tarefa vencida apareceu na central global; “Marcar todas como lidas” atualizou a contagem para zero. Nenhuma mensagem foi enviada a provedores externos.
- Em 390×844, a navegação móvel abre e fecha, e o conteúdo principal se adapta à largura. O cabeçalho global ainda repete o título da página dentro do conteúdo, consumindo espaço vertical e criando hierarquia duplicada.
- Antes dos ajustes, a barra global colocava título e controles lado a lado em largura estreita, truncando o seletor de organização. A caixa vazia do Inbox também deixava um vão vertical grande. Agora o cabeçalho empilha título e controles, o Inbox reduz a área vazia no mobile, e o layout interno de cabeçalhos não herda mais estilos do cabeçalho do shell.
- Hoje mostrava cada palavra da descrição com inicial maiúscula, incluindo preposições. Removida a capitalização CSS; datas permanecem localizadas pelo formatador.
- Pipeline tem sete etapas e uma faixa horizontal própria no board. Métricas e cartões agora têm estilos e quebras responsivas; filtros e ordenação carregaram sem overflow horizontal da página.
- Foram corrigidos dois erros funcionais encontrados no backend: a formatação de atividade agregada em Contas e uma consulta de eventos do closer que gerava referência ambígua em SQL. As duas telas carregaram após as correções.
- A compilação Nest passou. A compilação TypeScript/Vite passou; o bundle principal ficou em aproximadamente 691 kB e emitiu aviso acima do limite de 500 kB. Não rodei a suíte automatizada.
- A configuração local não tem provedor WhatsApp nem `ANTHROPIC_API_KEY`; envio real no Inbox e execução do assistente não puderam ser exercitados. O Chrome permaneceu aberto na central do closer.

## Resumo

A aplicação já reúne fluxos comerciais com contexto útil — tarefas, Inbox, carteira do closer, pipeline e relatórios — mas a navegação ainda depende de estado interno do componente principal. Isso dificulta orientação, acesso por link e uso em tela pequena. Sinais operacionais também ficavam fragmentados: a central global agora recebe avisos de SLA, novas mensagens inbound, tarefas vencidas, mudanças de handoff e atribuições, com contagem real de não lidas, abertura do registro e ação para marcar todas como lidas.

O item P0 de navegação móvel foi corrigido em `feature/mobile-navigation`: até 640px, o botão abre todas as áreas disponíveis, marca a página atual e fecha o menu após seleção ou Escape. A validação visual em navegador continua pendente.

Os achados P1 de contexto também foram corrigidos: o cabeçalho agora usa título e seção localizados da área ativa; o seletor de organização permite trocar entre memberships já retornados pela sessão. Ao trocar, a aplicação volta para Hoje e remonta o conteúdo com a nova organização, limpa estado local de busca/notificações e comunica falhas sem deslogar. A validação visual ainda depende de navegador.

A navegação plana e sem URL foi substituída por quatro grupos de trabalho e rotas diretas com hash (por exemplo `/#/inbox` e `/#/reports/funnel`). O hash mantém deep links funcionando sem exigir configuração de fallback no servidor estático. Busca contextual originada de Contas e abertura de conversa via notificação também ficam serializadas na URL; os controles de navegação atualizam histórico e funcionam com voltar/avançar.

Os estados de carregamento, erro, vazio, falha parcial e atualização foram padronizados com um componente compartilhado. Listas e relatórios mantêm os últimos dados carregados durante atualizações e identificam quando eles ainda estão sendo atualizados; falhas parciais não são apresentadas como listas vazias ou indicadores iguais a zero. A central Hoje e a carteira do closer distinguem fontes indisponíveis. A verificação visual em navegador ainda está pendente.

## Achados priorizados

| Prioridade | Achado | Efeito para a pessoa usuária | Direção recomendada |
| --- | --- | --- | --- |
| P0 | Em largura até 640px, o CSS esconde todos os itens `.nav`; não há menu móvel substituto. | Depois de entrar em uma área, não há navegação visível para as outras. | Implementar menu móvel acessível e testar teclado, leitor de tela e viewport estreito. |
| P1 | O cabeçalho exibe `home.eyebrow` e `home.headline` em todas as páginas. | Título e contexto não correspondem ao conteúdo aberto. | Título/descrição contextualizados por área, com hierarquia visual consistente. |
| P1 | A organização ativa aparece num botão sem ação (`.workspace`). | Usuários com mais de uma organização não conseguem trocar de contexto pelo shell após a seleção inicial. | Abrir seletor com organizações disponíveis e indicar claramente o contexto ativo. |
| P1 | Notificações existentes eram somente de SLA; a central não tinha categorias gerais. | Mensagens importantes e alertas operacionais podem passar despercebidos fora das respectivas telas. | **Implementado em partes:** além de SLA, Inbox e tarefa vencida, solicitantes recebem aviso de handoff aceito/devolvido e novos responsáveis recebem aviso de atribuição de conversa/oportunidade. Os links abrem o registro específico; as gravações são transacionais, idempotentes e tenant-scoped. A central permite marcar todas as notificações não lidas como lidas pelo servidor. |
| P2 | As 15 áreas aparecem numa lista plana; a página é controlada por estado sem rota própria. | A navegação tem pouca hierarquia; URLs não preservam área/estado nem permitem link direto ou voltar pelo histórico. | Agrupar áreas por trabalho (Atendimento, Vendas, Administração) e introduzir rotas estáveis com estados essenciais na URL. |
| P2 | A lista de Passagens carregava até 100 itens em ordem fixa, sem busca, total ou controle de página. | Em carteiras maiores, resultados ficam ocultos e é difícil localizar uma passagem específica. | **Implementado:** busca tenant-scoped por empresa, contato e contexto; ordenação por data/empresa/contato/prazo; total e seletor de 10/25/50/100 com paginação server-side. |
| P2 | A lista de Tarefas mostrava somente até 100 ações e chamava esse número de total, sem busca nem controle de página. | Em períodos cheios, tarefas podem ficar escondidas e a pessoa não sabe se está vendo toda a fila. | **Implementado:** busca por ação/empresa/contato, ordenação por prazo/ação/empresa/contato, total real e paginação server-side de 10/25/50/100; deep link continua abrindo a tarefa exata. |
| P2 | O Pipeline carregava lotes fixos de 100 sem busca nem total real; os indicadores eram calculados apenas com o lote disponível. | Negócios podem ficar difíceis de localizar e a contagem parcial não fica evidente em carteiras grandes. | **Implementado:** busca tenant-scoped por empresa/contato/negócio/próxima ação, ordenação e tamanho de lote 10/25/50/100; contagem e `hasNextPage` server-side. O board mantém “carregar mais” e identifica indicadores parciais enquanto houver resultados. |
| P2 | Cobertura de estados de carregamento, falha parcial e dados desatualizados varia entre áreas. | Usuários podem não saber se a informação é atual ou se parte da tela falhou. | **Implementado:** estados compartilhados, dados anteriores identificados durante refresh e métricas indisponíveis sem falso zero. Fazer inspeção visual quando o app estiver disponível. |

## Critérios de qualidade para as próximas fatias

- Cada área começa com título claro, propósito, indicador útil e ação principal visível.
- Alertas distinguem urgência e tipo, explicam o que aconteceu e levam ao registro correto; leitura/atendimento é confirmada no servidor.
- Listagens mostram filtros ativos, contagem, ordenação e paginação coerentes, sem perder contexto ao navegar.
- Em telas pequenas, conteúdo e navegação continuam acessíveis sem depender de hover.
- Estados vazio, carregando, erro, sucesso e atualização parcial são localizados em pt-BR e inglês.
- Todo dado sensível permanece limitado à organização ativa e ao usuário autorizado; a API continua como autoridade.

## Limites e próximos passos

- A amostra em runtime cobriu os principais caminhos, mas não todas as telas administrativas nem leitor de tela/teclado completo.
- Revisar o título duplicado no shell e nas áreas, mantendo um único título visual por página.
- Avaliar divisão do bundle com carregamento sob demanda antes de adicionar mais áreas ao frontend.
- Conectar um canal de teste fictício para validar o thread do Inbox e os estados de envio sem atingir um número real.
