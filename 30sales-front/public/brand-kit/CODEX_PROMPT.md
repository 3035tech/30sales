# Prompt para Codex — implementar identidade 30sales

Você está trabalhando no projeto 30sales. Integre o kit de identidade visual que acompanha este arquivo. Antes de alterar, inspecione a stack, o roteamento, os componentes de layout, o tema, os assets e os testes existentes. NÃO recrie o projeto, NÃO remova funcionalidades, NÃO altere APIs, regras de negócio ou fluxos de autenticação.

## Identidade
- Produto: 30sales
- Conceito: Conexão e Fluxo — Uma seta dentro do 0 representa a jornada do lead até a conversão.
- Tagline: Transforme conversas em negócios.
- Primary: #2563EB
- Accent: #10B981
- Dark: #0F172A
- Display font: Manrope
- UI font: Inter

## Tarefas
1. Identifique a pasta pública de assets (por exemplo `public/`), copie os arquivos de `logos/` e `icons/` para uma pasta `brand/` e preserve os nomes.
2. Carregue `branding/tokens.css` no sistema de estilos ou mapeie `tokens.json` ao tema atual, evitando variáveis duplicadas.
3. Configure fontes Manrope e Inter usando a abordagem recomendada pelo framework; inclua fallbacks.
4. Substitua logos temporários em header, sidebar, login, onboarding e páginas institucionais quando existirem. Use `logo-default.svg` em fundos claros e `logo-light.svg` em fundos escuros. Preserve dimensões, responsividade e acessibilidade (alt text).
5. Configure favicon, apple-touch-icon, web manifest/PWA e metadata OG onde aplicável, sem sobrescrever configurações específicas de ambiente.
6. Atualize somente as cores globais e componentes relevantes (botões, links, foco, badges, gráficos e estados). Mantenha contraste WCAG AA e não use cor como único sinal de estado.
7. Garanta que dark mode, mobile e desktop funcionem. Não aplique gradientes indiscriminadamente em telas densas de dados.
8. Execute lint, typecheck, testes e build disponíveis; corrija regressões relacionadas às alterações.
9. Entregue resumo dos arquivos alterados, screenshots ou instruções para revisão visual, resultados dos testes e eventuais pendências.

## Critérios de aceite
- Identidade consistente em todas as telas existentes.
- Ícones e logos nítidos e sem distorção.
- Sem regressões funcionais.
- Tokens centralizados e documentação de uso atualizada.
- Não criar dependências novas sem justificar.
