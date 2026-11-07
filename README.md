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

**Current stage:** backend foundation and OAuth consent storage only. Google profile/location data import, AI model orchestration, production hosting, and frontend-to-API integration are not yet complete.
