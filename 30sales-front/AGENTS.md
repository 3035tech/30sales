# Engineering rules — 30Sales frontend

Apply root [`../AGENTS.md`](../AGENTS.md) first. This app is a Vite + React + TypeScript SPA and must never become a source of truth for tenant authorization or business state.

## Structure

- `src/app`: router, app providers, route guards/presentation only.
- `src/features/<domain>`: feature pages, components, hooks and view models organized by accounts, inbox, campaigns, qualification, opportunities, activities, reports and admin.
- `src/components/ui`: accessible branded wrappers for buttons, inputs, dialogs, menus, tables, badges and feedback.
- `src/lib/api`: typed HTTP client, auth/session handling, error normalization and request correlation.
- `src/lib/i18n`: locale setup and typed catalogs (`pt-BR`, `en`).
- `src/lib/constants`: routes, limits, status labels/keys, role permissions and feature flags.
- Avoid giant `App.tsx`; feature pages compose shared layout and components.

## Frontend contracts

- Use React Router for routes and TanStack Query for server state/cache; local component state only for ephemeral UI. Search/filter/page state belongs in URL where shareable.
- Use shared Zod/OpenAPI contracts for request/response parsing. Never trust a tenant ID from URL/local storage as authority; active organization is UI context, backend derives and authorizes it.
- API base URL comes from `VITE_API_BASE_URL`; no provider secrets or privileged API tokens in `VITE_*` variables because they are public bundle values.
- Send correlation/idempotency keys for commands that can create external effects. Invalidate/refetch server state after mutations; do not show “sent/delivered” from optimistic UI.
- Handle 401, 403, 409, 422, rate limits, provider outage, stale data, loading and empty states distinctly. Never put raw backend exception text in user-facing copy.

## UI and localization

- Use i18next/react-i18next for pt-BR and English; keep catalogs aligned and keys typed/validated. Locale-aware date, time, number and currency formatters.
- Build from product design tokens. Use Radix primitives via wrappers and Lucide icons; prefer direct imports and avoid UI library defaults.
- Feature components do not duplicate permission logic; use permissions to conditionally render affordances, while backend remains authoritative. Explain disabled actions when helpful.
- Inbox and data tables must support keyboard focus, predictable loading, pagination/virtualization when measured volume warrants, and filters in URL.
- Avoid full-page client state stores until multiple features demonstrate the need.

## Estilização

- Tailwind CSS v4 está integrado pelo plugin oficial `@tailwindcss/vite`. Use utilities para novas telas e componentes.
- Mantenha os tokens da marca em `public/brand-kit/branding/tokens.css`; não duplique valores de cor ou tipografia em configurações paralelas.
- O CSS atual segue válido. Migre estilos existentes somente ao tocar neles por necessidade de produto, preservando comportamento responsivo e acessibilidade.

## API centralizada

Todas as requisições ao backend, inclusive chamadas Better Auth, devem partir de `src/lib/api/client.ts`. Features/components importam métodos e DTOs deste client; nunca chamam `fetch`, `axios` ou `authClient` diretamente. O client é dono de cookies/credentials, correlation ID, schemas/parse de resposta, normalização de erros e métodos de cada domínio.

## English code and localization

Use English for identifiers, file names, comments, DTOs, enums, internal errors, and technical documentation in source code. User-facing labels, help, and errors are translated through i18next catalogs for `pt-BR` and `en`; never hardcode interface copy in components.
