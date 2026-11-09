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
- Completed follow-up: the browser workspace now syncs to the authenticated business-scoped API, keeps an offline local cache per business, performs a one-time migration from the old unscoped local store, and reconciles local-only records against server records. Added an owner-scoped data-status endpoint and dashboard provenance/freshness summary. Remaining: activity history, owner baseline management, and stronger conflict-resolution/versioning for simultaneous edits. Growth-record pagination is now implemented.

### Stage 2 — Menu and sales intelligence (next)
- Implement POS connection only after the POS team confirms and ships the versioned read-only export API.
- Add daily sales and menu item aggregate ingestion, reconciliation and retry-safe sync.
- Show item mix, sales trend, average order value and daypart analysis where source fields permit.
- Add contribution analysis only when verified item costs are available.

### Stage 3 — Local growth intelligence (partially implemented)
- Existing Google Business Profile evidence import remains read-only and dependent on granted API access.
- Added the Growth Intelligence dashboard, checklist completeness display, source/freshness labels and recommendations using the existing audit engine.
- Added a competitor comparison workspace: owner-confirmed public profile identity, required source URL and observation date, repeatable snapshots, latest-to-prior rating/review-count comparisons, and a dated history. These are owner-entered observations, not independently verified rankings or scraped data.
- Added Tamil/English local keyword idea workspace; measured search volume and rank tracking remain pending an authorised data source.
- Added owner-supplied review capture and private Tamil/English reply drafting through optional local Ollama. Email addresses and Indian mobile numbers are redacted before generation; drafts are reviewed and saved by the owner and are never sent automatically. Added paginated, read-only Google review import for the selected verified Business Profile location, capped at 250 reviews per run. Reviewer names and profile photos are not stored. Added tenant-scoped review-theme analysis for up to 1,000 saved reviews. Transparent Tamil/English keyword heuristics group text into service, food quality, price/value, ambience/cleanliness, staff, waiting time and other; sentiment is directional only, rating-only reviews are excluded from text analysis, and sample size/date coverage/limitations are shown.
- Added Google content calendar drafts and approve/reject workflow. Optional local Ollama now generates editable Tamil/English post copy and a format-specific visual creative brief from owner-supplied facts. The brief is not an image; approval is for manual publishing only, with no automatic scheduling or publishing.

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


## Growth Overview Intelligence (implemented)
- Authenticated, tenant-scoped `/v1/businesses/:businessId/growth-overview` endpoint returns up to three deterministic owner actions.
- Signals include negative review themes, recorded seven-day sales movement, stale/unverified profile evidence, repeated owner-confirmed competitor observations, and missing sales/review baselines.
- Each action includes priority score, evidence source, record IDs, date coverage, calculation, confidence, and owner-approval requirement.
- Demo records are excluded. Scores are rule-based signal-strength indicators, not predicted revenue impact. No automatic execution or publishing.


## Growth Action Tracking (implemented in code; migration pending deployment)
- Owners can mark a suggested action as ACCEPTED, IN_PROGRESS, COMPLETED, DISMISSED or return it to SUGGESTED.
- Optional owner progress notes (maximum 1,000 characters) and status timestamps are stored per business.
- Tracking is persisted in the `GrowthAction` table and merged back into the current evidence-generated overview by stable action ID.
- API routes are authenticated and tenant-scoped. Stale action IDs are rejected rather than attaching notes to a different recommendation.
- The database migration `20261109110000_growth_action_tracking` must be applied in the target environment before using the feature.
- Status changes are internal workflow records only; they do not execute recommendations or publish content.


## Growth Impact Measurement (implemented in code; tracking migration required before use)
- Completed sales-related actions receive a descriptive comparison of the seven complete dates before completion against the seven complete dates after completion. Both windows require one valid daily sales record for every date.
- Completed review-related actions compare review volume, average rating and directional negative-keyword matches across the same seven-day windows; each side requires at least three reviews.
- Follow-up windows remain collecting until all seven post-completion dates have elapsed. Missing samples are reported as insufficient; missing dates are never treated as zero.
- Other action types explicitly report that a comparable metric is not yet supported. No synthetic impact score, causal attribution, forecast or automatic action is produced.
- The feature uses existing tenant-scoped GrowthAction completion timestamps and saved growth records; no new database migration is required.


## Growth History dashboard
- A tenant-scoped `GET /v1/businesses/:businessId/growth-history` endpoint lists saved owner-tracked actions in most-recently-updated order, including current status, progress note, acceptance/completion/dismissal timestamps and evidence-backed measurement when available.
- The dashboard summarizes accepted, in-progress, completed and dismissed actions, and supports filtering by status. It does not invent status transitions that were not saved; each row reflects the latest persisted state for that action.
- History is backed by the existing GrowthAction records and tenant ownership guard. No additional database migration is introduced.


## Growth Goals & Targets (implemented in code; migration pending deployment)
- Owners can create or replace a monthly target for net sales, review count, and average review rating. Targets are never prefilled or inferred.
- Tenant-scoped API reads only the selected business's goals and non-demo daily sales/review records; goals can be archived without deleting history.
- Progress is calculated for the selected calendar month from recorded net sales, review count, or valid 1–5 star ratings. The response includes the sample size, source, calculation note and missing-data limitations.
- No forecasts, "on track" predictions, retention assumptions, or automatic actions are generated. Sales records are summed as recorded; absent dates are not converted to zero.
- Migration `20261109130000_growth_goals` must be applied and Prisma Client regenerated in the target environment before live use.

 
## Growth Goals History & Monthly Comparison (implemented in code)
- A tenant-scoped history endpoint returns up to 24 calendar months of saved goals with recorded monthly actuals, including archived targets.
- Dashboard comparison shows month, metric, actual, owner target, achieved percentage and sample size. Months without a saved target are omitted rather than represented as missed goals.
- The history is descriptive only: no forecast, no inferred target, and no causal claim. It uses recorded evidence and preserves archived target visibility.


## Growth Performance Report (implemented in code)
- A tenant-scoped `GET /v1/businesses/:businessId/growth-performance-report?month=YYYY-MM` endpoint builds a selectable calendar-month report from saved daily sales, reviews, owner targets and tracked actions.
- Sales include net sales, valid daily-record count, distinct coverage dates, recorded orders and average order value only when the required inputs exist. Reviews include count, valid rating average, rating sample size and source counts.
- Saved monthly targets are compared with actuals, including archived targets. Completed actions are listed by their saved completion date; current tracked status counts are shown separately.
- Demo records are excluded. Missing values remain null / No data, not zero. The report states its calculation methods, sample sizes, retrieval limits and non-causality limitations.
- This is a read-only report using existing GrowthRecord, GrowthGoal and GrowthAction tables; no schema change or new migration is introduced. The endpoint is authenticated and tenant-scoped.

 
## Menu & Sales Intelligence (implemented in code; POS feed pending)
- Added tenant-scoped `GET /v1/businesses/:businessId/menu-sales-intelligence?from=YYYY-MM-DD&to=YYYY-MM-DD` with owner authentication and business ownership checks.
- Menu mix groups saved dated menu quantity records by item and ranks recorded unit volumes. Indicative item sales are quantity multiplied by the supplied selling price; contribution is calculated only when both selling price and unit cost are supplied.
- Sales intelligence shows saved daily summaries, weekly totals, net sales, order counts and average order value. Missing dates are not converted to zero.
- Daypart analysis appears only when a daily-sales record explicitly contains daypart aggregates with net sales and order counts. No time-of-day values are inferred from dates or totals.
- Dashboard panels are view-only. Existing owner-entry forms remain separate; analytics do not edit POS or owner records.
- Demo records are excluded. The response documents that menu quantities are owner-entered snapshots, not POS line-item sales, and that indicative menu sales are not reconciled receipts.
- The versioned read-only POS export API remains a separate integration dependency. No POS database access, POS write-back, publishing, or deployment was performed.

 
## Growth record pagination & workspace hydration (implemented in code)
- The authenticated, tenant-scoped growth-record list accepts an optional opaque record cursor and a page size of up to 200. It returns a next cursor when another page may exist.
- Ordering is stable across recorded date, creation date and record ID. A cursor is checked against the selected business before it is used.
- Workspace hydration now fetches pages of 200 and reconciles against the full retrieved set instead of assuming the first 200 records are the entire server history.
- Client hydration is capped at 10,000 records per pass (50 pages); when that cap is reached, the dashboard explicitly warns that older records remain on the server. The server remains the canonical source for already-synced records.
- This improves completeness but does not yet resolve simultaneous edit conflicts or provide a full audit trail. No POS integration or deployment was performed.


## Business Activity History (implemented in code; migration pending deployment)
- Added an append-only, tenant-scoped `ActivityEvent` table with actor user ID, event type, entity type/ID, concise summary, safe metadata and timestamp. Events are removed only when the parent business is deleted.
- Owner activity is recorded when growth actions change status, monthly growth targets are saved or archived, and owner-entered growth records are created, updated or deleted.
- Added authenticated `GET /v1/businesses/:businessId/activity-history` with business ownership checks, event-type filtering, stable cursor pagination and a maximum page size of 100.
- The Growth Intelligence dashboard shows a read-only activity timeline, loads 50 events initially and supports loading older events. It clearly distinguishes this owner-workspace audit timeline from POS activity.
- The migration `20261109150000_activity_history` must be applied and Prisma Client regenerated before the endpoint and event writes can run in a deployed environment. Existing historical actions are not backfilled; the timeline begins recording after migration.
- No external action, POS write-back, or deployment is performed.
