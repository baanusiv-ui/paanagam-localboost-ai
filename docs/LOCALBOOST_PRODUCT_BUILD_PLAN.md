# LocalBoost product build and release plan

## Product outcome
LocalBoost is a private, single-user business growth operating system for the owner's own business operations. It is not being launched or sold as SaaS at this stage. Paanagam is the initial business workspace and pilot environment, not the identity of the LocalBoost product. The system helps the owner understand the whole business, identify growth opportunities, make evidence-based decisions, execute approved actions and measure commercial outcomes.

LocalBoost is deliberately broader than SEO. It combines business intelligence, local presence and SEO, competitor intelligence, customer/review intelligence, CRM, sales and menu performance, growth planning, marketing execution, channel distribution, analytics and controlled reinvestment.

Architecture must remain clean and migration-friendly so that a future decision to commercialise LocalBoost can introduce multi-business accounts, team roles, subscriptions and billing. Do not build or operate those SaaS features now, and do not add SaaS complexity to the private single-user product prematurely.

## Operating model now
- One owner/user and one private operating environment.
- One primary business workspace initially, with the ability for the owner to manage their own business data without public customer onboarding.
- Keep authentication and secure access to the private system; single-user does not mean publicly accessible or unauthenticated.
- No public signup, tenant marketplace, subscription plans, billing, team invitations or SaaS admin console in the current release.
- Preserve stable business IDs, clear data ownership and modular service boundaries so a future multi-user migration is possible.
- Keep business data and Paanagam POS data/security boundaries intact.
- Do not confuse this LocalBoost project with the separate Namakkal Uzhavar Sandhai market project.

## Non-negotiable rules
- Build for the owner's real operating needs first; future SaaS readiness is an architectural constraint, not a current product feature.
- Label evidence by source, observation date, freshness and confidence. Never invent missing data or display missing as zero.
- Require explicit owner approval before publishing, replying, messaging, editing a profile or purchasing.
- No Canva dependency in the standard creative workflow.
- No paid AI/API call by default. Declare provider cost/credit model before generation; paid providers remain disabled until explicitly enabled.
- Never silently switch to a paid provider during outage.
- Secure access, business data isolation, audit history, secure token storage, backup/restore and idempotent external actions are release blockers.

## Product scope
1. Private business command centre: business profile, dashboard, health checks, priorities, tasks and owner reporting.
2. Local presence and discoverability: Google Business Profile, local SEO, keyword intelligence, local content, listing completeness and dated competitor evidence.
3. Customer and reputation intelligence: authorised reviews, themes, private reply drafts, CRM, customer feedback and privacy-safe retention aggregates.
4. Commercial intelligence: sales, gross profit, menu/product performance, pricing, wastage, repeat visits, loyalty and approved read-only POS integration.
5. Growth intelligence: goals, evidence-linked opportunities, prioritised action plans, campaign recommendations and measurable outcomes.
6. Marketing operating system: topic-led campaign brief, Tamil-first/English copy, image/video provider abstraction, asset library, channel-specific variants and calendar.
7. Approval and distribution: one owner approval queue, official channel adapters, live connection/permission checks, publish, reconciliation and analytics. Unsupported channels must show unavailable, not connected.
8. Performance and reinvestment: campaign attribution, marketing ROI, AI cost tracking and conservative growth-funded investment recommendations.

## Delivery order
1. Foundation: repository/deployment parity, private owner access, API contract, migrations, health/monitoring, backup/restore and rollback.
2. Private workspace: remove public SaaS onboarding assumptions, simplify to the single owner and establish reliable business profile/workspace selection.
3. Whole-business intelligence: local presence, SEO, dated competitor evidence, reviews, CRM, sales, menu and POS data quality.
4. Growth intelligence: evidence-linked priorities, goals, actions, business performance and owner reporting.
5. Marketing operating system: topic-only campaign brief, Tamil-first/English copy, image/video provider abstraction, asset library, channel variants, calendar and unified approval queue.
6. Distribution: official channel adapters, live connection/permission checks, preview, explicit approval, publish, reconciliation and analytics.
7. AI investment manager: separate marketing and AI spend, campaign-attributed incremental gross profit, cash reserve, owner-selected reinvestment rate, conservative incremental budget ceiling and no automatic purchase.
8. Future commercialisation (not in current release): only if the owner later chooses to go to market, add multi-user/multi-business tenancy, team roles, public onboarding, billing, plans, support operations and SaaS administration through a planned migration and security review.

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
- The private owner workspace is accessible only to the authorised owner; no public signup or unauthorised access.
- Every screen uses the authenticated owner's business context; no cross-business leakage.
- Every metric shows source, date range, sample/coverage and calculation.
- Every AI output is editable and labelled generated; saved only on owner action.
- Publishing has state transitions, idempotency and reconciliation; uncertain outcomes are never blindly retried.
- Each channel has a live connection check before being marked connected.
- No cost-incurring action while paid providers are disabled.
- Build, unit tests, API contract, owner-access security, browser E2E, mobile/desktop, backup/restore and deployment smoke tests pass before production approval.
