# Paanagam LocalBoost AI

Local business growth intelligence platform — Paanagam pilot.

## Current status
This repository contains the first frontend prototype. All displayed business metrics and audit findings are clearly labelled **demo data** until an authorised Google Business Profile connection or verified owner-provided data source is configured.

## Product principles
- Public audit mode is separate from authorised connected-business mode.
- Never invent Google Business Profile metrics, reviews, rankings, or competitor performance.
- Clearly label public observations, owner-entered information, demo data, and AI-generated suggestions.
- Require explicit owner approval before profile edits, review replies, publishing, or outbound communication.
- Use official Google APIs and follow their terms and applicable privacy requirements.

## Pilot scope
- Business overview dashboard
- Local presence audit checklist
- Competitor intelligence workspace
- Review intelligence workspace
- Content studio draft workspace
- Approval-first activity workflow

## Run locally
Open `index.html` in a modern browser. This prototype uses static demo data and does not connect to Google or any external service.

## Planned architecture
See [docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md).

## Security
Never commit API keys, OAuth client secrets, access tokens, customer personal data, or production credentials.


## Backend foundation

The API lives in [backend/](backend/). It includes owner authentication, business workspaces, evidence provenance, audit snapshots, Google OAuth consent flow, encrypted token storage, PostgreSQL migrations, and CI checks.

See [backend setup and API documentation](backend/README.md) before running it locally.

**Current stage:** the dashboard is connected to the authenticated API. Owner onboarding, evidence-based audits, Google OAuth, explicit Google account/listing selection, and read-only Business Profile evidence import are implemented. Actual Google data availability still depends on configuring credentials, enabling the required APIs, and receiving Google Business Profile API access/quota. AI model orchestration and production hosting are still pending.


## Run the connected pilot locally

1. Start the API and PostgreSQL by following [backend/README.md](backend/README.md). For Docker Compose, create `backend/.env` from `backend/.env.example`, then run `docker compose up --build` from the `backend` folder.
2. Serve the repository root over HTTP (for example, `python -m http.server 5500`); do not open `index.html` as a `file://` URL.
3. Open the local dashboard at `http://localhost:5500`. The default API origin in `config.js` is `http://localhost:4100`.
4. Create an owner account, sign in, and save the Paanagam business workspace.
5. Run an audit to create a live snapshot from the evidence saved to your account.

For hosting, set `window.LOCALBOOST_API_BASE` in `config.js` to the HTTPS API origin and configure the API's `CORS_ORIGIN` and `APP_BASE_URL` to the exact dashboard origin. Add Google OAuth credentials only through the backend host's secret manager; never commit them.


## Render deployment blueprint

The repository includes [render.yaml](render.yaml) for a Singapore-region Render pilot:
- Docker-based Fastify API with a health check at `/health`.
- Managed PostgreSQL database.
- Static dashboard hosted separately from backend source files.
- Database migrations run before the API process starts.
- Dashboard API origin is injected during the static-site build.
- Google OAuth credentials, JWT signing secret and token-encryption key are configured as Render environment secrets, never committed.

### Deploy

1. Import this GitHub repository into Render as a Blueprint and select `render.yaml`.
2. Review the resources and their current prices before applying. The blueprint currently uses free plans for an initial pilot only; free Render Postgres is temporary and must not hold production/customer data. Upgrade the database to a paid plan with backups before real use.
3. Enter `JWT_SECRET` as a cryptographically random value of at least 32 characters.
4. Enter `TOKEN_ENCRYPTION_KEY_BASE64` as the Base64 encoding of exactly 32 random bytes (for example, generate it locally with `openssl rand -base64 32`). Keep a secure offline backup; changing it makes previously encrypted Google tokens unreadable.
5. Leave Google OAuth credentials blank until Google Cloud is configured. When ready, set the OAuth web-client ID and secret in Render and register this exact redirect URI in Google Cloud: `https://paanagam-localboost-api.onrender.com/v1/google/callback`.
6. Confirm the dashboard and API service URLs match the names in `render.yaml`. If Render assigns different subdomains, update the API's `CORS_ORIGIN` and `APP_BASE_URL`, and update the dashboard build API origin in `render.yaml`.
7. After deployment, verify `https://paanagam-localboost-api.onrender.com/health`, create an owner account, create the Paanagam workspace, and run an audit using verified evidence only.

**Deployment status:** Blueprint committed; no Render resources have been created yet. Render account authorisation and review of any paid plan costs are required before resources can be provisioned. Do not use the free database for production data.
