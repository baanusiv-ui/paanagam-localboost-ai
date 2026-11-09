# LocalBoost Backend Architecture

## Decision

LocalBoost remains an independent modular-monolith application. Keep the existing Fastify + TypeScript + Prisma + PostgreSQL stack. Do not migrate to NestJS or split into microservices in this phase.

Render is an optional hosting provider, not an architectural dependency. The application must remain deployable to any compatible Node.js/Docker host.

## Current verified baseline

- API runtime: Fastify 5
- Language/runtime: TypeScript, Node.js 20+
- Database: PostgreSQL
- ORM: Prisma 6
- Request validation: Zod
- Authentication: Argon2id password hashes and 15-minute JWT access tokens
- Security middleware: Helmet, CORS allowlist, rate limiting
- Optional private AI: Ollama adapter restricted to local/host-gateway URLs
- Container support: Dockerfile and local PostgreSQL compose file
- CI: Prisma validation/client generation, TypeScript build, backend tests, OpenAPI structural checks, tenant-route guard checks and dashboard syntax checks
- Inspected API route inventory: 42 routes under /health and /v1

## Implementation progress on main

The first incremental module extractions are present:

- `modules/identity/auth.ts`: bearer authentication pre-handler with an injected token verifier.
- `modules/businesses/access.ts`: owner-scoped business lookup.
- `modules/activity/record.ts`: shared business activity event writer.

The existing server delegates to these modules. Route handlers remain in `server.ts` for now; they will be moved in small domain-by-domain changes only after tests protect existing behavior. CI includes the backend test suite, OpenAPI structural validation and a static guard requiring authentication on discovered business-scoped route registrations.

## Target module boundaries

Keep one deployable API process and one PostgreSQL database. Organize code by business capability, with explicit module interfaces and no cross-module database access where avoidable.

1. Platform: configuration, logging, error handling, health/readiness and request IDs.
2. Identity and access: registration, login, access-token verification and authorization policies.
3. Business workspaces: business ownership, tenant-scoped access and business profile.
4. Evidence and audits: evidence provenance, expiry and audit snapshots.
5. Growth intelligence: deterministic calculations, menu/sales intelligence, growth overview and reports.
6. Actions and goals: action lifecycle, baselines, goals, activity history and measurement.
7. Reviews and reputation: review theme analysis, reply drafts and review imports.
8. Content and local SEO: content drafts, keyword suggestions and campaign draft records.
9. External integrations: Google Business Profile OAuth, token encryption and read-only imports.
10. AI orchestration: provider interface, local Ollama adapter, prompts, model status and usage limits.
11. POS connectors: separately permissioned, documented, initially read-only ingestion adapters.

## Suggested source layout

```text
backend/src/
  platform/
  modules/
    identity/
    businesses/
    evidence/
    audits/
    growth/
    actions/
    goals/
    reviews/
    content/
    local-seo/
    integrations/google-business-profile/
    ai/
    pos-connectors/
  shared/
  server.ts
```

This is a target layout, not a mandate to move every file at once. Refactor incrementally, preserving public routes and behavior.

## Non-negotiable boundaries

- LocalBoost owns its database, users, business workspaces, records and business logic.
- Paanagam POS remains a separate system of record.
- Do not connect directly to the POS database.
- Any initial POS connector must be read-only, explicitly authorized, tenant-scoped, auditable and idempotent.
- No POS writeback, POS production-data mutation, campaign publishing or external account changes without separate explicit approval.
- Never store secrets in source control. Use environment variables or a deployment secret manager.
- Never claim owner-entered/demo/public-observation data is verified third-party data.
- Keep deterministic calculations separate from AI-generated explanations and recommendations.
- AI output is advisory; human approval is required before consequential actions.
- No production deployment as part of architecture refactoring.

## API contract

- Preserve existing /health and /v1/* paths during the first refactor.
- Add and maintain docs/openapi.json as the machine-readable API contract.
- Add and maintain docs/API.md as the developer guide.
- Document authentication, tenant ownership, request/response schemas, error codes, rate limits, provenance and read-only integration semantics.
- Generate or validate the OpenAPI contract from route schemas where practical; avoid conflicting hand-written contracts.

## Delivery sequence

1. Baseline audit and route/schema inventory.
2. Add API contract and architecture documentation without changing runtime behavior.
3. Extract shared platform concerns and route registration from the oversized server entry point.
4. Extract one feature module at a time, preserving route paths and behavior.
5. Add integration tests for tenant isolation, authentication and read-only POS connector boundaries.
6. Re-run Prisma validation, TypeScript build, full backend tests and dashboard syntax checks.
7. Commit approved incremental changes directly to the main branch as requested. Run CI and review each change before proceeding. Do not deploy without separate explicit approval.

## Current risks / gaps to address before production

- backend/src/server.ts currently contains approximately 1,274 lines and 42 route registrations; route handlers and infrastructure are too concentrated.
- The OpenAPI route inventory now exists, but detailed request/response schemas are complete only for core identity, business workspace, evidence and growth-record routes. Complete the remaining route contracts.
- The backend README explicitly identifies missing email verification, password reset, refresh-token rotation, MFA and a formal security audit.
- Production operations still need HTTPS enforcement, managed database backups, secret rotation, monitoring/alerting and a deployment-specific CORS allowlist.
- Verify tenant isolation and authorization for every business-scoped route with negative tests before production.
- Validate Google Business Profile access/quota and OAuth configuration in the intended deployment environment; OAuth consent alone does not prove API access.

## Verification baseline

Repository inspected: baanusiv-ui/paanagam-localboost-ai

Inspected branch: main

Inspected commit: bd7dc094fccafdae889c37cb576527a0ac04e04e

This document records architecture and incremental implementation progress. It does not claim a production deployment.
