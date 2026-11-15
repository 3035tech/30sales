# Auditoria geral de UX — 30Sales

Data: 15/11/2026  
Escopo: leitura da aplicação React, estilos e fluxos do backend existentes. A interface em execução não estava disponível para inspeção visual; os achados abaixo são baseados no código e precisam de uma passada visual em navegador antes de fechar detalhes de espaçamento e comportamento.

## Resumo

A aplicação já reúne fluxos comerciais com contexto útil — tarefas, Inbox, carteira do closer, pipeline e relatórios — mas a navegação ainda depende de estado interno do componente principal. Isso dificulta orientação, acesso por link e uso em tela pequena. Sinais operacionais também ficam fragmentados: alertas de SLA são exibidos apenas dentro da carteira do closer, sem um ponto global. A primeira melhoria implementada foi expor esses alertas no cabeçalho, com contagem de não lidas, atualização periódica e abertura da conversa relacionada.

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
| P1 | Notificações existentes são somente de SLA e apareciam dentro da carteira do closer. | Alertas importantes podem passar despercebidos fora dessa tela; não há centro global. | Central no cabeçalho e ampliar categorias de forma explícita (tarefas, Inbox e atribuições), com preferência por ação direta. A fatia atual globaliza os alertas de SLA existentes. |
| P2 | As 15 áreas aparecem numa lista plana; a página é controlada por estado sem rota própria. | A navegação tem pouca hierarquia; URLs não preservam área/estado nem permitem link direto ou voltar pelo histórico. | Agrupar áreas por trabalho (Atendimento, Vendas, Administração) e introduzir rotas estáveis com estados essenciais na URL. |
| P2 | Cobertura de estados de carregamento, falha parcial e dados desatualizados varia entre áreas. | Usuários podem não saber se a informação é atual ou se parte da tela falhou. | **Implementado:** estados compartilhados, dados anteriores identificados durante refresh e métricas indisponíveis sem falso zero. Fazer inspeção visual quando o app estiver disponível. |

## Critérios de qualidade para as próximas fatias

- Cada área começa com título claro, propósito, indicador útil e ação principal visível.
- Alertas distinguem urgência e tipo, explicam o que aconteceu e levam ao registro correto; leitura/atendimento é confirmada no servidor.
- Listagens mostram filtros ativos, contagem, ordenação e paginação coerentes, sem perder contexto ao navegar.
- Em telas pequenas, conteúdo e navegação continuam acessíveis sem depender de hover.
- Estados vazio, carregando, erro, sucesso e atualização parcial são localizados em pt-BR e inglês.
- Todo dado sensível permanece limitado à organização ativa e ao usuário autorizado; a API continua como autoridade.

## Limite desta revisão

Não houve inspeção de runtime porque não havia navegador disponível nesta sessão. A avaliação visual de contraste, densidade, alinhamento, comportamento de foco e fluxo real precisa ser feita quando a aplicação puder ser aberta. Não foram executados build ou testes, conforme preferência registrada no contexto do projeto.
