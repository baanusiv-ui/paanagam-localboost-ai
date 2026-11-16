import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://localboost:test@localhost:5432/localboost";
process.env.JWT_SECRET ||= "test-secret-that-is-at-least-thirty-two-characters";
process.env.TOKEN_ENCRYPTION_KEY_BASE64 ||= Buffer.alloc(32, 7).toString("base64");
process.env.OPENROUTER_API_KEY = "test-openrouter-key";
process.env.OPENROUTER_GPT_IMAGE_MODEL = "openai/gpt-image-2.6-flare";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("campaign GPT Image uses OpenRouter Image API and returns its buffered image", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("test-image").toString("base64"), media_type: "image/png" }],
      usage: { cost: 0.02 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const { generateOpenRouterCampaignImage } = await import("./image-generation.js");
  const result = await generateOpenRouterCampaignImage({
    businessName: "Paanagam",
    topic: "South Indian filter coffee",
    caption: "காபியும் கதையும்",
    language: "Tamil",
    format: "PORTRAIT"
  });

  assert.equal(requestUrl, "https://openrouter.ai/api/v1/images");
  assert.equal(requestBody.model, "openai/gpt-image-2.6-flare");
  assert.equal(requestBody.aspect_ratio, "3:4");
  assert.equal(requestBody.quality, "high");
  assert.equal(requestBody.n, 1);
  assert.equal(result.provider, "OPENROUTER_GPT_IMAGE");
  assert.equal(result.imageDataUrl, "data:image/png;base64," + Buffer.from("test-image").toString("base64"));
  assert.deepEqual(result.usage, { cost: 0.02 });
});

test("campaign GPT Image exposes OpenRouter billing and model errors clearly", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { message: "Insufficient credits" }
  }), { status: 402, headers: { "content-type": "application/json" } })) as typeof fetch;

  const { generateOpenRouterCampaignImage } = await import("./image-generation.js");
  await assert.rejects(
    () => generateOpenRouterCampaignImage({
      businessName: "Paanagam",
      topic: "Filter coffee",
      language: "Tamil",
      format: "SQUARE"
    }),
    /HTTP 402.*Insufficient credits.*credit balance/
  );
});
