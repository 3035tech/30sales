# Documentação do 30Sales

Comece pelo [README do repositório](../README.md) para conhecer o produto, preparar o ambiente local e executar frontend e backend.

## Produto e operação comercial

- [Visão geral da Sofia e navegação](sofia_produto/01_visao_e_navegacao.md)
- [Telas, campos e ações](sofia_produto/02_telas_campos_acoes.md)
- [Modelo de dados](sofia_produto/03_modelo_de_dados.md)
- [Estados, regras e automações](sofia_produto/04_estados_regras_automacoes.md)
- [Integrações e segurança](sofia_produto/05_integracoes_api_seguranca.md)
- [Backlog e critérios de aceite](sofia_produto/06_backlog_aceite_entrega.md)
- [Oportunidades de produto e valor para o usuário](sofia_produto/07_oportunidades_e_valor_para_usuario.md)
- [Eventos e integrações Evolution/Meta](sofia_produto/08_eventos_integracoes_evolution_meta.md)
- [Portfólio de linhas de negócio](sofia_produto/11_portfolio_linhas_negocio.md)
- [Mapeamento de fontes de importação](sofia_produto/09_mapeamento_fontes_importacao.md)

O diretório [`sofia_produto`](sofia_produto/README.md) contém a especificação funcional consolidada e links para todos os documentos do produto.

## Engenharia e entrega

- [Arquitetura técnica](arquitetura_tecnica.md): camadas, isolamento multi-tenant, API, persistência e integrações.
- [Imagens de contêiner e GitOps](container-images.md): builds, publicação no GHCR, roteamento e atualização via Argo CD.
- [Identidade visual](identidade_visual_30sales.md): marca, paleta, tipografia e assets.
- [Padrões de engenharia](../AGENTS.md): convenções obrigatórias para mudanças no frontend e backend.
- [Contexto de continuidade](CONTEXTO_SESSAO_30SALES.md): registro cronológico de decisões e trabalho recente. É uma memória de sessão, não substitui a verificação do código atual.

## Aplicações

- [Frontend](../30sales-front/README.md): Vite, React, execução local e estrutura da interface.
- [Backend](../30sales-back/README.md): NestJS, configuração, migrations, testes e domínios da API.

## Ambiente local

Os passos completos estão no [README principal](../README.md#executar-localmente). Em resumo, configure PostgreSQL e as variáveis de `30sales-back/.env.example`, aplique migrations apenas a um banco local descartável e execute os servidores do frontend e backend em terminais separados.
