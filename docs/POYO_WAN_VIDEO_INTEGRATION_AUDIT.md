# PoYo WAN video generation — feasibility audit and integration design

Status: feasibility reviewed from public PoYo documentation and the current LocalBoost repository. No provider credentials, API calls, paid generation, production settings, or production deployment have been changed.

## Executive decision

PoYo is a viable candidate for an isolated WAN video-provider adapter in LocalBoost, subject to an account-level API smoke test and legal/commercial review. The public PoYo catalog currently lists Wan 3.0 and Wan 2.7 workflows. Its Wan 2.7 documentation explicitly describes asynchronous task submission, task IDs, polling, and callback_url webhooks. The adapter should support model IDs as configuration rather than hard-code a single WAN generation.

Do not integrate pavoai.com as a creative video provider. Pavo Engine/FFmpeg is a possible later local rendering/assembly component, not the generation API.

## Evidence reviewed

- PoYo video API catalog: https://poyo.ai/ai-video-api
- Wan 2.7 API guide, workflows, pricing and task lifecycle: https://poyo.ai/models/wan-2-7-video
- PoYo API changelog: https://poyo.ai/changelog
- PoYo Wan 2.7 example repository: https://github.com/PoyoAPI/wan-2-7-video-api
- LocalBoost current implementation: backend/src/server.ts, backend/src/env.ts, backend/src/image-generation.ts, backend/package.json, backend/README.md and docs/GROWTH_INTELLIGENCE_ROADMAP.md.

PoYo's public Wan 2.7 guide lists text-to-video, image-to-video, reference-to-video and edit-video model IDs; 720p and 1080p output; duration-dependent pricing; asynchronous status polling and callback_url support. Its public catalog also lists Wan 3.0 and Wan 3.0 Video Prime, with text, image and reference workflows. These are provider-published claims and have not yet been validated using this user's PoYo account.

## Current LocalBoost fit and gaps

- Backend is Fastify + TypeScript on Node 20+, with Zod validation and Prisma/PostgreSQL.
- Existing creative backend has Meta Muse image generation in backend/src/image-generation.ts. Its route is registered in backend/src/server.ts.
- Current environment schema has no POYO_API_KEY, POYO_API_BASE_URL, WAN model setting, webhook secret, or video task persistence.
- Existing image generation returns a temporary browser-preview data URL. This is not a suitable storage or delivery model for generated video.
- Existing README and roadmap require explicit owner approval before external publishing; the video feature must preserve that rule.
- Do not expose provider credentials in browser JavaScript, local storage, mobile clients, query strings, or logs.

## Proposed implementation (separate feature branch)

### Provider adapter
Create a server-only provider module, e.g. backend/src/providers/poyo-video.ts, with:
- typed request/response contracts for text-to-video and image-to-video first;
- allowlisted model IDs (initially Wan 2.7; Wan 3.0 selectable only after a separate smoke test);
- authenticated API calls using POYO_API_KEY from server environment;
- strict input validation, request timeout, bounded retries for safe transient failures, and provider error normalization;
- no arbitrary URL fetching or arbitrary callback URL supplied by a browser user.

### Durable job lifecycle
Add a Prisma VideoGenerationJob model scoped to business and requesting user, with:
- internal job ID, provider, model ID, mode, prompt/brief, aspect ratio, duration, resolution;
- provider task ID, status, progress, safe error code/message;
- output URL and expiry metadata only after verified completion;
- estimated/actual credits or cost when provider reports it;
- created/updated/completed timestamps and idempotency key.

Suggested states: QUEUED, SUBMITTED, PROCESSING, SUCCEEDED, FAILED, CANCELLED, EXPIRED. Store provider task ID and poll status server-side for the first version. Add a webhook receiver only after callback authentication/signature semantics are confirmed from official documentation. Treat callback bodies as untrusted; verify authenticity, correlate task ID, and make updates idempotent.

### API routes
- POST /v1/businesses/:businessId/creative/video-jobs — validate owner, validate brief and generation options, create internal job and submit asynchronously.
- GET /v1/businesses/:businessId/creative/video-jobs/:jobId — owner-scoped status/result.
- Optional POST /v1/businesses/:businessId/creative/video-jobs/:jobId/cancel only if provider supports cancellation.
- Do not create a publish route as part of this feature. Existing approval centre remains the only route to approve external actions.

### Dashboard
Add a video-generation panel in the existing Creative Studio:
- prompt / campaign brief, language, aspect ratio, duration and resolution;
- selected WAN model with a clear per-second cost estimate before submission;
- queued/processing state and refresh/polling;
- preview and download after success;
- retain Tamil voiceover, subtitles and precise price overlays as a separate post-generation assembly step. Never ask the video model to render exact prices or long Tamil copy inside footage; generate visuals and overlay verified text deterministically.
- Add brand kit/logo and copy overlay only in a later compositor milestone.

### Security, reliability and cost controls
- Keep POYO_API_KEY in Render backend secret settings only. Never commit it.
- Enforce owner/business authorization, rate limits, request size limits and per-user concurrent job limits.
- Allowlist provider model IDs, duration, aspect ratio and resolution.
- Persist estimated cost and require an explicit confirmation before paid generation. No background generation, retries that can incur duplicate charges, or scheduled generation without user approval.
- Avoid logging prompts containing private customer data; never include secrets or full provider authorization headers in logs.
- Provider output URLs may be temporary. Confirm expiry and storage/redistribution terms before deciding whether to copy outputs into owned object storage.
- Establish retention and deletion policy for generated media and prompt data.
- Do not add a new paid Render service or database tier without a separate cost approval.

## Cost observations from provider-published pricing

The public Wan 2.7 guide lists PoYo rates of $0.06/second at 720p and $0.09/second at 1080p for the documented workflows. It gives a 5-second example of $0.30 at 720p and $0.45 at 1080p. These are published indicative rates and can change; actual account credit conversion, taxes, minimum charges, failed-task billing and currency settlement must be checked in the user's account before enabling paid generation.

PoYo's catalog/changelog also lists Wan 3.0 tiers with different rates by resolution. The exact current Wan 3.0 pricing should be read from the selected model's live pricing page immediately before implementation and surfaced in the UI, not copied as a permanent constant.

## Acceptance gates before production

1. User creates PoYo API key and adds it directly to Render backend environment as POYO_API_KEY. Never paste the key into chat or commit it.
2. Confirm PoYo API docs for exact endpoint, auth header, request schema, task status schema, error semantics, webhook authentication, rate limits and output URL expiry.
3. Run one manually approved, low-cost 5-second 720p test using a generic local-business visual; record task submission, polling, completion and download.
4. Verify whether failed, blocked, cancelled and retried tasks consume credits.
5. Verify commercial usage rights, output ownership, storage, redistribution, privacy and data processing terms for LocalBoost customers.
6. Verify Tamil voiceover workflow separately. WAN video generation should not be assumed to produce accurate Tamil speech. Use a dedicated approved TTS/audio step and deterministic audio/video muxing if required.
7. Add automated tests for ownership isolation, validation, idempotency, duplicate callbacks, provider errors, timeouts, cost estimates and approval boundaries.
8. Only after the feature branch is reviewed and the user explicitly approves a PR merge/deployment should production be changed.

## Recommended rollout

Phase A: API feasibility smoke test and provider contract tests.
Phase B: server-side job persistence and status API.
Phase C: Creative Studio dashboard and preview/download.
Phase D: Tamil TTS + FFmpeg composition for exact captions, price overlays and branding.
Phase E: integrate with approval centre; publishing remains separate and always requires explicit approval.

## Out of scope

- No direct Instagram/Facebook publishing in this branch.
- No automatic scheduling or autonomous spend.
- No changes to existing Meta Muse image generation or Gemini copy generation.
- No changes to production services, database, secrets, or Render deployment.
