# LocalBoost Security Readiness Review

**Scope:** Source-based static review of the production-branch Fastify backend, dashboard authentication integration and repository CI configuration. This is not a penetration test, independent security audit, or blanket production approval. Deployment status and release readiness are separate questions.

## Verified implementation controls

- Production owner authentication is delegated to Neon Auth. The API verifies signed access tokens against the configured Neon Auth issuer and remote JWKS.
- After token verification, the API checks the matching `neon_auth.user` row, requires a verified email, and maps the external subject to a LocalBoost user.
- Legacy Argon2id password helpers and HS256 token issuance remain in `backend/src/security.ts` for legacy tests. The production server does not register the legacy `/v1/auth/register` or `/v1/auth/login` handlers.
- `JWT_SECRET` remains required by the environment schema because the legacy HS256 helper is initialized in the shared security module. It is not the production Neon Auth signing key. This unused production requirement is technical debt; remove it only after legacy test dependencies are safely separated.
- Provider secrets stored by the backend use AES-256-GCM; the encryption key must decode to exactly 32 bytes.
- Fastify Helmet is enabled. CORS is restricted to configured `CORS_ORIGIN` entries.
- Fastify rate limiting is configured globally at 300 requests per minute, with stricter per-route overrides on selected sensitive operations.
- Business-scoped routes are registered with the `requireUser` pre-handler. This confirms authentication is required; it does not, by itself, prove tenant authorization.
- Business ownership checks use the authenticated LocalBoost user ID and business ID through the shared ownership helper in `modules/businesses/access.ts`.
- Draft-generation and review-import operations are distinct from publishing. External publishing flows require an explicit owner action and are not triggered by draft generation.
- Paanagam POS integration is a separately keyed, encrypted-credential, read-only import boundary. The connector imports menu and daily sales data into LocalBoost; it does not write back to POS.

## Remaining release-readiness gaps

1. **Tenant isolation proof:** Current CI includes a source-level route guard and unit tests for the shared ownership helper. It does not yet provide database-backed, route-by-route cross-tenant tests for read, create, update, delete, export, import and retention operations. Add isolated test-database coverage before treating tenant isolation as proven.
2. **OAuth lifecycle coverage:** Add tests for Google and Meta OAuth state expiry, one-time state use, callback errors, account/business binding, token refresh, disconnect and revoked-provider behavior. Do not use live customer accounts as test fixtures.
3. **Neon Auth lifecycle assurance:** Neon Auth owns verification, recovery, session refresh/revocation and MFA. Verify the production provider configuration and document the enabled recovery and MFA policy; these controls are not implemented by LocalBoost's legacy identity routes.
4. **Operational security evidence:** Confirm production-only CORS origins, HTTPS/proxy behavior, database backup retention and restore drills, encryption-key rotation procedure, alerting, log retention and incident response ownership. Source inspection alone cannot establish these operational controls.
5. **Dependency and supply-chain controls:** Add automated dependency/security scanning and a documented remediation cadence. Review lockfile and CI action pinning.
6. **Repository governance:** Branch-protection status could not be verified with the current GitHub integration permissions. Confirm required checks and restrict direct pushes using an authorized repository-admin path. Do not assume protection is enabled or disabled.
7. **API contract completeness:** The OpenAPI validator checks structure, route counts/path parameters and local references; it does not prove semantic parity with every route's Zod schema and response. Complete source-derived schemas and add contract tests.
8. **External integration verification:** No live end-to-end verification was performed here for Google Business Profile, Meta publishing, Canva, PoYo paid generation or the Paanagam POS connector. Confirm each provider in a controlled owner-approved test. No paid generation or external publishing should be triggered as part of a passive audit.
9. **Unused legacy auth configuration:** `JWT_SECRET` and legacy password/token code remain even though production owner authentication uses Neon Auth. Remove the dead path in a separately tested change, not by changing production auth semantics during a documentation correction.

## Production status versus readiness

The production dashboard and API have previously been observed deployed and serving health checks. That proves deployment/availability at the time checked; it does not establish full SaaS release readiness or the operational controls listed above. The production services are not independently security-certified by this review.

## Evidence required before declaring all gaps closed

- Automated isolated-database tests proving cross-tenant denial for every business-scoped route and related child resource.
- OAuth lifecycle tests and controlled provider connection/disconnection verification.
- Confirmed Neon Auth recovery, session and MFA settings.
- Backup restore evidence, monitoring/alerting checks, incident response ownership and key rotation procedure.
- Dependency scan results and repository governance confirmation.
- OpenAPI/source contract parity tests.
- Controlled end-to-end verification of each enabled external integration, without publishing or spending credits without owner approval.
