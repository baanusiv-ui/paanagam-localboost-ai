import test from "node:test";
import assert from "node:assert/strict";
import { generateAiJson } from "./ai-provider.js";

const schema = {
  type: "OBJECT" as const,
  properties: { answer: { type: "STRING" } },
  required: ["answer"]
};

test("Ollama Cloud is attempted first and Gemini is used after a cloud failure", async () => {
  const previous = {
    key: process.env.OLLAMA_API_KEY,
    model: process.env.OLLAMA_CLOUD_MODEL,
    local: process.env.OLLAMA_BASE_URL,
    gemini: process.env.GEMINI_API_KEY,
    geminiEnabled: process.env.GEMINI_FALLBACK_ENABLED
  };
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  process.env.OLLAMA_API_KEY = "test-cloud-key";
  process.env.OLLAMA_CLOUD_MODEL = "test-model";
  delete process.env.OLLAMA_BASE_URL;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_FALLBACK_ENABLED = "true";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://ollama.com/")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-cloud-key");
      return new Response(JSON.stringify({ error: "temporary outage" }), { status: 503 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: "fallback" }) }] } }]
    }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await generateAiJson({
      task: "test",
      messages: [{ role: "user", content: "hello" }],
      responseSchema: schema
    });
    assert.equal(result.provider, "GOOGLE_GEMINI");
    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(calls, [
      "https://ollama.com/api/chat",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OLLAMA_CLOUD_MODEL; else process.env.OLLAMA_CLOUD_MODEL = previous.model;
    if (previous.local === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = previous.local;
    if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.gemini;
    if (previous.geminiEnabled === undefined) delete process.env.GEMINI_FALLBACK_ENABLED; else process.env.GEMINI_FALLBACK_ENABLED = previous.geminiEnabled;
  }
});


test("Gemini is not called when the explicit paid-fallback switch is disabled", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousEnabled = process.env.GEMINI_FALLBACK_ENABLED;
  const previousCloud = process.env.OLLAMA_API_KEY;
  const previousLocal = process.env.OLLAMA_BASE_URL;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  delete process.env.OLLAMA_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_FALLBACK_ENABLED = "false";
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => generateAiJson({ task: "test", messages: [{ role: "user", content: "hello" }], responseSchema: schema }), /AI is not configured/);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousEnabled === undefined) delete process.env.GEMINI_FALLBACK_ENABLED; else process.env.GEMINI_FALLBACK_ENABLED = previousEnabled;
    if (previousCloud === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previousCloud;
    if (previousLocal === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = previousLocal;
  }
});
