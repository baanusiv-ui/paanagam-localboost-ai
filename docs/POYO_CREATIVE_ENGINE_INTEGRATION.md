# PoYo Creative Engine Integration

## Decision

Integrate PoYo as a server-side creative-generation provider inside the existing LocalBoost API. Keep LocalBoost as the system of record for business context, prompts, approvals, assets and publication state. Do not create a second marketing application or expose PoYo credentials to the browser.

The first business workspace is Paanagam (பானகம்). The integration must remain tenant-scoped so other LocalBoost businesses can use their own brand context and assets.

## Integration layers

1. **Developer workflow:** install the PoYo `poyo-ai-models` Agent Skill in the LocalBoost development environment using the documented `npx skills add` command. This is a coding-agent capability, not the production runtime.
2. **Production runtime:** LocalBoost backend calls PoYo's documented HTTP API from the server. The browser talks only to LocalBoost.
3. **Creative planning:** use the built-in skills as planning/playbook capabilities: Storyboard, Product campaign, Character consistency, Script writer, Cinematic shot prompts, Character reference sheet, Branded graphics, Photo editing, UGC-style ads, Product multi-angle shots and Model comparison.
4. **Approval and publishing:** generated assets remain drafts until an authenticated business owner explicitly approves them. PoYo generation completion must never trigger social publishing.

## Documented PoYo API facts

- Image models are submitted through `POST /api/generate/submit` with `model`, `input`, and optional `callback_url`.
- Submission is asynchronous and returns a `task_id`; results are obtained through task status polling or callback.
- Model parameters differ by model. Do not reuse one model's parameter schema for another.
- Generated image files are available for three days; LocalBoost must promptly download and persist approved outputs in its own asset storage.
- Webhook callbacks use `X-Webhook-Timestamp` and `X-Webhook-Signature`. The documented signature is Base64(HMAC-SHA256(task_id + `. ` + timestamp, webhook HMAC key)); implementation must follow the exact provider rule `task_id.timestamp`, enforce a short timestamp tolerance, compare signatures in constant time and be idempotent.
- Callback endpoints must be public HTTPS endpoints and acknowledge quickly; perform durable state updates and file processing asynchronously.
- PoYo supports a wide catalogue of image, video, LLM, audio/TTS, music and 3D models. Discover and validate model IDs, schemas and prices from the live catalogue rather than hardcoding assumptions from examples.

## Backend design

### Configuration

Add server-only environment variables:
- `POYO_API_KEY`
- `POYO_WEBHOOK_HMAC_KEY` (only after retrieving it through the documented key-management endpoint)
- `POYO_API_BASE_URL` (default to the documented production API origin)
- `POYO_ENABLED` (feature flag; default false)

Never commit credentials, print them in logs, return them from status endpoints, or place them in frontend config.

### Tenant-scoped generation records

Persist at least:
- business ID and requesting owner ID
- provider task ID (unique)
- media type and selected model ID
- prompt/brief and validated model input (excluding secrets)
- status, provider error code/message and timestamps
- estimated/quoted price and actual credits when the provider returns them
- output file metadata and LocalBoost asset ID(s)
- approval state, approver and approval timestamp

Use a unique provider task ID and idempotent webhook processing. Verify business ownership before creating or reading tasks. Keep Paanagam references and other business assets tenant-scoped.

### Request lifecycle

1. Read business brand profile, approved assets and relevant source records.
2. Build a structured creative brief. For Paanagam, recipe and ingredient claims must come from owner-confirmed menu/recipe records; never invent ingredients, preparation steps, prices, offers or product claims.
3. Discover compatible model and inspect its exact input schema and current price.
4. Show model, format, duration, quality and estimated cost before paid submission. Require explicit confirmation for paid generation.
5. Submit the provider task and persist its task ID immediately.
6. Receive a signed callback or poll status as a fallback.
7. Download generated media before the provider's temporary retention window expires; store it in LocalBoost-controlled asset storage.
8. Run brand/content checks and show the result in the approval centre.
9. Publish only through the existing channel integration after a separate explicit approval action.

### Creative workflows

- **Storyboard:** subject, duration, aspect ratio, narrative, shot-level action/composition/camera/transition, shot dependencies and review checkpoints.
- **Product campaign:** product, audience, channel, objective, deliverables and reference assets. Preserve supplied product geometry, packaging and brand details.
- **Character consistency/reference sheet:** stable identity traits and approved reference assets; flag model limitations rather than guaranteeing identical identity.
- **Script writer:** shot timing, visible action, camera, narration and on-screen copy. Durations must sum to the requested total; separate user-provided copy from suggested copy.
- **Cinematic prompts:** one achievable principal action per clip with explicit framing, camera, lighting, palette and continuity anchors.
- **Branded graphics/photo editing/UGC/product multi-angle:** use source assets as truth and flag text/logo/product details for human review.
- **Model comparison:** independent comparable generations with the same brief and source assets; never chain one candidate into another.

### Initial delivery slices

**Slice A — provider foundation (initial code committed)**
- Added server-only `POYO_ENABLED`, `POYO_API_KEY`, `POYO_API_BASE_URL` and `POYO_WEBHOOK_HMAC_KEY` configuration.
- Added a PoYo submission client with timeout, HTTPS callback validation, end-user attribution header support and safe error messages.
- Added live account credit-balance lookup using the documented `GET /api/user/balance` endpoint, exposed only to LocalBoost administrators at `GET /v1/creative-integrations/poyo/balance`.
- Added unified task-status lookup using the documented `GET /api/generate/status/{task_id}` endpoint for the forthcoming task worker.
- Added an admin-gated provider readiness indicator to the existing creative-integration status response.
- Added HMAC webhook signature verification with a five-minute timestamp window and constant-time comparison, plus unit tests.
- Added a documentation-backed model catalogue endpoint at `GET /v1/creative-integrations/poyo/models`, filterable by IMAGE or VIDEO. Initial entries include Wan 2.7 Video, Wan 3.0 Video, Wan 2.7 Image and GPT Image 2. This catalogue is explicitly marked documentation-sourced; model schema, account availability and price remain unverified, so generation stays disabled. Balance lookup has not yet been exercised with a configured key.
- Generation is not exposed to the UI and no paid generation can be initiated yet; do not enable the feature flag until live account checks and cost confirmation are implemented.

**Slice B — task lifecycle (draft persistence implemented)**
- Added tenant-scoped `PoyoCreativeTask` records and a Prisma migration.
- Added authenticated, business-owner-scoped draft create/list/detail endpoints:
  - `POST /v1/businesses/:businessId/poyo/tasks`
  - `GET /v1/businesses/:businessId/poyo/tasks`
  - `GET /v1/businesses/:businessId/poyo/tasks/:taskId`
- Draft creation does not call PoYo and does not consume credits.
- Still pending: live price confirmation, paid-generation confirmation, provider submission/status polling wiring, webhook route/idempotency, output download and asset persistence.

**Slice C — LocalBoost Creative Studio**
- Creative brief and storyboard records
- Model selection and cost confirmation
- Generation history and retry controls
- Approval-centre integration

**Slice D — Paanagam knowledge**
- Connect only verified Paanagam menu/recipe/ingredient records
- Coffee education (beans, chicory, decoction and preparation)
- Tea education (CTC, tea dust/leaves and actual masala recipe)
- Menu-specific educational content and seasonal campaigns
- No generic or unverified recipe generation

## Non-goals and safeguards

- No automatic publishing, replying to reviews, messaging or profile edits.
- No direct browser-to-PoYo requests.
- No API key in Git, client bundles, URLs, logs or user-visible error messages.
- No invented pricing, model capabilities, offers, menu items or recipe facts.
- No promise of timeline assembly, clip joining, lip-sync, captions or editing unless the selected model/API explicitly supports that operation.
- Do not alter the POS or write back to POS data.
- Do not change existing Canva, Meta, Google, authentication or approval workflows as part of provider onboarding.
- Keep this integration on its own feature branch and merge only after tests and owner review.

## References

- PoYo docs index: https://docs.poyo.ai/llms.txt
- Quickstart: https://docs.poyo.ai/
- Image models: https://docs.poyo.ai/api-manual/image-series/overview.md
- Video models: https://docs.poyo.ai/api-manual/video-series/overview.md
- Webhooks: https://docs.poyo.ai/api-manual/task-management/webhooks.md
- Agent Skill: https://docs.poyo.ai/integrations/skill.md
