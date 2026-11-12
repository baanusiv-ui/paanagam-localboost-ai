# PoYo Wan 2.7 Video API contract for LocalBoost

Verified against PoYo's official model documentation on 2026-11-12:
- Model page: https://poyo.ai/models/wan-2-7-video
- API documentation: https://docs.poyo.ai/api-manual/video-series/wan-2-7-video
- Submit endpoint: POST https://api.poyo.ai/api/generate/submit
- Status endpoint: GET https://api.poyo.ai/api/generate/status/{task_id}
- Authentication: Authorization: Bearer <POYO_API_KEY>
- Content-Type: application/json

## Supported model IDs

| Workflow | Model ID | Inputs |
|---|---|---|
| Text-to-video | wan2.7-text-to-video | prompt, aspect_ratio, resolution, duration |
| Image-to-video | wan2.7-image-to-video | prompt, image_urls (start/end frames), aspect_ratio, resolution, duration |
| Reference-to-video | wan2.7-reference-to-video | prompt, reference_image_urls and/or reference_video_urls, aspect_ratio, resolution, duration |
| Edit-video | wan2.7-edit-video | prompt, video_url, optional reference_image_url, resolution; duration may be auto-detected |

## Constraints documented by PoYo

- Resolution: 720p or 1080p.
- Text-to-video duration: 5, 10, or 15 seconds.
- Image-to-video duration: 2–15 seconds.
- Reference-to-video duration: 2–10 seconds.
- Edit-video duration: 2–10 seconds, or omit/use 0 for source-duration detection.
- Optional audio_url is documented for text and image workflows.
- Image-to-video accepts one or two image_urls (start and optional end frame).
- Reference-to-video accepts reference image/video URLs.

The model page exposes these inputs; validate every value server-side and do not allow the browser to supply a provider callback URL.

## Request envelope

```json
{
  "model": "wan2.7-text-to-video",
  "input": {
    "prompt": "A cinematic product scene...",
    "aspect_ratio": "9:16",
    "resolution": "720p",
    "duration": 5
  }
}
```

Optional callback_url exists in the provider contract, but LocalBoost should use server-side polling first. Add a webhook only after authenticating callbacks and proving idempotent processing.

## Submit response and important error handling

Successful example:

```json
{
  "code": 200,
  "data": {
    "task_id": "task-unified-example",
    "status": "not_started",
    "created_time": "2023-11-07T05:31:56Z"
  }
}
```

Always check both HTTP status and JSON body code. PoYo documents business codes 200, 400, 401, 402, 403, 404, 408, 429, 500, 502 and 503. A validation error can be returned in an HTTP 200 response with body code 400.

The status endpoint returns the task state and completed output. The model page says completed/failed tasks trigger callback_url if supplied; polling remains available regardless.

## Published PoYo pricing (verify at point of use)

| Output | Published rate | 5-second estimate |
|---|---:|---:|
| 720p | $0.06/sec (12 credits/sec) | $0.30 (60 credits) |
| 1080p | $0.09/sec (18 credits/sec) | $0.45 (90 credits) |

Rates are provider-published and can change. The LocalBoost UI must calculate estimates from a server-side pricing configuration and clearly label them as estimates. Require explicit confirmation before submitting any paid generation.

## LocalBoost implementation rules

1. Keep POYO_API_KEY exclusively in backend secret configuration. Never expose it to the dashboard or logs.
2. Initial rollout should expose text-to-video and image-to-video only; add reference/edit modes after contract tests.
3. Default to 720p, 5 seconds, and 9:16 for short-form social campaigns; show estimated cost and require confirmation.
4. Create a durable, business-scoped job before or atomically with provider submission. Use idempotency protection to prevent duplicate paid jobs after client retries.
5. Poll task status from the backend; do not make provider status calls from the browser.
6. Treat provider output URLs as temporary until expiry and redistribution terms are verified. Save media to owned storage before relying on it in approval/publishing flows.
7. Generated video is a draft asset only. No automatic publishing. Existing explicit approval remains mandatory.
8. Do not render exact prices, offers, long captions or Tamil text inside generated footage. Add those as deterministic post-production overlays after the video is generated.
9. Tamil voiceover is a separate audio/TTS and muxing step; do not assume native WAN speech will produce accurate Tamil.
10. Do not run paid generation, modify production environment variables, migrate production database, or deploy until the user explicitly approves the smoke test and production rollout.

## Remaining validation before implementation can be enabled

- Confirm actual account API key works and available balance/credit conversion.
- Confirm task status response's exact fields and output URL shape from a real task.
- Confirm output URL expiry, file size/duration constraints and commercial-use / redistribution terms.
- Confirm whether failed, blocked, cancelled and retry cases are charged.
- Run one manually approved 5-second 720p generic LocalBoost sample only after the above cost confirmation.
