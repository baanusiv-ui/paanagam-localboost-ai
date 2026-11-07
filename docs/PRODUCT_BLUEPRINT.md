# LocalBoost AI — Product Blueprint

## Product
LocalBoost AI is a local-business growth intelligence platform with an optional AI-managed marketing service. Paanagam is the internal pilot business; the platform is intended to support multiple local-business categories and markets.

## Operating modes
1. **Public audit mode:** uses only publicly observable information and clearly records source and observation date. It must not imply access to private Business Profile analytics.
2. **Connected business mode:** uses authorised owner connection and approved official APIs. Permissions and available fields must be disclosed.
3. **Demo mode:** uses synthetic sample data. Every metric and finding is labelled demo.

## MVP modules
- Overview: audit progress, tasks, approved drafts, and verified data status.
- Local presence audit: business identity, profile completeness, categories, hours, services, photos, website and contact consistency.
- Competitor intelligence: manually verified/publicly observable comparison; no fabricated rankings or traffic.
- Review intelligence: themes and sentiment only from reviews actually supplied or lawfully accessed.
- Content studio: draft posts, captions and campaign ideas; no automatic publishing.
- Approval centre: explicit approve/reject workflow with actor, timestamp and action scope.
- AI consultant: recommendations grounded in available evidence with source and confidence labels.

## Specialist agents (planned)
Orchestrator; audit; local SEO; competitor; reviews; content; automation; analytics; consultant. Each agent receives only the data needed for its task and returns evidence, assumptions, confidence, and proposed actions.

## Approval and safety rules
- Never edit a business profile, reply to a review, publish content, or send outbound communication without explicit approval.
- Approval must be specific to the proposed action and content.
- No fake reviews, review gating, incentivised sentiment manipulation, or ranking guarantees.
- Do not scrape restricted or authenticated sources.
- Keep public observations, owner-provided facts, connected API data, demo data, and AI suggestions distinct.
- Do not show unavailable metrics as zero. Show “Not connected” or “No verified data”.

## Paanagam pilot setup
- Display name confirmed by owner: Paanagam (பானகம்).
- Supplied Maps listing URL: https://maps.app.goo.gl/FNeN88d971ZM2afb8?g_st=ac
- Listing identity is owner-confirmed; technical resolution and Google authorisation remain pending.
- Do not infer address, phone, rating, reviews, hours, or performance from the shortened URL alone.

## Suggested technical evolution
- Frontend: React/Next.js with responsive owner dashboard.
- Backend: TypeScript service layer.
- Data: PostgreSQL; PostGIS for geographic comparisons.
- Jobs: Redis-backed queue.
- Authentication: secure OAuth and role-based access.
- Integrations: official Google APIs only, after consent and verification.
- Billing: India-first payment provider with international billing later.
- Observability: audit logs, consent records, action history, and source provenance.

## Delivery phases
1. Frontend prototype and product validation.
2. Secure identity, business workspace, and evidence model.
3. Public audit ingestion and source capture.
4. Google authorisation and official API integration.
5. Review/content drafting and approval centre.
6. Multi-business agency portal, billing, and analytics.
