# Feature Behaviour Contracts — IF / IF NOT

Status: implementation acceptance contract for existing LocalBoost modules.
Scope: preserve production behaviour and business data. This document does not authorise external actions, provider spending, schema changes, or publishing.

## Non-negotiable platform rules

1. Business isolation: every business-scoped read/write verifies the authenticated actor's access. A business ID is never proof of access.
2. Provenance: every insight distinguishes owner-entered, Google API, POS import, public observation, calculated, AI suggestion, and demo data. Missing evidence is never converted to zero.
3. Draft-first: generation never publishes, schedules, sends, changes a profile, changes a price, or launches paid media.
4. Approval binding: approval applies only to the exact content revision, action, destination/account, and scope reviewed. Any material change invalidates it.
5. Idempotency: retries must not create duplicate records, jobs, posts, imports, or charges.
6. Recovery: network/provider/database failure preserves user input and confirmed prior state.
7. No false success: a feature is complete only after its durable operation succeeds.
8. Least data: collect only required fields; POS v1 remains aggregate/read-only and excludes customer identifiers.

## Feature contracts

| Feature area | IF — success path | IF NOT — safe path |
|---|---|---|
| Identity/session | Valid session and authorised business: continue | Expired/invalid session: 401, preserve local draft, request re-auth; never trust cached business ID |
| Business workspace | Owner access verified: load business-scoped data | Unknown/unowned business: 404/deny; do not reveal another tenant |
| Business profile/evidence | Owner-confirmed field saved with source and timestamp | Missing/unverified field: mark unknown and request owner input; never infer |
| Dashboard/growth overview | Calculate from eligible, dated evidence | No/old/incomplete data: show unavailable, stale or insufficient sample; never fabricate zeros |
| Google OAuth | Valid callback/state and granted scope: bind selected account/location | Denied, expired, mismatched state or revoked grant: no action; preserve prior data and show reconnect |
| Google profile audit | Audit fields available: score with field-level evidence | Unavailable API field: unknown/not assessable, not a failed business attribute |
| Local SEO | Locality and owner-confirmed services present: generate suggestions | Required inputs absent: actionable validation; label suggestions, not measured search volume |
| Competitors | Owner-confirmed profile and dated observations: compare snapshots | Missing identity/date/prior snapshot: show incomplete comparison; no verified ranking claim |
| Google review import | Correct location, authorised read access: import idempotently | Quota/network/permission failure: preserve reviews, report partial status and retry cursor |
| Review themes | Analyse non-empty review text and show sample/date coverage | Rating-only/empty reviews: exclude from text themes; report insufficient sample |
| Review reply draft | Draft from actual review text and selected language | No text/provider failure: retain review and show recoverable error; never send reply |
| Menu intelligence | Valid item/price/quantity/cost snapshot: calculate supported measures | Missing cost: omit contribution; missing sales: no volume claim; never call revenue profit |
| Sales analytics | Valid dated summaries: calculate totals/AOV/trends | Missing dates, invalid order count or duplicates: mark gaps and reject/ignore duplicate source IDs |
| POS integration | Contract version and authorised read-only token match: import aggregate records | Contract/token unavailable: POS remains disconnected; no write-back, no customer PII, no fabricated sync |
| Retention | Valid aggregate cohort snapshots: compare dated cohorts | No baseline/insufficient period: show insufficient history; no individual customer inference |
| Goals/baselines | Valid baseline and date range: calculate progress | Baseline absent/invalid: show not configured; no misleading percentage |
| Growth action tracking | State transition valid: persist actor, time and evidence | Stale/invalid transition or save failure: keep prior state and show retry/conflict |
| Campaign brief | Confirmed product/offer/date/brand facts: build editable brief | Missing fact: mark unresolved; never invent discount, price, availability, hours or claims |
| Caption generation | Valid schema/language/tone: save draft and provider metadata | Malformed/empty output: reject or safely normalise supported shape; preserve source brief |
| Creative brief | Plain text brief validates: attach to campaign | Structured object: normalise known scalar fields only; unsupported/empty output fails clearly |
| GPT image generation | Configured model returns valid image bytes: create preview | Missing key/credit/model/format/timeout: preserve caption and brief; mark failed, not saved |
| Asset storage | Upload succeeds and returns durable asset ID: link to campaign | Upload fails: label preview temporary/unsaved; retry storage without silently regenerating |
| PoYo video | Explicit user submission, configured model and cost guard: create one provider task | Missing config/approval/cost or duplicate submission: do not submit; keep draft |
| Video polling/output | Known task ID: reconcile provider state; validate output before ready | Poll timeout/provider error: retain task ID and pending/error status; never blindly resubmit |
| Creative composition | Required approved assets and format present: render final asset | Missing/invalid asset: block final export and identify missing component |
| Approval centre | Exact revision/action/destination approved by authorised owner: record immutable approval | Rejected/expired/changed revision/destination: block execution and require fresh approval |
| Organic publishing | Valid approval + platform token + target: publish once and store external ID | Missing auth/approval/ambiguous timeout: block; reconcile remote status before retry |
| Paid advertising | Separate approval for account, audience, budget, dates and creative: launch within limits | Any missing approval/limit/payment setup: no spend and no launch |
| CRM import/contact | Valid business-scoped record and permitted purpose: store minimum fields | Invalid/duplicate/unconsented marketing contact: reject or suppress; never send automatically |
| CRM messaging | Consent, valid channel and exact message approval: send once | Consent/token/approval absent: block; draft is not sent |
| Reports/export | Valid source and date window: calculate with provenance | Missing/partial source: expose coverage and limitations; never label estimates as actuals |
| Offline/cache | Selected business cache available: show freshness and queue safe writes | No cache: clear offline unavailable state; never show another business's cached data |
| Sync/reconciliation | Same version or idempotent event: sync | Concurrent edit/delete: surface conflict/tombstone; no silent last-write-wins |
| Audit/activity | Record action, actor, scope and result durably | Audit persistence fails: fail closed for external/irreversible action |
| Settings/secrets | Valid configuration present: report provider ready | Missing/invalid secret: provider disabled with safe diagnostic; never expose secret values |

## Required API/UI state vocabulary

- Data: CONNECTED, NOT_CONNECTED, CURRENT, STALE, PARTIAL, INSUFFICIENT, FAILED.
- Generation: DRAFT, QUEUED, SUBMITTED, PROCESSING, PREVIEW_READY, SAVE_PENDING, SAVED, FAILED, CANCELLED.
- Approval: PENDING, APPROVED, REJECTED, EXPIRED, INVALIDATED.
- Publishing: NOT_PUBLISHED, PUBLISHING, PUBLISHED, UNKNOWN_RECONCILIATION_REQUIRED, FAILED.

Transitions must be validated server-side. UI-only disabling is not an access or approval control.

## Regression gates for every feature

Test success; required input missing; optional input absent; malformed input/provider output; network timeout; provider unavailable/quota; expired permission; duplicate request; database write failure; cross-tenant access; stale/concurrent edit; cancellation/rejection; restart/recovery; and compatibility with existing production records.

## End-to-end release scenarios

1. Google disconnects during review import: keep imported reviews, show partial result, resume without duplicates.
2. Caption succeeds but image generation fails: retain caption/brief and allow image-only retry.
3. Image generation succeeds but storage fails: show temporary preview and retry save without a second generation charge.
4. Video submission times out after provider acceptance: reconcile by idempotency/task identifier before retry.
5. Owner edits a post after approval: invalidate approval and block publish.
6. Publishing times out: reconcile remote post before retry to prevent duplicate publication.
7. POS sends the same daily summary twice: deduplicate and preserve totals.
8. Two tabs edit one campaign: detect version conflict and preserve both candidate changes.
9. Business A requests Business B records: deny without data leakage.
10. AI provider is unavailable: deterministic dashboard and saved records remain usable.

## Implementation order

P0: tenant/session boundaries, durable audit for external actions, idempotency, safe error handling, provenance, recovery.
P1: offline versioning/conflict handling and integration health states.
P2: complete campaign-to-asset lifecycle (caption → brief → generation → durable save → campaign link).
P3: approval-bound publishing and provider reconciliation.
P4: POS aggregate ingestion, menu/sales reconciliation, retention and CRM consent controls.
P5: observability, backups/restore drills, data export/deletion, cost limits and full regression.

## Completion definition

A feature is complete only when its server-side contract, UI state handling, persistence behaviour, negative paths, tenant/permission checks, automated tests and regression impact have been verified. A visible screen or HTTP 200 alone is not completion.
