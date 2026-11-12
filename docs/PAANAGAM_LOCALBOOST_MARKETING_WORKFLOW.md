# Paanagam marketing campaign workflow — LocalBoost control plane

Status: product requirement and implementation plan. This document does not activate paid AI generation, connect ad accounts, publish posts, or spend advertising budget.

## Product decision

All Paanagam marketing work is initiated, managed, reviewed and tracked inside the LocalBoost owner workspace. LocalBoost is the control plane and system of record; Gemini, PoYo WAN, Meta and Google are provider integrations behind the workspace, not separate manual operating workflows.

Paanagam is the pilot business workspace. Keep the LocalBoost product independent and multi-tenant.

## Campaign brief

Create an owner-facing campaign brief inside Campaign Studio with:
- business/workspace (Paanagam);
- campaign objective (brand awareness, store visits, engagement, leads or sales);
- campaign theme/product (e.g. South Indian filter coffee);
- approved factual inputs (menu, prices, offers, dates, location, CTA and contact details);
- target geography and audience;
- language (Tamil, English or bilingual);
- placements/channels (Google Ads/YouTube and Meta: Facebook/Instagram);
- asset requirements and formats;
- campaign budget and dates, if paid advertising is requested.

Never invent price, discount, address, availability, operating hours, claims, customer testimonials or product facts. Missing facts must be marked as requiring owner input.

## AI orchestration inside LocalBoost

1. Gemini campaign strategist: generate campaign angle, audience hypotheses, messaging strategy, platform-specific ad copy, captions, headlines, descriptions, CTA and a structured 8-second storyboard. Persist model, prompt version, inputs and editable outputs in the campaign record.
2. WAN 2.7 video provider (PoYo): generate the approved 8-second video from the storyboard prompt. First release supports text-to-video and image-to-video. Default creative format is 9:16; adapt/crop only through a previewed export step for 4:5, 1:1 and 16:9. Show a cost estimate and require explicit per-generation confirmation before paid submission.
3. Brand and copy composition: use the approved Paanagam brand kit, official logo, palette and tagline "காபியும் >< கதையும்". Keep generated footage free of embedded text; add Tamil/English captions, logo, offer, CTA and subtitles using deterministic composition so spelling and prices remain exact.
4. Audio: Tamil voiceover is generated/recorded as a separate audio step using an approved voice provider; do not assume WAN output has accurate Tamil speech. Preview voice, pronunciation and timing before approval.
5. Export pack: generate platform-specific previews and metadata:
   - Google/YouTube: 16:9 and vertical 9:16 assets where supported, headline/description/CTA variants, campaign objective and destination URL.
   - Meta: 9:16 Reels/Stories, 4:5 feed and 1:1 feed variants, primary text, headline, description and CTA.
   Preserve one master creative and trace each derivative to it.
6. Approval centre: owner sees the exact final video, copy, destination, channel, audience, dates, spend and provider cost. Require separate approvals for (a) AI generation spend, (b) organic publishing, and (c) paid campaign launch/budget. Material edits invalidate prior approval.
7. Execution and reporting: after authorised integrations and explicit approvals, LocalBoost can publish/schedule organic content and create/manage Google/Meta paid campaigns. Store platform IDs, status, timestamps and performance metrics. Never publish, boost, launch, or change budget autonomously.

## Initial 8-second Paanagam campaign brief

- Brand: Paanagam (பானகம்)
- Tagline: காபியும் >< கதையும்
- Product focus: traditional South Indian filter coffee
- Objective: brand awareness and local customer visits
- Tone: warm, authentic, welcoming, mass-market South Indian café
- Visual sequence:
  - 0–2 sec: close-up of fresh filter coffee pouring into stainless-steel tumbler; steam and warm morning light.
  - 2–5 sec: traditional tumbler/davara pouring with rich froth; cinematic macro movement.
  - 5–8 sec: hero shot of coffee on café counter; clear negative space for Paanagam logo and tagline.
- CTA: use an owner-approved visit CTA. Do not invent address or offer.
- Video generation: WAN 2.7, 8 seconds, 9:16, 720p default; cost estimate shown before user confirms.
- Copy language: Tamil first, English adaptation.
- Required final assets: 9:16 master plus previewed Google/Meta adaptations.

## Data model and UI requirements

Campaign record should retain businessId, objective, brief, audience/geography, approved facts, selected channels, language, status, owner and timestamps.
CampaignAsset records should retain asset type, provider, model, prompt/version, source asset IDs, output storage reference, aspect ratio, duration, resolution, estimated/actual provider cost, generation job ID and approval state.
CampaignCopy records should retain platform, language, variant, headline, primary text, description, CTA, destination URL and approved facts used.
CampaignApproval records should retain approver, exact content/asset/copy revision IDs, action scope (generation, organic publish, paid launch, budget change), decision and timestamp.
CampaignExecution records should retain provider/platform, external campaign/post IDs, approved budget, dates, status and metrics import timestamps.

All reads/writes must be tenant-scoped and owner-authorised. Secrets stay server-side. Use idempotency keys and audit events for all external actions.

## Delivery sequence

A. Paanagam Campaign Studio brief and Gemini strategy/copy generation; save editable drafts only.
B. PoYo WAN 2.7 8-second generation with cost estimate and per-job confirmation; persist job and outputs.
C. Brand-safe composition: logo, exact Tamil/English captions, CTA, separate Tamil voiceover, aspect-ratio exports.
D. Unified preview and Approval Centre, with distinct approvals for generation, organic publishing and paid campaigns.
E. Google Ads and Meta Ads integrations, account selection, campaign draft/preview, budget and targeting confirmation, launch only after explicit approval.
F. Reporting and optimisation recommendations based on connected platform data; no automatic budget changes.

## Non-goals / safeguards

- No separate manual Gemini or PoYo workflows as the user-facing operating process; they are invoked through LocalBoost integrations.
- No automatic paid generation, publishing, campaign launch, budget changes or autonomous optimisation.
- No deployment or production database migration until feature review and explicit approval.
- No changes to existing Meta Muse image generation, Gemini copy workflows, Google read-only Business Profile integration, or approval centre without regression tests.
- Do not use customer personal data in AI prompts.
