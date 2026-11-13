# LocalBoost API

Fastify + TypeScript + Prisma + PostgreSQL API foundation. Neon Auth (Managed Better Auth) owns user sign-in; the API validates Neon-issued JWTs against the branch JWKS and maps the Neon subject to a LocalBoost owner record.

## Local setup

Requirements: Node.js 20+, npm, Docker Desktop.

1. Copy `.env.example` to `.env`. For local Docker PostgreSQL, keep both `DATABASE_URL` and `DIRECT_URL` pointed at the local database.
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

All business API routes except health and the Google OAuth callback require `Authorization: Bearer <Neon Auth access token>`. The dashboard uses the official `@neondatabase/auth` browser SDK and email verification OTP; the API verifies the token signature and issuer with the branch JWKS and also checks the corresponding `neon_auth.user.emailVerified` record. LocalBoost never stores Neon Auth passwords or session tokens in PostgreSQL.

- `POST /v1/auth/register` — create owner account. Password minimum: 12 characters.
- `POST /v1/auth/login` — login; access tokens expire after 15 minutes.
- `GET /v1/me` — current account.
- `GET /v1/businesses` — list businesses owned by the current user.
- `POST /v1/businesses` — create a business workspace.
- `POST /v1/businesses/:businessId/evidence` — add attributed evidence.
- `GET /v1/businesses/:businessId/evidence` — list evidence.
- `POST /v1/businesses/:businessId/audits` — create an evidence-based audit snapshot.
- `GET /v1/businesses/:businessId/audits` — list audit snapshots.
- `GET /v1/businesses/:businessId/intelligence` — generate a tenant-scoped, evidence-linked report from owner-entered menu, sales and retention records.
- `GET /v1/ai/status` — check Ollama Cloud, optional local Ollama, and Gemini fallback readiness.
- `POST /v1/businesses/:businessId/consultant` — generate an optional AI explanation from the deterministic report using Ollama Cloud with Gemini fallback; supported languages are Tamil, English and Tamil + English. Limited to five requests per minute per API instance.
- `POST /v1/businesses/:businessId/reviews/reply-draft` — generate a private Tamil/English review reply using Ollama Cloud with Gemini fallback. Body: `reviewText`, optional `rating`, `language`, and `tone` (`WARM`, `PROFESSIONAL`, `APOLOGETIC`). Limited to five requests per minute per API instance; requires the authenticated owner of the business.
- `POST /v1/businesses/:businessId/google-content/draft` — generate Google post copy and a visual creative brief using Ollama Cloud with Gemini fallback. Body: `topic`, optional `offer` and `publishDate`, `language`, `format` (`SQUARE`, `PORTRAIT`, `STORY`), and `tone` (`WARM`, `TRADITIONAL`, `OFFER_LED`). Limited to five requests per minute per API instance; requires the authenticated owner of the business.
- `GET /v1/businesses/:businessId/data-status` — return owner-scoped evidence/growth source counts, latest timestamps, expired evidence count and Google connection metadata without exposing credentials.\n- `GET /v1/businesses/:businessId/growth-records?type=MENU_ITEM&limit=100` — list owner-entered growth records for the selected business. Supported types: `MENU_ITEM`, `DAILY_SALES`, `RETENTION_SNAPSHOT`, `CAMPAIGN_DRAFT`, `COMPETITOR`, `LOCAL_KEYWORD`, `REVIEW_ITEM`, `GOOGLE_CONTENT`.
- `POST /v1/businesses/:businessId/growth-records` — create or idempotently upsert a record using `type`, client-generated `externalId`, JSON `payload`, and optional `recordedAt`.
- `DELETE /v1/businesses/:businessId/growth-records/:recordId` — delete one record belonging to the selected business.
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

## Neon Auth configuration\n\nNeon Auth is provisioned on the production branch using Managed Better Auth. The dashboard public configuration points to the branch Auth URL; this URL is an endpoint identifier, not a secret. Add every deployed dashboard origin to the Neon Auth trusted-domain allowlist. The API uses `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` (defaults are set to this project's production branch) to validate short-lived access tokens with `jose`. Never accept the legacy LocalBoost HS256 token as an API credential.\n\nOn first authenticated API request, the verified Neon subject is linked to an existing LocalBoost owner by exact email match or creates a new owner record. Existing `Business` rows and their owner IDs are retained. If an email is already linked to a different Neon subject, the API rejects the request instead of reassigning ownership.\n\n## Google OAuth configuration

Create a Google Cloud OAuth web application and configure the exact redirect URI from `GOOGLE_REDIRECT_URI`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the deployment secret manager or local ignored `.env`.

The requested scope is `https://www.googleapis.com/auth/business.manage`. The OAuth flow uses state validation and PKCE. Tokens are encrypted at rest with AES-256-GCM. The callback stores credentials. The dashboard then requires the owner to select the correct Google account and exact business listing before read-only profile evidence is imported. OAuth consent alone does not guarantee API access.

## Important limitations

- This is an initial backend foundation, not a production launch.
- No email verification, password reset, refresh-token rotation, multi-factor authentication, or formal security audit is implemented yet.
- Add HTTPS, managed database backups, secret rotation, monitoring, and a deployment-specific CORS allowlist before production.
- Never commit secrets or real customer data.


## Private Google post and creative brief drafting

The Google content draft endpoint uses the shared hybrid AI provider chain. It generates editable post copy and a designer-facing visual brief from the business name and owner-supplied topic/offer. The model is instructed not to invent prices, discounts, availability, hours, ingredients or other business facts. The selected format is guidance only; no image is generated by this endpoint. The dashboard saves the draft only when the owner submits the form to the content calendar. Approval remains a separate manual step, and no post is scheduled or published.

## Private review reply drafting

The review reply endpoint uses the shared hybrid AI provider chain. The review text is supplied by the owner and is not stored by the generation endpoint. Email addresses and Indian mobile numbers are redacted before the prompt is sent to Ollama. The model is instructed not to invent business facts, offers, compensation, opening hours or contact details. The generated reply is returned as an editable draft; the dashboard requires the owner to review and explicitly save it to the business-scoped `REVIEW_ITEM` record. The endpoint never sends a reply to Google and does not publish or schedule anything. Live Google review import remains unavailable until authorised API access is implemented.

## Google Business Profile read-only import

After OAuth, the dashboard asks the owner to choose the correct Google account and then the exact Paanagam listing. The API checks that the account and selected location are accessible to the connected Google user before importing fields from the official Account Management and Business Information APIs.

Imported evidence can include the Google-provided business title, primary category, storefront address, primary phone, website URL and regular hours. Values are saved with source `GOOGLE_API`, an observation timestamp and the selected location resource name. The import does not modify the Google profile, publish content, reply to reviews, or change listing information.

Google's official documentation:
- Account Management API accounts.list: https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- Business Information API accounts.locations.list: https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list

The Google Business Profile APIs may require separate API enablement and access approval. If the project has zero quota, Google instructs developers to request Business Profile API access. A successful OAuth consent by itself does not guarantee API access.

## Growth record storage

Growth records are stored in LocalBoost's own PostgreSQL database and are scoped to a business owned by the authenticated account. The unique key `(businessId, recordType, externalId)` makes client retries idempotent. Each record is marked `OWNER_ENTERED`; this is not a POS import. Payloads are limited to 64 KB and must not contain customer personal data, payment credentials, or secrets. Menu, sales, retention and campaign data remain manually entered until a separately approved, documented read-only POS export is available. These endpoints do not write to Paanagam POS and do not publish campaign drafts. The authenticated PostgreSQL API is the source of truth. The browser does not persist business records or silently fall back to local storage when the API is unavailable. A one-time, owner-confirmed migration can import legacy records from the original PC; duplicate external IDs are skipped and existing local copies are not deleted. The data-status endpoint reports provenance and freshness summaries; it does not guarantee that an external Google token remains valid or that API quota is available. The intelligence report is deterministic rules-based arithmetic, not an AI-generated forecast; it includes evidence IDs, calculations, confidence and owner-approval requirements.

## Hybrid AI provider (Render and local development)

The Growth consultant, review reply assistant and Google content draft use a shared server-side provider chain: Ollama Cloud first, optional local Ollama second (when configured), and Gemini as the final fallback. Render calls Ollama Cloud directly over HTTPS; no Windows PC, local tunnel or exposed Ollama port is required. The consultant sends only the deterministic intelligence report (findings, calculations and evidence record IDs) to the local model; it does not send Google tokens, customer identities, passwords or raw database credentials. The review assistant sends the owner-supplied review text after redacting email addresses and Indian mobile numbers. It returns an editable draft only. Neither feature publishes content, sends replies, alters records automatically or executes recommendations.

1. Create an Ollama API key in your Ollama account and add it to Render as `OLLAMA_API_KEY`. Never place it in browser code, GitHub, screenshots or chat.
2. Set `OLLAMA_CLOUD_MODEL` to a model name returned by `https://ollama.com/api/tags`. The initial default in the example environment is `gemma4:31b`; verify that it is available to your account before use.
3. Add `GEMINI_API_KEY` to Render as the fallback credential. Keep it server-side.
4. Optionally set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` for a private local Ollama fallback during development. Leave the local URL empty on Render unless a private reachable endpoint is intentionally configured.
5. Sign in and open Growth consultant, Review replies and Google content drafts. `GET /v1/ai/status` reports provider readiness and the selected model without returning credentials.

The provider chain is Ollama Cloud → optional local Ollama → Gemini. If all configured providers fail, the endpoint returns a controlled 503. Deterministic intelligence calculations remain unchanged. All model output is schema-validated, and owner approval is still required before saving or publishing. Ollama Cloud processes prompts and responses to provide inference; review text is redacted before it is sent to any provider. Do not include passwords, API credentials, customer identities or unnecessary personal data in prompts.

## Neon PostgreSQL connection

The API uses Neon's standard PostgreSQL connection strings without changing the existing Fastify or Prisma architecture:

- `DATABASE_URL`: pooled connection string (hostname includes `-pooler`) for normal API traffic.
- `DIRECT_URL`: direct/unpooled connection string (hostname does not include `-pooler`) for Prisma migrations and direct database administration.

Keep both values in the local ignored `.env` file or the hosting provider's secret/environment-variable manager. Never commit actual connection strings or paste them into source files. The checked-in `render.yaml` declares both as unsynchronized secrets; set them in the Render dashboard after retrieving them from the selected Neon project. The app config is prepared for the existing Neon project, but the actual secret values have not yet been retrieved or configured.

## Cloud deployment safety

The checked-in Render Blueprint is a **manual-deploy pilot template**, not a provisioned environment. Automatic deploys are disabled. It no longer provisions a Render PostgreSQL database; the API expects the Neon connection strings to be supplied as deployment secrets. No service has been deployed and no production/customer data has been imported. Keep the Free Neon project for preview/testing only until backup, restore, access control, and production retention requirements are confirmed.
