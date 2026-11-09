# Paanagam LocalBoost AI

**Standalone growth intelligence platform** for local businesses, with Paanagam (பானகம்) as the first pilot workspace.

LocalBoost has its own repository, backend, database, authentication and deployment lifecycle. It is separate from the Paanagam POS. The POS remains the system of record for orders, menu, recipes, inventory, payments and loyalty. LocalBoost may optionally consume privacy-safe, read-only POS summaries; it never needs a POS connection to run.

## Product modules
- Growth overview and daily priorities
- Local presence audit and local SEO
- Competitor intelligence based on verified observations
- Review intelligence based on real, authorised review data
- Menu and sales intelligence (optional POS aggregate feed)
- Customer retention and loyalty cohort analysis (privacy-safe aggregates)
- Tamil/English campaign and content studio
- Approval centre for all proposed external actions
- Evidence-grounded AI growth consultant

## Product principles
- Separate demo, owner-confirmed, POS-imported, Google API, public-observation, calculated and AI-suggested information.
- Never invent sales, food costs, reviews, ratings, rankings, competitor performance or customer behaviour.
- Show source, date range, freshness, calculation and limitations for every insight.
- Do not show unavailable metrics as zero.
- Require explicit owner approval before publishing, replying, messaging, editing a profile or applying an operational change.
- No POS write-back. No customer personal data in the first POS integration phase.

## Repository status
The current product includes an authenticated owner workspace, business workspaces, evidence provenance, audit snapshots, Google OAuth consent and account/listing selection, and read-only Business Profile evidence import. The dashboard still contains prototype/placeholder areas. AI orchestration and production hosting are not complete. Google data depends on credentials, enabled APIs and granted access/quota.

## Roadmap and integration
- Growth Intelligence delivery roadmap: docs/GROWTH_INTELLIGENCE_ROADMAP.md
- Paanagam POS read-only integration contract: docs/POS_INTEGRATION_CONTRACT.md
- Product blueprint: docs/PRODUCT_BLUEPRINT.md
- Backend setup and API documentation: backend/README.md

The POS contract is a proposal only. Do not build against assumed endpoints: the POS team must confirm and implement the versioned read-only export API first.

## Run locally
Open index.html for the static prototype. For the connected dashboard, follow backend/README.md, serve the repository root over HTTP, and use the API origin in config.js.

## Deployment
render.yaml is a deployment blueprint only. No hosting resources are provisioned by this repository update. Review provider pricing, secrets, backups and security requirements before deploying. Do not use a temporary free database for production/customer data.

## Security
Never commit API keys, OAuth client secrets, access tokens, customer personal data or production credentials. See the roadmap for production-readiness gates.
