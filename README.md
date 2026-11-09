# Paanagam LocalBoost AI

**Standalone growth intelligence platform** for local businesses, with Paanagam (பானகம்) as the first pilot workspace.

LocalBoost has its own repository, backend, database, authentication and deployment lifecycle. It is separate from the Paanagam POS. The POS remains the system of record for orders, menu, recipes, inventory, payments and loyalty. LocalBoost may optionally consume privacy-safe, read-only POS summaries; it never needs a POS connection to run.

## Product modules
- Growth overview and daily priorities
- Local presence audit and local SEO
- Competitor intelligence based on dated public observations
- Read-only Google review import from selected verified profiles, plus private Tamil/English reply drafts
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
The current product includes an authenticated owner workspace, business workspaces, evidence provenance, audit snapshots, Google OAuth consent and account/listing selection, and read-only Business Profile evidence import. The growth workspace supports menu item records, owner-entered daily sales summaries, privacy-safe retention aggregates and campaign drafts. Records sync to the selected business's owner-scoped PostgreSQL API, with business-specific browser storage as an offline fallback. A data-status endpoint reports evidence provenance, source counts and freshness. These are owner-entered records, not POS imports. Competitor intelligence now groups owner-confirmed public profiles and compares repeated, dated observations of rating, review count and offers; it does not claim independent rankings or scrape competitor data. Tamil/English keyword ideas remain rules-generated with no measured volume or rank. Owner-supplied reviews can receive private Tamil/English reply drafts through an optional local Ollama model; email addresses and Indian mobile numbers are redacted before generation, and every reply must be reviewed and saved by the owner. Selected verified Google Business Profile reviews can be imported read-only; reviewer names and profile photos are not stored. Private reply drafts remain owner-reviewed and are never sent automatically. Review-theme analysis now groups saved review text with a transparent Tamil/English keyword heuristic, displays sample/date coverage and directional sentiment, and explains limitations; no unsupported claims or customer identities are generated. Google content drafts can now receive local Tamil/English post copy and a format-specific visual creative brief; the owner must verify and save the draft, then approve separately for manual publishing. The creative brief is not an image-generation result. Nothing is published or scheduled automatically. Google data depends on credentials, enabled APIs and granted access/quota.

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


## Optional private AI consultant on Windows

The Growth consultant can use a local Ollama model for Tamil/English explanations of the deterministic intelligence report. The local model does not replace evidence calculations or perform external actions. See [backend/README.md](backend/README.md) for Windows setup. This feature remains optional; the rules-based report works without Ollama.


### Growth Overview Intelligence
The authenticated business dashboard surfaces up to three evidence-backed growth priorities from saved reviews, daily sales, profile evidence and confirmed competitor observations. Each recommendation includes provenance, dates, calculation, confidence and owner-approval safeguards. Scores are not revenue forecasts; no external action is automatic.
