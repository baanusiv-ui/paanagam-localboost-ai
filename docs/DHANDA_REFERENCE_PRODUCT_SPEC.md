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
- Review assistant: owner-supplied reviews can receive private Tamil/English reply drafts using the optional local Ollama model. Email addresses and Indian mobile numbers are redacted before generation. Drafts must be reviewed and saved by the owner; no reply is sent. Read-only review import from the selected verified Google Business Profile is implemented, paginated and capped at 250 reviews per run. Reviewer names and profile photos are not stored. Review-theme analysis and reply publishing remain pending; drafts are never sent.
- Google content calendar: local Ollama can generate editable Tamil/English post copy and a format-specific designer brief from owner-supplied facts. Draft saving and approval remain separate; the brief is not an image. Manual publishing only; automatic scheduling and publishing are not connected.

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
