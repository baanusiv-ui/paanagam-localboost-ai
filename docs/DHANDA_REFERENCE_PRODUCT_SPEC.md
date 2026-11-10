# Dhanda-Inspired LocalBoost AI Product Specification

## Reference
Use Dhanda AI Marketing by EZO (Google Play package: `com.dhanda.app`) as a product-capability benchmark only. Do not copy its branding, visual assets, proprietary text, or implementation.

Reference capabilities described in its public store listing:
- Google Business Profile score/audit
- SEO keyword analysis
- Competitor analysis
- AI-assisted Google review replies
- Recurring Google profile images and updates

## Product direction
LocalBoost AI should deliver these capabilities as a practical growth workspace for Indian local businesses, with Tamil and English support, transparent evidence, owner approval, and privacy-conscious data handling.

## Main navigation
1. Overview
2. Google Profile Audit
3. Local SEO
4. Competitors
5. Reviews
6. Posts & Creatives
7. Growth Consultant
8. Approvals & Activity
9. Business Settings

## Functional requirements

### 1. Google Business Profile audit
- Connect an owner's Google Business Profile through the official Google authorization flow.
- Show profile completeness and verified fields: business name, primary/secondary categories, address/service area, hours, phone, website, description, attributes, photos, and posts.
- Give each finding a severity, explanation, evidence/source, and recommended next step.
- Distinguish live Google data from owner-entered or inferred data.
- Never imply a Google ranking guarantee.

### 2. Local SEO keyword intelligence
- Support location-aware keyword discovery for city, locality, and service/product.
- Show search intent, relevance, competition/difficulty when a reliable source exists, and suggested page/profile placement.
- Support Tamil and English queries, transliteration, and common local-language variants.
- Label estimates and data sources; do not fabricate search volumes or rank positions.

### 3. Competitor intelligence
- Let the owner choose or confirm nearby competitors.
- Compare public profile signals such as categories, rating/review count, review themes, profile completeness, photos, and recent posting activity when accessible.
- Explain gaps as opportunities, not claims about private competitor performance.
- Include source URLs and observation dates.

### 4. Review reply assistant
- Draft replies in Tamil, English, or bilingual style.
- Adapt tone to positive, neutral, and negative reviews.
- Avoid exposing personal/customer data or making unsupported promises.
- Require owner approval before posting; no automatic replies by default.
- Keep draft, approved, published, and failed states auditable.

### 5. Google posts and creative calendar
- Generate post drafts for offers, products, events, festivals, and business updates.
- Provide image/creative briefs and reusable aspect-ratio guidance.
- Include Tamil copy, English copy, and bilingual variants.
- Use a calendar with draft, approval, scheduled, published, and failed states.
- Require explicit owner approval before publishing or scheduling.

### 6. Growth dashboard and consultant
- Combine audit findings, keyword opportunities, competitor gaps, review themes, and content activity.
- Prioritize actions by expected impact, effort, and confidence.
- Cite evidence and distinguish measured facts from recommendations.
- Keep existing deterministic intelligence as the source of truth; local AI may explain and prioritize, but must not invent metrics.
- Support Tamil, English, and bilingual responses.

## Cross-cutting requirements
- Tenant isolation: every record and API query must be scoped to the authenticated business owner.
- Least privilege for Google integrations; store tokens securely and never expose them to the browser.
- Owner approval for external actions, especially posting and review replies.
- Clear provenance, timestamps, confidence, and audit history.
- Graceful handling when Google APIs or third-party data are unavailable.
- Mobile-friendly interface, while retaining the current web dashboard/API architecture.
- No scraping or unsupported access to private Google or competitor data.

## Implementation status

- Google profile connection and read-only listing evidence import: existing foundation.
- Evidence-based profile audit: implemented with audit history. Its percentage measures checklist coverage, not Google ranking or visibility.
- Local SEO keyword planner: implemented as tenant-scoped, rules-generated Tamil/English suggestions from owner-entered services and locality. No search volume, ranking, or difficulty metrics are fabricated.
- Competitor workspace: implemented with owner-confirmed public profile identity, required source URL and observation date, repeatable snapshots, latest-to-prior rating/review-count comparisons, and snapshot history. These are owner-entered observations, not independently verified competitor rankings.
- Review assistant: owner-supplied reviews can receive private Tamil/English reply drafts using the optional local Ollama model. Email addresses and Indian mobile numbers are redacted before generation. Drafts must be reviewed and saved by the owner; no reply is sent. Read-only review import from the selected verified Google Business Profile is implemented, paginated and capped at 250 reviews per run. Reviewer names and profile photos are not stored. Review-theme analysis is implemented as a transparent bilingual keyword heuristic across service, food quality, price/value, ambience/cleanliness, staff, waiting time and other. It shows sample size, date coverage, text/rating-only counts, directional sentiment and limitations. Reply publishing remains pending; drafts are never sent.
- Google content calendar: local Ollama can generate editable Tamil/English post copy and a format-specific designer brief from owner-supplied facts. Draft saving and approval remain separate; the brief is not an image. Manual publishing only; automatic scheduling and publishing are not connected. Manual Owner GBP profile details, checklist progress, private reply drafts and post drafts now persist through authenticated, tenant-scoped growth records in the selected business workspace. Post drafts may carry an optional planned date; this is a planning field, not a scheduler. Browser-local legacy GBP drafts are not silently migrated and require an owner backup/import.

## Suggested delivery sequence

1. Audit and keyword foundations: existing read-only profile evidence and rules-generated keyword planner.
2. Competitor workspace: implemented; continue with authorised public evidence integrations only where supported.
3. Review workflow: private local reply drafting and read-only authorised Google review import implemented; theme analysis and auditable publish lifecycle remain.
4. Content studio: improve post copy and creative briefs, then add authorised publishing only behind per-item approval.
5. Unified growth cockpit: cross-module priorities, trends, and consultant explanations.

## Acceptance criteria
- Each score or recommendation links to its underlying evidence and source date.
- Missing integrations show a clear setup state rather than simulated live data.
- No external post or review reply is published without explicit approval.
- Tamil and English content can be generated and edited before approval.
- Automated tests cover tenant boundaries, provenance, approval states, and unavailable integrations.


## Growth Overview Intelligence
The owner workspace presents up to three deterministic, evidence-linked growth actions. Each action includes source provenance, date range, calculation, confidence, and explicit owner approval. Scores are rule-based signal-strength indicators, not predicted revenue impact. Demo records are excluded; the system does not automatically execute recommendations or publish content.


## Growth Action Tracking
Growth suggestions support owner-managed states (suggested, accepted, in progress, completed and dismissed) with optional progress notes and timestamps. Tracking is stored per business and reattached to refreshed recommendations using stable action IDs. Stale IDs are rejected. The feature requires the `20261109110000_growth_action_tracking` database migration. Tracking a recommendation does not execute it or publish anything.


## Official Website Benchmark Review (10 November 2026)

Primary reference: https://dhanda.app/ . This section records the capabilities advertised on the public website; vendor-reported adoption and performance figures are marketing claims and are not independently verified.

### Website-advertised capabilities
- Google Maps optimization: profile performance score, actionable insights, recommendations to improve local visibility, and progress tracking.
- AI social posting: generate images and captions, create content ideas for festivals, product shots and offers, and publish to Facebook and Instagram from one app.
- Ready-to-share AI content library.
- Website marketing claims include 10,000+ local businesses, 50,000+ reviews managed, and 2M+ social posts created; treat these strictly as Dhanda-reported claims, never as LocalBoost benchmarks.

### Expanded parity assessment
- Google profile audit and action recommendations: LocalBoost has an evidence-based completeness audit. It must not be represented as an actual Google Maps rank/visibility score unless a valid measurement source is integrated.
- Progress tracking: LocalBoost has owner-managed growth-action status tracking. Historical Google visibility/performance trend charts are a separate capability and remain a gap until a supported data source is available.
- Social image generation: current LocalBoost content workflow creates copy and creative briefs; actual generated image assets and a reusable asset library remain to be built/integrated.
- Facebook + Instagram cross-posting: not implemented. Requires supported Meta authorization, connected Page/Instagram professional account, permission review, token handling, and channel-specific publishing validation.
- Google Business Profile posts: keep separate from Meta social publishing. Do not assume one channel's authorization grants access to another.
- Content calendar and approvals: retain explicit per-item owner approval. Do not automatically publish or schedule merely because Dhanda advertises automation.
- Review replies: remain private drafts until the owner explicitly approves a supported publish action.

### LocalBoost implementation priorities from this review
1. Build a real Creative Studio: image generation, editable captions, brand/business asset library, Tamil/English variants, and channel-specific formats.
2. Add Meta account connection diagnostics and Facebook/Instagram publishing only after permissions and account eligibility are verified; retain approval queue and audit log.
3. Add a content calendar that separates draft, owner-approved, scheduled (only when a real scheduler is connected), published (confirmed by channel response), and failed states.
4. Add historical Google Business Profile performance charts only from authorised Google metrics; show source, date range, and missing-data states.
5. Preserve tenant isolation and per-business content ownership across all assets, drafts, approvals, and publishing connections.


## Creative Studio Delivery Increment (10 November 2026)

- Replaced the basic campaign composer with a responsive Creative Studio workspace.
- Campaign inputs include topic, owner-supplied offer/facts, destination channel, feed/story format, language and tone.
- Uses the existing authenticated local Ollama content-draft endpoint. Maps its postCopy and creativeBrief output into a reviewable preview.
- Saves creative drafts as CAMPAIGN_DRAFT growth records in the authenticated selected-business workspace, with tenant ownership enforced by the existing growth-record API.
- Includes a business-scoped creative library, caption copy action, optional HTTPS URL reference to a finished image, and an owner-approval state. Approval is an internal record only; it does not publish or schedule.
- Signed-out and unavailable-cloud states are shown. No browser-local persistence is used for the creative library.
- Actual image generation/upload and connected Meta/Google publishing are not part of this increment. The optional asset URL attaches a reference to an image created elsewhere; it is not an image generator or file uploader.
- No deployment or live browser/backend integration test was performed. Validate authenticated save/load, business isolation, local Ollama output, approval-state persistence and mobile layout before production use.
