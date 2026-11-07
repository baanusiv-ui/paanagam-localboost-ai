# LocalBoost API

Fastify + TypeScript + Prisma + PostgreSQL API foundation.

## Local setup

Requirements: Node.js 20+, npm, Docker Desktop.

1. Copy `.env.example` to `.env`.
2. Generate a JWT secret and a 32-byte encryption key:
   ```bash
   openssl rand -base64 48
   openssl rand -base64 32
   ```
   Put the first value in `JWT_SECRET` and the second in `TOKEN_ENCRYPTION_KEY_BASE64`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Install dependencies: `npm install`.
5. Generate Prisma client: `npm run db:generate`.
6. Apply migrations: `npm run db:deploy`.
7. Start the API: `npm run dev`.

Health check: `GET http://localhost:4100/health`.

## API

All routes except health, registration, login and the Google OAuth callback require `Authorization: Bearer <accessToken>`.

- `POST /v1/auth/register` — create owner account. Password minimum: 12 characters.
- `POST /v1/auth/login` — login; access tokens expire after 15 minutes.
- `GET /v1/me` — current account.
- `GET /v1/businesses` — list businesses owned by the current user.
- `POST /v1/businesses` — create a business workspace.
- `POST /v1/businesses/:businessId/evidence` — add attributed evidence.
- `GET /v1/businesses/:businessId/evidence` — list evidence.
- `POST /v1/businesses/:businessId/audits` — create an evidence-based audit snapshot.
- `GET /v1/businesses/:businessId/audits` — list audit snapshots.
- `GET /v1/google/connect/:businessId` — begin Google OAuth.
- `GET /v1/google/callback` — OAuth callback.

## Evidence rules

Evidence source values: `OWNER_CONFIRMED`, `PUBLIC_OBSERVATION`, `DEMO`, and internally ingested `GOOGLE_API`.

Manual evidence submission must never be allowed to impersonate the Google API source. Demo evidence is never verified. Public observations are not independently verified. The audit completeness value measures checklist coverage only; it is not a ranking, visibility, traffic or performance score.

## Google OAuth configuration

Create a Google Cloud OAuth web application and configure the exact redirect URI from `GOOGLE_REDIRECT_URI`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the deployment secret manager or local ignored `.env`.

The requested scope is `https://www.googleapis.com/auth/business.manage`. The OAuth flow uses state validation and PKCE. Tokens are encrypted at rest with AES-256-GCM. The callback stores credentials but does not yet import profile locations or insights. That requires the next integration milestone, API access approval, and explicit owner authorisation.

## Important limitations

- This is an initial backend foundation, not a production launch.
- No email verification, password reset, refresh-token rotation, multi-factor authentication, or formal security audit is implemented yet.
- Add HTTPS, managed database backups, secret rotation, monitoring, and a deployment-specific CORS allowlist before production.
- Never commit secrets or real customer data.
