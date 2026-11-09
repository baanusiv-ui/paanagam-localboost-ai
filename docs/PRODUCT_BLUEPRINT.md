# LocalBoost AI — Product Blueprint

## Product
LocalBoost AI is a standalone, multi-business growth intelligence platform. It has an independent repository, backend, database, authentication and release lifecycle. Paanagam (பானகம்) is the first internal pilot. The platform is intended to support local cafes, QSRs, bakeries, restaurants and other local businesses.

LocalBoost is not a POS replacement or a feature embedded in the Paanagam POS. The POS remains the operational system of record. LocalBoost can optionally receive privacy-safe, read-only aggregate data through POS_INTEGRATION_CONTRACT.md.

## Operating modes
1. **Public audit mode:** dated public observations only; no implication of access to private profile analytics.
2. **Connected business mode:** owner-authorised official APIs and explicitly scoped integrations.
3. **Owner-provided mode:** facts, menu and reports supplied by the owner, with source and date.
4. **Demo mode:** synthetic data, clearly labelled and isolated from real reporting.

## Product modules
- **Growth overview:** priorities, verified signals, progress, data freshness and next actions.
- **Local presence:** business identity, profile completeness, categories, hours, services, photos, website and contact consistency.
- **Competitor intelligence:** verified competitor records and dated public observations; no fabricated rankings or traffic.
- **Review intelligence:** themes, recurring service issues and response drafts from actual reviews.
- **Menu intelligence:** item mix, sales velocity, daypart performance and contribution only where source data and cost snapshots are complete.
- **Customer retention:** privacy-safe repeat-visit and loyalty cohort metrics; no raw customer profiles in the first POS integration.
- **Campaign studio:** Tamil/English campaign ideas, captions, creative briefs and calendar based on approved menu facts and offers.
- **Approval centre:** action-specific approve/reject workflow with actor, timestamp, content and scope.
- **AI growth consultant:** evidence-grounded recommendations with assumptions, confidence and expected measurement.

## Data provenance
Every fact or metric must identify its source: OWNER_CONFIRMED, POS_IMPORT, GOOGLE_API, PUBLIC_OBSERVATION, CALCULATED, AI_SUGGESTION or DEMO. Store observation/import time, source record, applicable date range and verification status. A derived metric must retain identifiers of its inputs and its calculation definition.

Unavailable metrics display Not connected or No verified data, never zero. Do not merge demo data into real owner reports.

## POS boundary
- POS integration is optional and read-only.
- Import daily sales totals and menu item aggregates first; cost snapshots and loyalty aggregates are later opt-in categories.
- No customer names, phone numbers, emails, payment identifiers or individual purchase histories in the first phase.
- No POS order, price, recipe, inventory, supplier, payment or loyalty write-back.
- Use versioned API/export, scoped revocable credentials, idempotent sync and reconciliation.
- LocalBoost must continue to work when POS is disconnected.

See POS_INTEGRATION_CONTRACT.md for the proposed data contract and acceptance criteria.

## Approval and safety rules
- Never edit a business profile, reply to a review, publish content, send outbound communication or apply an operational change without explicit owner approval for that exact action.
- Approval must bind to exact content, target, timing and scope; material changes require new approval.
- No fake reviews, review gating, incentivised sentiment manipulation or ranking guarantees.
- Do not scrape restricted or authenticated sources.
- Keep public observations, owner-provided facts, connected API data, demo data and AI suggestions distinct.
- AI outputs must state evidence, assumptions, confidence and limitations.

## Paanagam pilot
- Owner-confirmed display name: Paanagam (பானகம்).
- Supplied Maps listing URL: https://maps.app.goo.gl/FNeN88d971ZM2afb8?g_st=ac
- Listing identity is owner-confirmed; technical resolution and Google authorisation remain pending.
- Do not infer address, phone, rating, reviews, hours or performance from the shortened URL alone.
- Paanagam menu, POS sales and recipe costing can be connected only through owner-approved exports and the POS integration contract.

## Technical architecture
- Frontend: responsive owner dashboard.
- Backend: TypeScript/Fastify service layer.
- Data: PostgreSQL with tenant-scoped ownership and provenance.
- Integrations: official Google APIs and explicitly authorised, scoped partner APIs.
- AI orchestration: planned specialist agents for audit, local SEO, competitor, reviews, menu, retention, content, analytics and consultant workflows. Agents return evidence and proposed actions, never direct unapproved actions.
- Observability: audit logs, consent records, source provenance, sync history and action history.

## Delivery phases
See GROWTH_INTELLIGENCE_ROADMAP.md for the staged plan and production gates.
