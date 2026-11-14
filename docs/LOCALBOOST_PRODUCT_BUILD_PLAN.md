# LocalBoost product build and release plan

## Product outcome
LocalBoost is a standalone, multi-business growth operating system. Paanagam is the first pilot tenant, not the product identity. The product helps an owner move from verified business facts to prioritised action, approved marketing execution, measured commercial outcomes and controlled reinvestment.

## Non-negotiable rules
- Preserve LocalBoost and Paanagam POS data/security boundaries.
- Label evidence by source, observation date, freshness and confidence. Never invent missing data or display missing as zero.
- Require explicit owner approval before publishing, replying, messaging, editing a profile or purchasing.
- No Canva dependency in the standard creative workflow.
- No paid AI/API call by default. Declare provider cost/credit model before generation; paid providers remain disabled until explicitly enabled.
- Never silently switch to a paid provider during outage.
- Tenant isolation, audit history, secure token storage and idempotent external actions are release blockers.

## Delivery order
1. Foundation: repository/deployment parity, tenant isolation, auth, API contract, migrations, health/monitoring, backup/restore and rollback.
2. Local presence: verified business identity, profile completeness, Google connection, local SEO and dated competitor evidence.
3. Customer intelligence: authorised review import, themes, private reply drafts, CRM and privacy-safe retention aggregates.
4. Growth intelligence: sales/gross-profit inputs or approved read-only POS summaries, goals, evidence-linked priorities and monthly reporting.
5. Marketing operating system: topic-only campaign brief, Tamil-first/English copy, image/video provider abstraction, asset library, channel variants, calendar and unified approval queue.
6. Distribution: official channel adapters, live connection/permission checks, preview, explicit approval, publish, reconciliation and analytics. Unsupported channels must show unavailable, not connected.
7. AI investment manager: separate marketing and AI spend, campaign-attributed incremental gross profit, cash reserve, owner-selected reinvestment rate, conservative incremental budget ceiling and no automatic purchase.
8. SaaS readiness: onboarding, multi-business, roles, billing only after validation, usage controls, privacy/export/delete and support.

## AI investment policy
- Begin with zero additional spend and existing/free/local tools.
- Track actual costs by provider, model, business, campaign and month.
- Calculate ROI from attributable incremental gross profit, not top-line revenue alone.
- Recommend incremental budget only when evidence is complete and non-demo, cash is above required reserve, and the owner has configured a reinvestment rate.
- The system may recommend; it never buys credits or subscribes.
- Missing attribution means no ROI claim and no paid-upgrade recommendation.

## Current repository/deployment observations (2026-11-14)
- Main is the Render-connected branch.
- Render dashboard and API services both have automatic deployment disabled.
- Dashboard build copies a fixed list of root files into public-dist; new browser assets require an explicit build-command update.
- API is a separate Render service with a Free plan setting; cold-start behaviour, secrets, retention and production readiness need validation.
- The repository README documents Neon Auth and PostgreSQL API, while also identifying this as an initial foundation with backup, restore and security gates outstanding.
- Distribution settings include Instagram, Facebook, WhatsApp, Google Business and YouTube Shorts, but current code documents WhatsApp and YouTube as not connected.
- Draft PR #71 contains a PoYo-to-campaign handoff fix. It is not merged; CI success does not establish browser end-to-end correctness.

## Acceptance gates
- Every screen uses the selected tenant and authenticated API; no cross-business leakage.
- Every metric shows source, date range, sample/coverage and calculation.
- Every AI output is editable and labelled generated; saved only on owner action.
- Publishing has state transitions, idempotency and reconciliation; uncertain outcomes are never blindly retried.
- Each channel has a live connection check before being marked connected.
- No cost-incurring action while paid providers are disabled.
- Build, unit tests, API contract, tenant-route security, browser E2E, mobile/desktop, backup/restore and deployment smoke tests pass before production approval.
