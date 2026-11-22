# 30Sales — especificação detalhada do produto

Versão 1.0 — 14/11/2026. Esta especificação registra a visão, as regras e o backlog que orientam a evolução do produto. Ela não é um retrato automático do código ou do ambiente publicado: vários fluxos descritos já têm implementação, e o estado deve ser confirmado no repositório e nos registros de release/migrations.

Esta documentação define o blueprint de produto para o **30Sales**, aplicação comercial única de BDR, SDR e closer. **Sofia** é a assistente SDR virtual que opera dentro do 30Sales, não o nome da plataforma.

## Decisão de marca

- Produto: **30Sales**
- Assistente SDR: **Sofia**
- Empresa: **3035Tech**
- Família atual: **30Pay**, **30Grow**, **30Studio** e **30Sales**

## Documentos

1. [Visão, escopo, papéis e navegação](01_visao_e_navegacao.md)
2. [Especificação de telas, campos e ações](02_telas_campos_acoes.md)
3. [Modelo de dados](03_modelo_de_dados.md)
4. [Estados, regras e automações](04_estados_regras_automacoes.md)
5. [Integrações, API, segurança e operação](05_integracoes_api_seguranca.md)
6. [Backlog, critérios de aceite e plano de entrega](06_backlog_aceite_entrega.md)
7. [Oportunidades de produto pelo olhar de quem usa](07_oportunidades_e_valor_para_usuario.md)
8. [Portfólio e linhas de negócio](11_portfolio_linhas_negocio.md)

## Premissas adotadas

- O 30Sales nasce como SaaS multi-tenant: cada empresa cliente tem uma organização isolada e seus próprios usuários, dados, integrações e políticas. A 3035Tech/30Pay pode ser o primeiro tenant, sem tratamento especial no modelo. Billing/white-label podem vir depois; isolamento e membership entram no primeiro schema.
- 30Sales será o Inbox e CRM operacional; conecta diretamente à Evolution API ou à WhatsApp Business Cloud API oficial. Chatwoot não será dependência nem executor do produto. Dados legados podem ser importados durante a migração, se necessário.
- BDR prepara contas e prospecção; Sofia/SDR conversa e qualifica; closer conduz diagnóstico, proposta, negociação e fechamento. Em equipe pequena, um usuário pode acumular papéis.
- Agenda integrada é necessária para afirmar “reunião confirmada”. Até integração, compromissos manuais devem ter tipo e status próprios.
- Regras de canal, consentimento/opt-out, horário, quota e ownership são determinísticas. Modelo de IA não pode sobrepô-las.
- Valores e métricas históricos da documentação existente não formam uma baseline uniforme. Metas numéricas serão parametrizadas após captura da linha de base.

## Vocabulário do domínio

- **Conta:** empresa/organização que pode ter contatos, unidades e oportunidades.
- **Pessoa:** indivíduo ligado a uma ou mais contas, com papel na compra.
- **Lead BDR:** relação de prospecção com uma conta ou pessoa, fonte e campanha.
- **Conversa:** thread de mensagens em um canal, com um contato e, opcionalmente, oportunidade.
- **Qualificação SDR:** avaliação da necessidade, aderência e próximo passo; não é a oportunidade em si.
- **Oportunidade:** processo comercial com etapa e resultado; pode ter várias por conta.
- **Atividade:** tarefa, ligação, reunião, nota ou evento com responsável e timestamps.
- **Execução:** trabalho técnico assíncrono (webhook, envio, sync, IA, transcrição) que pode falhar sem alterar falsamente o estado comercial.
- **Handoff:** transferência explícita de ownership e pacote de contexto entre Sofia/SDR e closer.

## Como ler

Os campos marcados **MVP** são necessários para a primeira operação completa. **Depois** indica incremento posterior. “Obrigatório no fechamento” significa obrigatório para marcar ganho/perda, não para criar a oportunidade.

Valores que dependem de política comercial (ex.: metas, SLA, pipeline, quotas e segmentos) devem ser configuráveis e versionados, não espalhados em código ou prompt.

## Identidade visual

A marca 30Sales e suas regras de uso estão em [`../identidade_visual_30sales.md`](../identidade_visual_30sales.md); os assets versionados acompanham o frontend em `30sales-front/public/brand-kit/`.
