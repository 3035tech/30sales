# Engineering rules — 30Sales backend

Apply root [`../AGENTS.md`](../AGENTS.md) first. NestJS is the domain/API authority and enforces tenant isolation for every request and background job.

## Module structure

Organize by domain, not by technical layer globally. Example:

- `src/accounts/{accounts.module,accounts.controller,accounts.service,accounts.repository,schemas}`
- `src/people`, `src/leads`, `src/conversations`, `src/qualifications`, `src/opportunities`, `src/activities`, `src/campaigns`, `src/handoffs`, `src/integrations`, `src/identity`, `src/audit`, `src/jobs`, `src/health`.
- `src/database`: Drizzle client/schema/migrations and transaction boundary.
- `src/common`: correlation, error filter, guards/pipes, pagination and shared non-domain utilities.

Do not create empty modules for every future domain. Add a module when its vertical slice exists. Controllers map HTTP; services implement use cases and authorization; repositories own Drizzle queries; adapters own external providers.

## Request path

- Preserve layer boundaries and avoid coupling: controllers know HTTP signatures/DTOs and delegate; services own use cases and domain authorization; repositories own persistence DTOs/queries; provider adapters translate external API contracts to internal domain types. Domain rules must not depend on UI shapes or provider payloads. Share API schemas only at explicit contract boundaries, not by making the domain depend on transport DTOs.

`HTTP DTO → Zod validation pipe → thin controller endpoint signature/delegation → service (authorization, orchestration, domain rules) → repository DTO → tenant-scoped repository / provider adapter → response DTO`.

- Use `/api/v1`; configure global prefix, request size limits, CORS allowlist, validation, exception filter and request/correlation IDs centrally.
- Establish auth integration for Vite SPA + Nest and organization membership before exposing business routes. Do not keep public scaffold endpoints as business API. Health/readiness may be public but reveal only minimal status.
- Tenant context comes from verified session and membership, never request body/query/header alone. A guard authenticates; a service/policy checks action permission; repository query scopes organization.
- Every repository method for tenant data requires an explicit authorized context or `organizationId` derived from it. Do not make an unscoped `findById(id)` method for tenant records.
- Use Zod schemas (and a Nest pipe) at HTTP/webhook boundaries. `.strict()` command inputs where extra fields could mask errors. Validate provider callbacks and signatures separately.
- Use stable errors `{code, message, correlationId}`; never serialize exceptions, SQL/provider responses, stack traces or secrets.
- Keep synchronous requests short. Commands with side effects use transaction + outbox/idempotency; workers reload records and revalidate tenant, permission, status and opt-out.

## Persistence and migrations

- PostgreSQL + Drizzle ORM, typed repositories, relations, composite constraints and generated/versioned migrations. No raw SQL strings or manual SQL migration files.
- Configure bounded connection pool, connection/idle timeouts, graceful shutdown and readiness check. Environment schema fails fast in production and has no silent secret defaults.
- Every tenant-owned entity has organization scope. Use composite references/constraints to ensure account, person, lead, conversation, opportunity, activity and campaign relationships share tenant.
- Database schema defines central enums/constants for state keys; maintain an explicit transition policy in domain service. History/audit is append-only where decisions matter.
- Use transactions for dedupe, ownership transfer, state transition, quota reservation and outbox write. Avoid a transaction spanning external network calls.

## Integrations and jobs

- Provider ports/adapters for Evolution, WhatsApp Business Cloud API, Twenty, Anthropic, speech-to-text and calendar. Keep provider DTOs at adapter boundary; map to internal domain types. Chatwoot is not a runtime integration; legacy exports may be supported only by import adapters.
- Apply explicit connect/read timeouts, bounded payload, response validation, rate limits, bounded retries/backoff and circuit breaker. A timeout after send is ambiguous; reconcile provider before retry.
- Queue/outbox payload is a reference, not authoritative identity. On execution, load current DB state and recheck tenant/membership/action policy.
- `organizationId` is included in job idempotency keys, logs and metrics; redact personal data from payloads/telemetry.
- `message requested`, `provider accepted`, `delivered` and `read` are distinct states. A provider API response is not automatically delivery confirmation.
- Use an internal worker in same backend codebase for long-running work. Introduce Redis/queue vendor only when selected deliberately; no request handler waits for AI/campaign batch completion.
