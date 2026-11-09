# Growth Intelligence delivery roadmap

## Product position
Paanagam LocalBoost is a standalone, multi-business growth intelligence platform. Paanagam is its first pilot workspace. It is not a POS replacement, POS module, or dependency of the Paanagam POS. The product may optionally connect to Paanagam POS through the read-only contract in POS_INTEGRATION_CONTRACT.md.

## Product modules
| Module | Purpose | Required evidence |
|---|---|---|
| Growth overview | Daily priorities, progress, verified signals | Connected or owner-provided sources |
| Local presence | Business profile completeness and local SEO actions | Owner-confirmed details and authorised Google data |
| Competitor intelligence | Compare visible positioning and offers | Verified competitor identities and dated public observations |
| Review intelligence | Themes, recurring issues and response drafts | Actual supplied or authorised reviews |
| Menu intelligence | Menu mix, item performance, contribution | POS item sales; cost snapshots where available |
| Customer retention | Repeat-visit and loyalty cohort analysis | Privacy-safe aggregate POS data |
| Campaign studio | Local campaigns, Tamil/English copy and creative briefs | Approved menu, offer, dates and brand facts |
| Approval centre | Review and approve proposed actions | Actor, exact content, scope and timestamp |
| Growth consultant | Prioritised actions with expected impact and confidence | Traceable source evidence and stated assumptions |

## Delivery sequence

### Stage 0 — Safe foundation (completed on feature branch)
- Confirm standalone product boundary and Paanagam pilot.
- Document POS read-only integration and data provenance.
- Define growth modules, source labels, approval requirements and delivery gates.
- Keep existing authenticated workspace and Google read-only connection intact.

### Stage 1 — Usable owner workspace (partially implemented)
- Added Menu Intelligence with browser-local item price, optional unit cost and quantity records.
- Added Sales Analytics with dated owner-entered daily summaries, totals and average order value.
- Added privacy-safe Customer Retention aggregate entry; no customer identities are collected.
- Added Campaign Studio with Tamil/English draft templates and a local approval/review queue.
- Added a transparent rules-based Growth Consultant summary; no AI model is connected.
- Added tenant-scoped PostgreSQL growth-record model and migration, plus authenticated list/upsert/delete API endpoints for menu, daily sales, retention snapshots and campaign drafts. Client retries are idempotent by business, record type and external ID; payloads are capped at 64 KB.
- Completed follow-up: the browser workspace now syncs to the authenticated business-scoped API, keeps an offline local cache per business, performs a one-time migration from the old unscoped local store, and reconciles local-only records against server records. Added an owner-scoped data-status endpoint and dashboard provenance/freshness summary. Remaining: activity history, owner baseline management, sync pagination beyond the 200-record UI window, and stronger conflict-resolution/versioning for simultaneous edits.

### Stage 2 — Menu and sales intelligence (next)
- Implement POS connection only after the POS team confirms and ships the versioned read-only export API.
- Add daily sales and menu item aggregate ingestion, reconciliation and retry-safe sync.
- Show item mix, sales trend, average order value and daypart analysis where source fields permit.
- Add contribution analysis only when verified item costs are available.

### Stage 3 — Local growth intelligence
- Complete Google Business Profile evidence import where access is granted.
- Build review themes and response drafts from actual review data.
- Add competitor records with source URL, observation date and manual verification.
- Add local SEO checklist and content recommendations grounded in verified business facts.

### Stage 4 — Retention and campaign execution
- Add privacy-safe loyalty and repeat-visit cohort summaries.
- Create campaign calendar and reusable Tamil/English content briefs.
- Add approval lifecycle, scheduled draft preparation and publishing integrations only after explicit owner approval and platform authorisation.

### Stage 5 — Production readiness
- Security review, email verification, password reset, session rotation and MFA decision.
- Paid database with backups, monitoring, retention policies and incident response.
- Tenant isolation tests, permission tests, data export/deletion tests and integration contract tests.
- Operational cost review before any production deployment.

## Insight quality standard
Every insight must include:
1. Plain-language finding.
2. Source label: owner-confirmed, POS import, Google API, public observation, calculated, AI suggestion or demo.
3. Date range and last-updated time.
4. Calculation or evidence basis.
5. Confidence/limitations where relevant.
6. Proposed next action, never an automatic external action.

Unavailable data is shown as Not connected or No verified data, never zero. Demo data is visually labelled and must not leak into owner reporting.

## Approval policy
Approval is required separately for each profile edit, review reply, post, message, offer, price recommendation applied to POS, or other external/operational change. Material changes require new approval. POS write-back is not part of the planned integration.

## Pilot success measures
- Owner can identify the top three evidence-backed growth actions.
- Daily sales and item totals reconcile with POS source after integration.
- Menu recommendations show input data and costing limitations.
- Every external action has an approval record.
- Dashboard remains useful when Google or POS integrations are disconnected.
