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
- `GET /v1/businesses/:businessId/google` — safe connection status; never returns tokens.
- `POST /v1/google/connect/:businessId/url` — return an OAuth URL for browser navigation.
- `GET /v1/businesses/:businessId/google/accounts` — list Google accounts accessible to the owner.
- `GET /v1/businesses/:businessId/google/locations?accountName=accounts%2F...` — list locations in the selected account.
- `POST /v1/businesses/:businessId/google/import` — import evidence from the explicitly selected listing.
- `GET /v1/google/connect/:businessId` — legacy redirect-based OAuth start.
- `GET /v1/google/callback` — OAuth callback.

## Evidence rules

Evidence source values: `OWNER_CONFIRMED`, `PUBLIC_OBSERVATION`, `DEMO`, and internally ingested `GOOGLE_API`.

Manual evidence submission must never be allowed to impersonate the Google API source. Demo evidence is never verified. Public observations are not independently verified. The audit completeness value measures checklist coverage only; it is not a ranking, visibility, traffic or performance score.

## Google OAuth configuration

Create a Google Cloud OAuth web application and configure the exact redirect URI from `GOOGLE_REDIRECT_URI`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the deployment secret manager or local ignored `.env`.

The requested scope is `https://www.googleapis.com/auth/business.manage`. The OAuth flow uses state validation and PKCE. Tokens are encrypted at rest with AES-256-GCM. The callback stores credentials. The dashboard then requires the owner to select the correct Google account and exact business listing before read-only profile evidence is imported. OAuth consent alone does not guarantee API access.

## Important limitations

- This is an initial backend foundation, not a production launch.
- No email verification, password reset, refresh-token rotation, multi-factor authentication, or formal security audit is implemented yet.
- Add HTTPS, managed database backups, secret rotation, monitoring, and a deployment-specific CORS allowlist before production.
- Never commit secrets or real customer data.


## Google Business Profile read-only import

After OAuth, the dashboard asks the owner to choose the correct Google account and then the exact Paanagam listing. The API checks that the account and selected location are accessible to the connected Google user before importing fields from the official Account Management and Business Information APIs.

Imported evidence can include the Google-provided business title, primary category, storefront address, primary phone, website URL and regular hours. Values are saved with source `GOOGLE_API`, an observation timestamp and the selected location resource name. The import does not modify the Google profile, publish content, reply to reviews, or change listing information.

Google's official documentation:
- Account Management API accounts.list: https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- Business Information API accounts.locations.list: https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list

The Google Business Profile APIs may require separate API enablement and access approval. If the project has zero quota, Google instructs developers to request Business Profile API access. A successful OAuth consent by itself does not guarantee API access.
