# LocalBoost Review Intelligence & Customer Voice — Paanagam pilot

Status: product requirement and implementation specification. This document does not connect accounts, ingest customer data, generate paid assets, reply to reviews, publish content or deploy production changes.

## Product outcome

Add a first-class **Review Intelligence** module to LocalBoost. For the Paanagam pilot, it turns eligible customer feedback from Google Business Profile and Meta surfaces into evidence-backed operational insights and owner-approved content ideas.

The workflow must remain inside LocalBoost:
1. Connect and authorise supported review sources.
2. Sync eligible feedback and retain source provenance.
3. Classify sentiment, themes, urgency and recurring pain points.
4. Present evidence and trend summaries to the owner.
5. Recommend operational fixes and draft posts that address verified themes.
6. Route every public response and post through the existing approval centre.
7. Publish only after explicit, scope-specific approval and record the result.

Gemini may provide classification and drafting behind the LocalBoost server. It is not a separate user workflow. Keep the product multi-tenant; Paanagam is only the pilot workspace.

## Source coverage and honest capability boundaries

### Google
- Use the authorised Google Business Profile APIs and scopes for locations and reviews where available.
- Store location and review identifiers, reviewer display name only when necessary for display, rating, text, create/update timestamps, reply state and source URL when returned.
- Respect API access, quota, retention and reply capabilities. Do not scrape Google Maps or bypass access controls.
- Distinguish reviews from Q&A, profile messages and other surfaces; do not imply they are all available through the same API.

### Meta
- Use Meta Graph API permissions and endpoints available to the connected Facebook Page and Instagram professional account.
- Support only feedback objects actually returned and permitted for the connected account, such as Page recommendations/reviews where available, comments on owned posts and relevant Instagram comments.
- Do not promise a universal Instagram reviews feed: Instagram comments are not equivalent to star-rated business reviews.
- Show a source-coverage status for each connected asset and clearly label unavailable data or permissions. Never scrape private groups, personal profiles or inboxes.

### Connector state
For each source/asset, display connected account, granted scopes, last successful sync, sync health, coverage limitations and reconnect action. Use least-privilege OAuth, encrypted server-side tokens, revocation handling and tenant-scoped access. Never request or store passwords.

## Review and feedback data model

Suggested entities (names may be adapted to existing schema conventions):
- `FeedbackSource`: tenantId, provider, connectedAssetId, externalAssetId, grantedScopes, coverage, syncCursor, lastSyncAt, status.
- `FeedbackItem`: tenantId, sourceId, externalItemId, itemType, rating nullable, text, language, createdAt, updatedAt, permalink nullable, replyStatus, contentHash, deletedAt nullable.
- `FeedbackAnalysis`: feedbackItemId, model/provider, promptVersion, sentiment, themes[], painPoints[], praisePoints[], urgency, confidence, language, evidenceSpans[], analysedAt.
- `PainPointCluster`: tenantId, canonicalTheme, description, count, firstSeenAt, lastSeenAt, trend, severity, representativeFeedbackIds[], status, ownerNotes.
- `ImprovementAction`: clusterId, proposedAction, owner, status, dueDate nullable, resolutionEvidence nullable.
- `ContentRecommendation`: clusterIds[], objective, platform, language, proposedFormat, copyDraft, creativeBrief, factualEvidence[], caveats[], status.
- `FeedbackApproval`: exact revision IDs, approval scope, approver, decision, timestamp.
- `FeedbackAuditEvent`: actor, tenantId, action, entity IDs, timestamp and safe metadata.

Use stable external IDs and content hashes for idempotent sync. Upsert edits; handle deleted/hidden source items according to provider policy. Store only data needed for the feature. Enforce tenant isolation in every query, job and storage path.

## Analysis pipeline

For each eligible item:
- Detect language (Tamil, English, Tanglish or other supported language).
- Classify sentiment as positive, neutral, negative or mixed.
- Extract specific themes, such as taste/consistency, coffee temperature, freshness, portion/value, pricing clarity, waiting time, staff courtesy, order accuracy, cleanliness, ambience, availability and accessibility.
- Separate an explicit customer statement from an AI inference. Preserve short evidence spans and link every insight to its source item.
- Estimate urgency and confidence. Low-confidence or ambiguous classifications must be labelled for owner review, not presented as facts.
- Detect duplicates and coordinated/spam-like patterns cautiously; do not automatically discard legitimate criticism.
- Aggregate recurring issues by count, recency, rating and trend. Show denominators and date ranges so small samples are not overstated.
- Avoid inferring sensitive traits, identity, health, income or other personal characteristics. Do not create customer profiles.

AI output must be schema-validated, versioned and reproducible. Treat review text as untrusted input, not instructions. Do not allow prompt injection in review content to trigger tools, reveal secrets or bypass approvals.

## Owner dashboard

Create a Review Intelligence dashboard with:
- Source coverage and sync health.
- Total feedback analysed, period and sample size.
- Sentiment distribution and rating trend where ratings exist.
- Top positive themes and top pain-point clusters.
- New, rising, persistent and improving issues.
- Evidence drawer showing source, date, rating, exact excerpt and confidence.
- Filters for source, date, language, sentiment, theme and status.
- Clear separation between customer-reported facts, model-generated interpretation and owner-confirmed conclusions.

Do not use a single sentiment score as a substitute for reading evidence. Include a minimum-sample warning and avoid trend claims when data is insufficient.

## Pain point to improvement to content workflow

A recommendation must follow this sequence:
1. **Evidence:** show the recurring feedback items and counts supporting the theme.
2. **Owner validation:** owner marks it valid, not applicable, already resolved or needs investigation.
3. **Operational action:** suggest a practical fix with an owner and optional due date. Do not claim the business has implemented a fix.
4. **Resolution check:** owner records what changed and when; future feedback is used to assess whether the issue is reducing.
5. **Content draft:** only then, or when explicitly requested, create an honest post explaining the action or improvement. If the issue is unresolved, draft an acknowledgement/helpful update rather than claiming it is fixed.
6. **Approval:** show exact copy, creative, platform, audience and scheduled time in the existing approval centre.
7. **Publish and measure:** publish only after explicit approval; track post ID, reach/engagement and subsequent feedback trend.

Content examples:
- Repeated wait-time feedback → investigate peak-hour workflow; after a verified change, draft a post explaining the improved ordering process.
- Coffee temperature/consistency feedback → review preparation SOP; after owner confirms the change, draft a post about the quality-control practice.
- Value/pricing confusion → improve menu clarity; draft an informative menu explainer using owner-approved prices only.

Never turn an individual complaint into a public call-out. Never quote or identify a reviewer without explicit permission. Never fabricate testimonials, ratings, customer consent, fixes, offers, prices or outcomes. Avoid defensive, argumentative or manipulative language.

## Content generation inside LocalBoost

- Generate Tamil-first, English and bilingual drafts as selected by the owner.
- Offer suitable formats: Google Business Profile update, Facebook post, Instagram caption/Reel brief and short FAQ/helpful explainer.
- Use Gemini for structured draft copy and a creative brief; use the existing LocalBoost image/video providers and brand kit for assets.
- Keep exact prices, offers, hours, address, menu facts and claims grounded in owner-approved business data.
- Make the link between a post and its supporting pain-point cluster visible.
- Include a review-response draft only where the connected provider supports replies and the user explicitly requests it. Replies are separately approved from marketing posts.
- Do not automatically publish a post merely because a cluster reaches a count threshold.

## Approval and safety gates

Separate approval scopes:
- Connect/reconnect each data source and grant provider permissions.
- Enable a source sync (read access).
- Approve any public review reply.
- Approve each organic post and its exact media/copy revision.
- Approve paid promotion separately, including audience, dates and budget.

Any material edit invalidates the prior approval. No automatic replies, posts, boosts, ad launches, budget changes or external actions. Maintain an immutable audit trail of approvals and executions. Provide pause/disconnect controls and respect provider deletion/revocation requirements.

## Reporting and success measures

Track:
- Source sync success, freshness, coverage and API errors.
- Feedback volume and analysis coverage by source.
- Classification confidence and owner correction rate.
- Pain-point recurrence, time-to-owner-review and time-to-resolution.
- Share of content recommendations accepted, edited or rejected.
- Post performance by platform, without claiming causality.
- Whether validated pain-point frequency changes after an operational fix, with date windows and sample sizes.

Do not claim a post caused a review trend change; report correlation only.

## Delivery plan

**Phase 1 — Foundation:** schema, tenant isolation, source coverage model, audit events and read-only dashboard shell.

**Phase 2 — Google feedback:** authorised Google Business Profile review sync, pagination, idempotency, deletion handling and sync health.

**Phase 3 — Meta feedback:** permission-aware Page/Instagram owned-content feedback sync; explicit coverage labels and graceful unsupported-surface states.

**Phase 4 — Intelligence:** Tamil/English/Tanglish language handling, sentiment, theme taxonomy, evidence spans, confidence, clustering and trend views.

**Phase 5 — Action loop:** owner validation, improvement actions, resolution tracking and pain-point-linked content recommendations.

**Phase 6 — Approval and publishing:** connect to existing approval centre and existing Google/Meta publishing integrations; separate approval for replies, organic posts and paid promotion.

**Phase 7 — Measurement:** post metrics and subsequent feedback trend reporting.

Each phase requires tests, security review and owner acceptance before progressing. Implement behind a feature flag and pilot only with Paanagam's explicitly connected accounts.

## Acceptance criteria

- A tenant cannot read another tenant's sources, feedback, analysis, assets or approvals.
- Re-syncing the same provider page does not create duplicate feedback items.
- Unsupported permissions and unavailable Meta review surfaces are clearly reported rather than simulated.
- Every pain-point insight links to supporting feedback and shows its sample size/date range.
- Tamil, English and Tanglish content is editable; uncertain translations/classifications are flagged.
- No public reply, post, paid campaign or budget change occurs without the correct explicit approval.
- A material copy/media/targeting/schedule change requires renewed approval.
- Content cannot claim a fix, offer or fact that the owner has not confirmed.
- Disconnecting a source stops future sync and triggers applicable token/data handling.
- Existing LocalBoost Gemini copy, Meta Muse creative, Google Business Profile features and approval centre pass regression tests.

## Out of scope for the first release

- Scraping Google Maps, personal Instagram profiles, private groups or private messages.
- Automated public replies or automated posting.
- Customer-level profiling, identity enrichment or sensitive-trait inference.
- Automatic service changes, discounts, refunds or compensation.
- Claims of causal impact from content on ratings or review volume.
- Production deployment or database migration before review and explicit approval.


## Customer-understanding educational video engine

Add a dedicated **Customer Education** content type to LocalBoost, alongside pain-point response posts. Its purpose is to help customers understand products, ingredients, preparation, menu choices and how to get the best experience at Paanagam—not simply to promote offers.

### Evidence-led topic discovery
- Discover recurring customer questions, misunderstandings and information gaps from eligible Google and Meta feedback, comments and owner-approved FAQs.
- Combine those signals with owner-provided menu, recipe, ingredient, preparation and service information.
- Rank topics by frequency, recency, customer usefulness and confidence; show the underlying evidence and sample size.
- Distinguish an observed customer question from a hypothesised knowledge gap. Never assume every customer is confused.
- Do not infer personal attributes or create individual audience profiles. Use broad, non-sensitive topic interests only.

### Educational video formats
Generate editable concepts and scripts such as:
- **Product explainers:** what traditional filter coffee is and what makes its preparation distinctive.
- **Ingredient explainers:** explain ingredients or choices only from owner-verified product information.
- **How it's made:** show approved preparation steps, equipment and hygiene practices without revealing confidential SOPs.
- **Menu guides:** explain available choices, serving styles, portions or how to order, using current approved menu facts.
- **Myth vs fact:** correct a recurring misconception respectfully, with evidence and no exaggerated health or nutrition claims.
- **Frequently asked questions:** answer common questions in concise Tamil-first videos, with English or bilingual variants.
- **Experience guides:** explain ordering, service flow or practical visit information when verified by the owner.

### Video creation workflow
1. LocalBoost proposes an educational topic with customer evidence, why it matters and the factual sources needed.
2. Gemini creates a short, structured script and storyboard: hook, simple explanation, visual demonstration, takeaway and optional owner-approved CTA.
3. The owner checks factual accuracy, especially ingredients, preparation, pricing, availability, nutrition, allergens, hygiene and operating details.
4. Use the existing LocalBoost creative pipeline and approved video provider (including WAN where configured) to create footage. Add exact Tamil/English text, subtitles, logo and voiceover through the brand-safe composition workflow.
5. Generate previewed platform variants for Instagram Reels, Facebook, YouTube Shorts and Google-supported video placements where available. Respect each placement's current format and duration limits.
6. Preview pronunciation, subtitles, factual claims, accessibility and brand consistency. Owner approval is required for the exact final asset and caption before publishing.
7. Track watch time, completion, saves, shares, comments and follow-up questions where platform APIs expose them. Feed new questions back into topic discovery.

### Editorial and safety rules
- Teach first; sell second. Do not turn every educational video into an advertisement.
- Keep scripts simple, useful, culturally natural and Tamil-first when appropriate; support English and bilingual adaptations.
- Never invent ingredients, sourcing, preparation methods, nutrition/health benefits, allergen status, certifications, prices, offers, availability or business practices.
- Do not provide medical or dietary advice. For allergen or health-related questions, use only verified business information and recommend customers confirm directly with staff where details are uncertain.
- Do not use a customer's name, face, voice, review text or identifiable story without explicit permission.
- Do not publish unverified claims or imply a process has changed until the owner confirms it.
- Each video draft must retain its topic evidence, approved fact sources, script revision, generated asset IDs and approval record.

### Acceptance criteria
- The owner can distinguish pain-point response content from educational content.
- Every proposed topic includes a clear customer-learning objective and evidence or is explicitly labelled as an owner-suggested topic.
- Every factual statement in a script is traceable to owner-approved business information.
- Tamil-first scripts have editable subtitles and a voiceover preview; uncertain pronunciation is flagged for review.
- Video generation cost and provider are shown before any paid generation, with explicit per-job approval.
- No video is published without approval of the exact video, script, caption, channel and schedule.
- Performance reporting separates educational engagement from direct sales attribution; do not claim causality without evidence.
