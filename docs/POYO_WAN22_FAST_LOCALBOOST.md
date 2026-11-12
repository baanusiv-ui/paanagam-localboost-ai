# LocalBoost PoYo Wan 2.2 Fast integration

Status: feature-branch implementation. Production deployment and paid generation remain disabled until the owner completes the setup and explicitly approves a low-cost smoke test.

## Supported modes

- Text-to-video: `wan2.2-text-to-video-fast`
- Image-to-video: `wan2.2-image-to-video-fast`
- Default output: 480p, 6 PoYo credits per generation
- Text-to-video aspect ratios: 9:16 (default) and 16:9
- Image-to-video: one or two publicly reachable HTTPS image URLs
- Prompt limit: 800 characters

Model IDs, request shapes and pricing were checked against PoYo's model documentation on 12 November 2026.

## Safety controls

- PoYo API credentials are read only by the backend from `POYO_API_KEY`.
- `POYO_ENABLED` defaults to `false`; keep it false during build and no-spend testing.
- Only emails listed in `CREATIVE_STUDIO_ADMIN_EMAILS` can submit paid generation tasks.
- Saving a task creates a LocalBoost draft only; it does not call PoYo.
- The backend stores the provider task ID and polls PoYo's asynchronous status endpoint.
- Completed MP4/WebM output is copied into the selected business's existing CreativeAsset storage, subject to 25 MB per-video and 100 MB per-business library limits.
- The preview endpoint is authenticated and business-scoped.
- Approval records the owner and timestamp. Approval does not publish the video.
- No auto-publishing, scheduled publishing or external posting is implemented by this integration.

## Backend environment

Configure these only on the LocalBoost API service in Render:

- `POYO_API_KEY`: secret created in the PoYo dashboard
- `POYO_ENABLED`: `false` until a separately approved smoke test
- `POYO_API_BASE_URL`: `https://api.poyo.ai` (already the backend default)
- `CREATIVE_STUDIO_ADMIN_EMAILS`: comma-separated LocalBoost administrator email addresses

Never put the key in `index.html`, browser JavaScript, a mobile app, a GitHub commit, or a public environment variable.

## API flow

1. `GET /v1/creative-integrations/poyo/models?mediaType=VIDEO`
2. `POST /v1/businesses/:businessId/poyo/tasks` — save draft only
3. `POST /v1/businesses/:businessId/poyo/tasks/:taskId/submit` — submit to PoYo (feature flag + administrator gate)
4. `POST /v1/businesses/:businessId/poyo/tasks/:taskId/refresh` — poll and import completed output
5. `GET /v1/businesses/:businessId/poyo/tasks` — list business-scoped jobs
6. `GET /v1/businesses/:businessId/poyo/assets/:assetId/content` — authenticated preview
7. `POST /v1/businesses/:businessId/poyo/tasks/:taskId/approve` — record explicit owner approval; no publishing action

## Mobile owner setup checklist

1. Open Render in the mobile browser and select the existing `paanagam-localboost-api` service.
2. Open Environment and add `POYO_API_KEY` as a secret value. Do not paste the key into ChatGPT, GitHub, or the frontend.
3. Confirm `POYO_ENABLED=false` and set `CREATIVE_STUDIO_ADMIN_EMAILS` to the LocalBoost owner email.
4. Do not deploy this branch to production. Review the draft PR and wait for CI.
5. After a separately approved smoke test, change `POYO_ENABLED` to `true` on a staging service first, then submit one 480p test. One successful generation costs 6 credits.
6. Review the resulting video in Creative Studio and use Approve video only when the exact output is acceptable. Publishing remains separate.

## Validation still required

- Backend TypeScript build and full test suite in CI.
- Render staging environment check for database migration compatibility.
- Verify video response host and MIME type against a real completed PoYo task without broadening the storage host allowlist.
- Verify authenticated video playback on Android Chrome.
- Verify tenant isolation, approval audit event and no-publish behaviour.
