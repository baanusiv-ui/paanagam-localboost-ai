# LocalBoost AI — Complete Dhanda Reference Audit

**Audit date:** 2026-11-09  
**Repository:** `baanusiv-ui/paanagam-localboost-ai`  
**Audited branch:** `main`  
**Audited source commit:** `840d7d4bf1788558784cae731762d97044161dc3`  
**Benchmark:** Dhanda AI Marketing by EZO (`com.dhanda.app`)  
**Purpose:** product-capability and implementation audit. This is not a security penetration test, live deployment test, or claim that Dhanda's advertised features have been independently verified.

## 1. Executive verdict

LocalBoost has a meaningful foundation and several capabilities beyond the public Dhanda feature description: tenant-scoped growth records, evidence provenance, owner-controlled growth actions, baselines and goals, performance reporting, menu/sales intelligence, privacy-safe retention aggregates, and a documented read-only POS boundary.

It is **not yet at full Dhanda capability parity and is not production-ready**.

The largest gaps are:
1. The latest code CI run fails TypeScript compilation; tests and dashboard syntax checks are skipped.
2. Google Profile audit coverage is narrower than the benchmark and imported evidence has no automatic expiry.
3. Keyword suggestions are templates, not measured SEO research.
4. Competitor data is manually owner-recorded, not an automated competitor intelligence feed.
5. Content generation produces copy and a creative brief, not the actual recurring images and publishing workflow advertised by Dhanda.
6. POS sales and menu intelligence remain owner-entered; the Paanagam POS API is not connected.
7. Authentication lifecycle and operational controls need hardening before production.

**Overall recommendation:** continue with LocalBoost as the main product. Do not merge this audit branch into production, deploy, or activate external publishing/POS sync based on this audit alone. Resolve the P0 items and complete staging validation first.

## 2. Benchmark definition

The public Google Play listing for Dhanda AI Marketing by EZO describes:
- Google Score Audit and actionable profile improvement insights.
- SEO keyword analysis.
- Competitor analysis.
- Personalised Google review replies.
- Weekly Google profile images and updates.

Dhanda's public website additionally advertises AI-generated images and social posting to Facebook and Instagram. These are used as capability benchmarks only. Do not copy its brand, assets, UI, text or proprietary implementation.

Reference sources:
- Google Play listing: https://play.google.com/store/apps/details?id=com.dhanda.app
- Dhanda public website: https://dhanda.app/
- Dhanda marketing feature page: https://gmc.ezobooks.in/

The comparison is against publicly described product capabilities, not access to Dhanda's private backend or an independent hands-on test of its paid workflows.

## 3. Capability-by-capability comparison

Status meanings:
- **Implemented (limited):** working code exists, but coverage or data quality is below the benchmark.
- **Partial:** a useful foundation exists; key benchmark behaviour is absent.
- **Not implemented:** no complete implementation was found in the audited repository.
- **Blocked:** implementation depends on an external API, credentials, approval, or a verified data source.

| Dhanda capability | LocalBoost implementation found | Audit status | Main gap |
|---|---|---|---|
| Google Profile score/audit | Evidence-backed checklist audit with Google API and owner-confirmed sources | Partial | Eight checklist fields only; not a full profile/media/engagement audit |
| Actionable profile insights and progress | Audit findings plus growth actions and owner tracking | Partial / strong foundation | No Google visibility/rank tracking or complete historical profile-health trend |
| SEO keyword analysis | Tamil/English rule-generated keyword ideas | Partial | No measured volume, live rank, difficulty, SERP evidence or keyword trend |
| Competitor analysis | Owner-confirmed competitor identity and dated snapshots | Partial | Manual observations; no automatic discovery or verified competitor data feed |
| Google review import | Read-only import from selected Google listing, up to five pages of 50 | Implemented (limited) | 250 reviews per run; no automatic recurring import |
| Personalised review replies | Local Ollama-generated private drafts; save/edit workflow | Partial | No Google reply publishing; privacy redaction does not cover all personal data |
| Weekly images and Google updates | Local AI post copy and visual creative brief; draft/approve/reject queue | Partial | Does not generate the image itself; no weekly scheduler or Google publishing |
| Facebook/Instagram social posting | No connected publishing workflow found in the audited code | Not implemented | No social account integration, publishing queue or delivery status |
| Unified growth cockpit | Deterministic overview, action tracking, baselines, goals, history and monthly report | Implemented (limited) | Dependent on entered/imported evidence; not yet a complete live cross-channel cockpit |

### 3.1 Google Business Profile audit

**Found**
- Owner can connect a Google account through OAuth and choose the account and listing.
- Profile import uses official Google Business Information and Account Management API endpoints.
- Imported fields include business title, primary category, storefront address, primary phone, website and regular hours.
- Audit findings preserve source, verification status and observation timestamp.
- The score is explicitly labelled checklist completeness, not Google ranking or visibility.

**Gaps**
- The checklist in `backend/src/audit.ts` contains only eight fields: business name, primary category, address, phone, website, hours, photos and Google connection.
- The importer does not currently populate photos, description, secondary categories, service area, attributes or Google posts.
- Photos are in the checklist but no photo evidence importer was found; this item cannot become verified through the current import path.
- The audit has no explicit severity or impact/effort prioritisation per checklist item.
- Imported evidence is saved without `expiresAt`; the audit filters expired evidence only when an expiry date is present. Consequently, an old Google observation can remain treated as current indefinitely.
- The accounts endpoint requests only the first 20 Google accounts. Location enumeration is paginated but capped at ten pages of 100.

**Verdict:** useful audit foundation, not yet a full Dhanda-style profile health audit. Add more profile fields, photo/post signals, a defined freshness policy and progress history before calling it complete.

### 3.2 Local SEO and keywords

**Found**
- Owner enters locality and products/services.
- Rules generate up to 30 Tamil/English keyword ideas and suggested placements.
- Suggestions are stored with `RULES_GENERATED` provenance.
- The UI clearly says that ideas are not live search volume, ranking or keyword-difficulty data.

**Gaps**
- No authorised keyword/search data provider, search-volume source, live rank tracker or historical position tracking.
- No competitor keyword gap data.
- Tamil generation primarily combines owner-entered service strings with locality and Tamil suffixes; it is not a full Tamil translation/transliteration or language-quality workflow.
- Relevance labels are rule assignments, not measured search demand.

**Verdict:** honest keyword ideation tool, not measured SEO analysis. Keep the disclosure and add a real data source before presenting metrics such as volume, competition or rank.

### 3.3 Competitor intelligence

**Found**
- Owner confirms a competitor's public identity and source URL.
- Dated snapshots can be saved and compared over time.
- The UI and docs correctly describe these as owner-recorded observations, not independently verified market rankings.

**Gaps**
- No automated competitor discovery, public-profile refresh, source validation or recurring monitoring.
- No independently sourced competitor keyword gaps or local share-of-voice.
- Comparisons are only as reliable and recent as the owner's snapshots.

**Verdict:** a transparent manual competitor notebook, not yet automated competitor intelligence.

### 3.4 Reviews and response assistant

**Found**
- Google reviews can be imported read-only from the selected verified listing.
- The import deduplicates by review ID, preserves rating/text/date and any existing Google reply, and avoids storing reviewer names and profile photos.
- Import fetches up to five pages of 50 reviews (250 per run) and exposes whether the page limit was reached.
- Review themes use a transparent bilingual keyword heuristic, report sample size/date coverage, and disclose limitations.
- Review replies can be drafted using local Ollama; email addresses and Indian mobile numbers are redacted first.
- Drafts remain private and require owner review/save. No reply is sent.

**Gaps**
- No recurring review-import schedule or automatic incremental sync.
- No publish/reply endpoint or published/failed reply lifecycle.
- The current redactor targets emails and Indian mobile numbers only. Names, addresses and other personal details in review text may still be sent to the local model. The local-only design reduces external exposure but does not eliminate this privacy concern.
- Keyword sentiment/theme analysis is directional and can miss sarcasm, spelling variants and context. It must not be marketed as a high-confidence AI sentiment score.

**Verdict:** good privacy-aware draft workflow and a real read-only Google review import; publishing and stronger privacy controls remain.

### 3.5 Google content, images and social marketing

**Found**
- Optional local Ollama creates editable Tamil/English Google post copy and a format-specific creative brief from owner-supplied facts.
- Drafts can be saved and owner-approved or rejected.
- Approval is explicitly for manual publishing only; no automatic publishing/scheduling occurs.

**Gaps**
- A creative brief is not an image. No actual image-generation pipeline is connected to this module.
- No recurring weekly image/update schedule.
- No Google Business Profile post publishing integration.
- No Facebook/Instagram connection, simultaneous posting or publish-status reconciliation found.
- The legacy Campaign Studio still has a separate local template-based draft flow. This overlaps the newer Google Content workflow and can confuse users about which composer is AI-assisted and which approval queue is authoritative.

**Verdict:** copy and approval foundation only. This is the largest visible Dhanda parity gap after measured SEO and profile coverage.

### 3.6 Unified growth dashboard and LocalBoost differentiators

**Found**
- Deterministic growth overview produces up to three evidence-linked actions.
- Owners can accept, track, complete or dismiss actions with notes.
- Growth history, action measurements, monthly goals, goal history, owner baselines and monthly performance reports exist in code.
- Menu and sales intelligence, retention aggregates and campaign records are available.
- Local AI explains deterministic reports rather than controlling calculations.
- Demo data is excluded from growth reporting; missing evidence is not intentionally converted to zero.

**Gaps**
- Sales, menu and retention records are still owner-entered unless a separate import is supplied.
- Growth overview reads a capped sample of 1,000 growth records and 500 evidence records; some reports also have explicit retrieval limits. The UI must keep showing coverage and truncation warnings.
- No actual Paanagam POS connection, automated sales sync, reconciliation or sync-run history.
- Retention metrics are aggregate/manual, not yet POS-derived cohorts.
- The initial unauthenticated overview contains sample-only indicators. They are labelled sample, but the product should keep them visually and behaviourally separate from live business results.

**Verdict:** LocalBoost has a broader growth-management foundation than the public Dhanda feature list, but it needs reliable source integrations before its dashboard can become a live business cockpit.

## 4. Engineering, security and operational audit

### Positive controls found
- Business records and most business routes are scoped through authenticated ownership checks.
- Passwords are hashed using Argon2id.
- Access tokens are short-lived (15 minutes).
- Google access and refresh tokens are encrypted at rest with AES-256-GCM.
- Google OAuth uses state, a PKCE S256 challenge and a ten-minute state expiry.
- Helmet, CORS allowlisting and global rate limiting are registered.
- Request data is validated with Zod; growth payloads are capped at 64 KB.
- Growth records use a business/type/external ID uniqueness key and paginated reads.
- Google API evidence cannot be created through the ordinary owner evidence endpoint.
- No POS writeback or Google publishing path was found in the audited implementation.

### High-priority gaps

**P0 — CI build is failing**
- Latest code CI run inspected: https://github.com/baanusiv-ui/paanagam-localboost-ai/actions/runs/42574971411
- Build step failed; test and dashboard syntax-check steps were skipped.
- TypeScript errors were reported in:
  - `backend/src/growth-action-measurement.test.ts` (3 errors)
  - `backend/src/growth-goals.test.ts` (3 errors)
  - `backend/src/growth-performance-report.test.ts` (2 errors)
- Fix strict-null/undefined assertions in the tests, rerun the entire workflow, and require green CI before further release work.

**P0 — Authentication lifecycle**
- Access tokens are held in browser `sessionStorage`, not an HttpOnly Secure cookie.
- No refresh-token rotation, server-side session revocation, email verification, password reset or MFA flow was found.
- Login and registration rely on the global 100-requests-per-minute rate limit; add tighter endpoint-specific throttling, progressive delay and abuse monitoring.
- Decide and document the production session strategy before launch.

**P0 — Evidence freshness**
- Google evidence import does not set an expiry time.
- Audit logic only excludes evidence whose explicit expiry is in the past.
- Add a source-specific freshness TTL, stale status and refresh action. Do not count old Google data as current verified evidence.

**P1 — Review privacy**
- Extend personal-data handling beyond email/mobile patterns, or provide a clear owner-controlled redaction/consent step before sending review text to Ollama.
- Add tests for names, addresses, URLs, order identifiers and other likely personal data.

**P1 — Google API reliability**
- Add explicit network timeouts and bounded retries for Google API calls.
- Surface partial location/account pagination and any API page caps to the owner.
- Review the selected Google scope and keep all current operations read-only.
- Add tests for revoked tokens, missing scopes, rate limits, pagination and partial failures.

**P1 — Audit trail and approvals**
- Keep exact approved content, approver, timestamp and revision linkage for each external action.
- Current content approval is an internal status for manual publishing; do not describe it as published or scheduled.
- Add auditable import/sync events and safe operational error details.

**P1 — Deployment readiness**
- Repository documentation states that email verification, password reset, refresh-token rotation and MFA are not implemented.
- Production database migration state, backups, monitoring, secret rotation, retention and incident response cannot be verified from source alone.
- No production deployment or live database verification was performed in this audit.

## 5. Paanagam POS integration audit

**Status: BLOCKED — no verified POS API contract or live connector.**

The repository has a documented integration boundary and readiness checklist. LocalBoost is intended to be a separate product and consume a read-only feed; Paanagam POS remains the system of record.

Current facts:
- Sales and menu analytics are based on owner-entered records in the current workspace.
- The POS contract is documented as a proposal/requirement, not a deployed connector.
- No actual POS base URL, endpoint schema, authentication, credentials, sample JSON or successful sync was found.
- No direct POS database connection or POS writeback should be introduced.

Required before implementation:
1. POS API base URL, version, authentication method and read-only scope.
2. Sanitised daily sales and menu-item JSON examples.
3. Business/branch ID mapping and business-date/timezone rules.
4. Exact gross/net/tax/discount/refund/void/cancellation rules.
5. Stable source IDs, update cursor, pagination, retry and correction semantics.
6. Staging tests and reconciliation to POS closing reports.
7. Owner approval for staging and separate approval for production sync.

Related documents:
- `docs/POS_INTEGRATION_CONTRACT.md`
- `docs/PAANAGAM_POS_API_INTEGRATION_READINESS.md`
- `docs/PAANAGAM_POS_API_DEVELOPER_HANDOFF.md`

## 6. Prioritised roadmap to close the gap

### P0 — Make the current product reliable
1. Fix the eight TypeScript test compilation errors and get all CI steps green.
2. Implement the production authentication lifecycle: safer token storage, revocation/rotation, verification/reset and rate limits.
3. Add Google evidence freshness and stale-data handling.
4. Verify migration application and Prisma generation in the intended staging environment.
5. Remove ambiguity between the legacy Campaign Studio template and the newer AI Google Content workflow.

### P1 — Reach the core Dhanda benchmark
1. Expand the Google audit to profile description, categories, service area, attributes, photos, posts and review-response/media freshness where authorised APIs support them.
2. Add a source-backed SEO provider or clearly retain the current feature as keyword ideation; do not invent volume/rank/difficulty.
3. Improve competitor monitoring with authorised public evidence, source timestamps and repeatable snapshots.
4. Add recurring read-only review import and robust review privacy controls.
5. Add actual image generation and a weekly content calendar; retain per-item approval and no automatic publishing until separately authorised.
6. Add optional, explicitly approved Google publishing and reply capabilities only after API access, scopes, tests and owner confirmation. Record publish result and failures.

### P2 — Make LocalBoost's broader platform advantage real
1. Implement the Paanagam POS read-only connector only after the actual contract arrives.
2. Import daily sales and menu-item aggregates with idempotency, cursors, retries and reconciliation.
3. Build reliable item mix, sales trend, AOV and daypart analysis from source-supported fields.
4. Add privacy-safe retention cohorts only when POS aggregates support them.
5. Add source completeness and coverage indicators to all capped reports.
6. Expand multi-business onboarding, deployment operations, monitoring, backups and support processes.

## 7. Release gates

Do not call LocalBoost production-ready until all are true:
- [ ] Latest CI is green: Prisma validate/generate, TypeScript build, all tests, frontend syntax checks.
- [ ] Staging migrations are applied and schema matches Prisma.
- [ ] Auth lifecycle and abuse controls are tested.
- [ ] Tenant isolation tests cover every business endpoint.
- [ ] Google evidence has source-specific freshness and expiry.
- [ ] Google API errors, pagination and revocation are handled.
- [ ] Review text privacy controls are tested.
- [ ] Approval records are immutable/auditable for any future external publishing.
- [ ] POS API contract is received, implemented and reconciled in staging before production sync.
- [ ] Backups, monitoring, secrets, retention, incident response and data deletion/export are documented and tested.
- [ ] Owner explicitly approves each external publishing or production integration activation.

## 8. Audit limitations

This was a repository/source-code audit of the `main` branch at commit `840d7d4bf1788558784cae731762d97044161dc3`, plus a review of the public Dhanda listing and website. It did not include:
- signing into the live LocalBoost app,
- connecting to a real Google Business Profile,
- inspecting a production database or deployed environment,
- testing a real POS API (none was supplied),
- a penetration test or third-party security assessment,
- hands-on verification of Dhanda's paid features.

A feature described as implemented means source code and UI paths were found; it does not imply successful operation in a deployed environment.
