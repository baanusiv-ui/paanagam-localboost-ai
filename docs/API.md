# LocalBoost API Guide

## Base URL and versioning

The backend exposes a health endpoint at `/health` and versioned application routes under `/v1`. Keep existing paths stable during the modular-monolith refactor. Deployments should provide the API base URL through environment configuration; do not hard-code a hosting provider URL in clients.

## Authentication

- Protected endpoints use a JWT access token in the HTTP header: `Authorization: Bearer <access-token>`.
- The current implementation issues short-lived access tokens (15 minutes).
- `POST /v1/auth/register` and `POST /v1/auth/login` are public authentication endpoints.
- `GET /v1/me` returns the authenticated user's profile.
- `GET /health` and the Google OAuth callback are public protocol endpoints.
- Treat expired or invalid access tokens as an authentication failure and obtain a new valid session through the currently supported login flow. Refresh-token rotation is not implemented in the inspected baseline.

## Tenant ownership

Business-scoped endpoints require an authenticated user and a business ID. The backend must verify that the authenticated user owns the requested business before reading or changing business data. Clients must not treat possession of a business ID as authorization.

Expected behavior:
- Missing or invalid bearer token: `401`.
- Business not owned by the authenticated user or not found: `404` in the current ownership-check pattern.
- Invalid request parameters or body: generally `400`.
- Rate-limited operation: `429`.
- External provider/configuration failures may return endpoint-specific `4xx` or `5xx` responses.

## Endpoint inventory

This inventory records the 42 routes present in `backend/src/server.ts`. The OpenAPI file now contains source-derived request/response contracts for the core identity, business workspace, evidence, and growth-record operations: `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/me`, `GET/POST /v1/businesses`, `GET/POST /v1/businesses/{businessId}/evidence`, and `GET/POST /v1/businesses/{businessId}/growth-records`. Remaining operations are currently route-index entries and must be completed from their Zod validation and actual response behavior before the OpenAPI file is treated as a complete client contract.

### Health and identity

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Process health check |
| POST | `/v1/auth/register` | Public | Register an account |
| POST | `/v1/auth/login` | Public | Authenticate and issue an access token |
| GET | `/v1/me` | Bearer | Read current user profile |

### Business workspaces and evidence

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/v1/businesses` | Bearer | List businesses accessible to the user |
| POST | `/v1/businesses` | Bearer | Create a business workspace |
| GET | `/v1/businesses/:businessId/data-status` | Bearer | Summarize available evidence and growth data |
| POST | `/v1/businesses/:businessId/evidence` | Bearer | Add business evidence |
| GET | `/v1/businesses/:businessId/evidence` | Bearer | List business evidence |
| POST | `/v1/businesses/:businessId/audits` | Bearer | Create an audit snapshot |
| GET | `/v1/businesses/:businessId/audits` | Bearer | List audit snapshots |

### Google Business Profile integration

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/v1/businesses/:businessId/google` | Bearer | Read Google connection status |
| POST | `/v1/google/connect/:businessId/url` | Bearer | Begin Google OAuth connection |
| GET | `/v1/businesses/:businessId/google/accounts` | Bearer | List available Google accounts |
| GET | `/v1/businesses/:businessId/google/locations` | Bearer | List available business locations |
| POST | `/v1/businesses/:businessId/google/import` | Bearer | Import selected Google Business Profile data |
| POST | `/v1/businesses/:businessId/google/reviews/import` | Bearer | Import reviews read-only |
| GET | `/v1/google/connect/:businessId` | Bearer | Start OAuth redirect flow |
| GET | `/v1/google/callback` | Public OAuth callback | Complete Google OAuth callback |

### Growth records, intelligence and reporting

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/v1/businesses/:businessId/growth-records` | Bearer | List growth records |
| POST | `/v1/businesses/:businessId/growth-records` | Bearer | Create or update an idempotently keyed growth record |
| DELETE | `/v1/businesses/:businessId/growth-records/:recordId` | Bearer | Delete a growth record |
| GET | `/v1/businesses/:businessId/intelligence` | Bearer | Build business intelligence from stored records |
| GET | `/v1/businesses/:businessId/menu-sales-intelligence` | Bearer | Build menu and sales intelligence |
| GET | `/v1/businesses/:businessId/growth-performance-report` | Bearer | Read growth performance report |
| GET | `/v1/businesses/:businessId/growth-overview` | Bearer | Build current growth overview |
| GET | `/v1/businesses/:businessId/growth-history` | Bearer | Read growth history |
| GET | `/v1/businesses/:businessId/activity-history` | Bearer | Read activity history |

### Goals, baselines and action tracking

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/v1/businesses/:businessId/growth-goals/history` | Bearer | Read growth goal history |
| GET | `/v1/businesses/:businessId/growth-baselines` | Bearer | List growth baselines |
| POST | `/v1/businesses/:businessId/growth-baselines` | Bearer | Create a growth baseline |
| DELETE | `/v1/businesses/:businessId/growth-baselines/:baselineId` | Bearer | Delete a growth baseline |
| GET | `/v1/businesses/:businessId/growth-goals` | Bearer | List growth goals |
| POST | `/v1/businesses/:businessId/growth-goals` | Bearer | Create a growth goal |
| DELETE | `/v1/businesses/:businessId/growth-goals/:goalId` | Bearer | Delete a growth goal |
| PATCH | `/v1/businesses/:businessId/growth-overview/:actionId` | Bearer | Update tracking status for a suggested action |

### Reviews, content, local SEO and AI

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/v1/businesses/:businessId/reviews/themes` | Bearer | Analyze stored review themes |
| POST | `/v1/businesses/:businessId/reviews/reply-draft` | Bearer | Generate a review reply draft; does not publish |
| POST | `/v1/businesses/:businessId/google-content/draft` | Bearer | Generate Google content draft; does not publish |
| POST | `/v1/businesses/:businessId/local-seo/keywords` | Bearer | Generate locality keyword suggestions |
| POST | `/v1/businesses/:businessId/consultant` | Bearer | Generate advisory business analysis |
| GET | `/v1/ai/status` | Bearer | Read local AI provider status |

## Integration and data-safety rules

- Google Business Profile imports are ingestion operations. Review import is explicitly read-only: it must not send, edit or publish review replies.
- Draft-generation endpoints produce drafts only. They do not publish content.
- Growth records are scoped to a business and use a composite external identifier for idempotent upsert behavior.
- Keep deterministic calculations and source/provenance metadata separate from AI-generated commentary.
- Paanagam POS is a separate system of record. Any POS connector must be separately authorized, tenant-scoped, auditable and read-only in its initial release. Do not connect directly to the POS database and do not write back to POS.
- Never put access tokens, OAuth secrets, encryption keys or database credentials in this document, source control or client applications.

## Rate limits

The server has a global limit of 100 requests per minute. The implementation also applies stricter route-specific limits to selected AI/draft and external-import operations. Confirm the exact route-level limit in source before designing client retry behavior; respect HTTP 429 responses and avoid aggressive retries.

## Error handling

Clients should handle JSON error responses without depending on the exact wording of the `error` message. The server's global error handler returns a generic internal-server-error response for unhandled failures. Log a request/correlation identifier when one is available, but do not log bearer tokens, OAuth credentials or sensitive payloads.

## Contract maintenance

The OpenAPI document is the machine-readable API contract. For each remaining route, add exact path/query/body schemas, success response schemas, and endpoint-specific error responses from the implementation. Do not infer request schemas from route names. Update the OpenAPI file and this guide in the same change as any API behavior change. CI runs `npm run api:check` to validate the OpenAPI structure, route count, path parameters, and local references; this structural check does not replace source-level schema review.
