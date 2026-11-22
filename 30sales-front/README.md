# 30Sales frontend

Aplicação web do 30Sales, construída com Vite, React, TypeScript, React Router e i18next. A interface é localizada em português do Brasil e inglês.

## Executar localmente

```bash
npm ci
npm run dev
```

Por padrão, o Vite encaminha requests de `/api` para `http://localhost:3000`. Para apontar para outra API durante o desenvolvimento, defina `VITE_API_PROXY_TARGET`.

## Comandos

```bash
npm run build  # verifica TypeScript e gera dist/
npm run lint   # executa Oxlint
npm run preview # serve localmente o build de dist/
```

## Organização do código

- `src/features/`: telas e fluxos por domínio, como Inbox, Leads, Campanhas, Pipeline, Tarefas e Linhas de negócio.
- `src/components/ui/`: componentes de interface acessíveis e compartilhados.
- `src/lib/api/`: client HTTP centralizado, sessão e contratos da API.
- `src/lib/i18n/`: catálogos de texto `pt-BR` e `en`.
- `public/`: marca e assets estáticos.

Toda comunicação HTTP passa pelo client centralizado em `src/lib/api/client.ts`. A interface pode manter a organização ativa como contexto visual, mas autorização e isolamento de dados são responsabilidade do backend.

Veja o [README do projeto](../README.md), os [padrões do frontend](AGENTS.md) e a [arquitetura](../docs/arquitetura_tecnica.md).
