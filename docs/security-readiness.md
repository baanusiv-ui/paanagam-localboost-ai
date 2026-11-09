# LocalBoost Security Readiness Review

**Scope:** Static review of the current Fastify backend and repository configuration. This is not a penetration test, formal security audit, or production approval.

## Verified controls in the current code

- Passwords are hashed and verified with Argon2id in `backend/src/security.ts`.
- Access tokens are signed with HS256 and expire after 15 minutes.
- The environment schema requires a JWT secret of at least 32 characters.
- Google OAuth tokens are encrypted with AES-256-GCM; the configured encryption key must decode to exactly 32 bytes.
- Fastify Helmet is enabled.
- CORS accepts only configured origins from `CORS_ORIGIN`.
- A global rate limit of 100 requests per minute is configured, with stricter limits on selected generation endpoints.
- Every currently registered business-scoped route in `server.ts` has the `requireUser` pre-handler. A CI static check now enforces this for discovered route registrations.
- Business ownership resolution is centralized in `modules/businesses/access.ts`, using both business ID and authenticated owner ID.
- Evidence submitted by a client cannot claim the trusted Google API source; the route rejects that source and rejects invalid verification claims for demo/public observations.
- Draft endpoints generate content but do not publish it. Google review import is an ingestion flow, not a reply-publishing operation.

## Gaps to close before production

1. **Account lifecycle:** Email verification, password reset, refresh-token rotation/session revocation, and MFA are not implemented in the inspected baseline.
2. **Tenant integration tests:** Add database-backed tests proving user A cannot read, update, archive, delete, or import data for user B across every business-scoped resource. The current CI guard checks authentication registration and unit tests the shared owner lookup; it does not replace full route-level authorization tests.
3. **OAuth lifecycle:** Add dedicated tests for state expiry, one-time state consumption, callback error paths, account/business binding, and token refresh/revocation.
4. **Operational security:** Configure production-only CORS origins, HTTPS and secure proxy settings, managed database backups and restore drills, secret rotation, monitoring, alerting, and incident response.
5. **Dependency and supply-chain controls:** Add dependency scanning, lockfile review, and a scheduled vulnerability review.
6. **Repository governance:** Main branch protection is currently disabled. Enable required CI checks and restrict direct pushes before multiple developers or production changes are involved.
7. **API contract:** Complete source-derived OpenAPI request and response schemas for all remaining routes. The current CI validator checks structure and references, not semantic equivalence with every Zod schema.

## Integration boundary

Paanagam POS remains a separate system of record. The LocalBoost POS connector must be independently authorized, tenant-scoped, audited, and read-only in its initial release. Do not connect directly to the POS database or write data back to POS.

## Release decision

**Not production-ready based on this review.** Keep deployment disabled until the tenant integration tests, account lifecycle controls, OAuth tests, operational safeguards, API contract completion, and an independent security review are addressed. No production deployment was performed as part of this review.
