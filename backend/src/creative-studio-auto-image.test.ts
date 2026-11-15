import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Loads the real dashboard script (first IIFE only) into a stubbed browser and drives the
// campaign caption -> GPT Image -> Approval Centre flow.
const source = readFileSync(fileURLToPath(new URL("../../creative-studio.js", import.meta.url)), "utf8");
const studioScript = source.slice(0, source.indexOf("\n})();") + 6);
assert.ok(studioScript.includes("creative-image-gemini"), "expected the campaign studio IIFE");

type Call = { method: string; path: string; body: any };
type Handler = (call: Call) => { status?: number; body: any } | Promise<{ status?: number; body: any }>;

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };

function setup(overrides: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  const elements = new Map<string, any>();
  const values: Record<string, string> = {
    "creative-topic": "Filter coffee opening", "creative-offer": "", "creative-language": "ta",
    "creative-platform": "Instagram", "creative-format": "feed", "creative-tone": "warm"
  };
  const makeElement = (id: string) => {
    const classes = new Set<string>();
    const handlers: Record<string, Function> = {};
    return {
      id, value: values[id] ?? "", textContent: "", innerHTML: "", disabled: false, src: "", dataset: {}, style: {}, rows: 0, maxLength: 0,
      classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c) },
      setAttribute() {}, appendChild() {}, remove() {}, reset() {}, click() {}, focus() {},
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener: (type: string, fn: Function) => { handlers[type] = fn; }, _h: handlers
    };
  };
  const el = (id: string) => { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); };
  const defaults: Record<string, Handler> = {
    "GET growth-records": () => ({ body: { records: [] } }),
    "POST google-content/draft": () => ({ body: { postCopy: "Filter coffee, fresh every morning.", creativeBrief: "Warm coffee photo" } }),
    "POST creative/image": () => ({ body: { imageDataUrl: "data:image/png;base64,AAAA", model: "gpt-image-2.5-flare", generatedAt: "2026-11-15T00:00:00Z" } }),
    "POST creative-assets": () => ({ body: { asset: { id: "asset-1", fileName: "gpt-image.jpg" } } }),
    "POST growth-records": () => ({ body: {} }),
    "POST social-posts": () => ({ body: { post: { id: "post-1" } } })
  };
  const handlers = { ...defaults, ...overrides };
  const fetchStub = async (url: string, options: any = {}) => {
    const path = String(url).replace(/^.*\/v1\/businesses\/[^/]+\//, "");
    const method = options.method || "GET";
    const call = { method, path, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    const key = method + " " + path.split("?")[0];
    const out = await (handlers[key] || (() => ({ body: {} })))(call);
    const status = out.status ?? 200;
    return { ok: status < 400, status, json: async () => out.body };
  };
  class FakeImage { crossOrigin = ""; onload: null | (() => void) = null; onerror: null | (() => void) = null; naturalWidth = 1024; naturalHeight = 1024;
    set src(_v: string) { queueMicrotask(() => this.onload?.()); } }
  const ctx: any = new Proxy({}, { get: (_t, prop) => (prop === "measureText" ? () => ({ width: 10 }) : prop === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  const windowTarget: any = new EventTarget();
  windowTarget.LOCALBOOST_API_BASE = "http://api.test";
  const sandbox: any = {
    window: windowTarget, CustomEvent, Event, console, setTimeout, Promise, JSON, String, Number, Date, Math, Set, Image: FakeImage, fetch: fetchStub,
    crypto: { randomUUID: () => "uuid-" + Math.random().toString(16).slice(2) },
    sessionStorage: { getItem: (k: string) => ({ localboost_access_token: "token", localboost_business_id: "biz-1" } as any)[k] ?? null },
    document: { readyState: "complete", getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/jpeg;base64,QUJD", style: {}, click() {}, remove() {}, setAttribute() {} }), body: { appendChild() {} } }
  };
  vm.createContext(sandbox);
  vm.runInContext(studioScript, sandbox);
  const generateCaption = async () => { await el("creative-form")._h.submit({ preventDefault() {} }); };
  const count = (key: string) => calls.filter(c => c.method + " " + c.path.split("?")[0] === key).length;
  return { el, calls, count, generateCaption };
}

test("caption generation automatically creates and saves matching GPT Image artwork, without posting anything", async () => {
  const t = setup();
  await flush();
  await t.generateCaption();
  await flush();
  assert.equal(t.count("POST creative/image"), 1, "image requested exactly once, with no button click");
  const imageCall = t.calls.find(c => c.path === "creative/image")!;
  assert.equal(imageCall.body.provider, "OPENAI");
  assert.equal(imageCall.body.caption, "Filter coffee, fresh every morning.");
  assert.equal(t.count("POST creative-assets"), 1);
  const record = t.calls.filter(c => c.method === "POST" && c.path === "growth-records").pop()!;
  assert.equal(record.body.payload.assetId, "asset-1", "asset is linked to the same campaign draft");
  assert.equal(record.body.payload.caption, "Filter coffee, fresh every morning.");
  assert.equal(t.count("POST social-posts"), 0, "no SocialPost before the owner submits");
  assert.equal(t.el("creative-save").disabled, false);
  assert.match(t.el("creative-message").textContent, /Nothing is approved or published/);
});

test("repeat clicks while generation is running share one provider call and one asset", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const t = setup({ "POST creative/image": async () => { await gate; return { body: { imageDataUrl: "data:image/png;base64,AAAA", model: "m", generatedAt: "t" } }; } });
  await flush();
  await t.generateCaption();
  await flush();
  assert.equal(t.el("creative-save").disabled, true, "submit is blocked while artwork is generating");
  t.el("creative-image-gemini")._h.click();
  t.el("creative-image-gemini")._h.click();
  await t.el("creative-save")._h.click();
  assert.match(t.el("creative-message").textContent, /still being generated/);
  release();
  await flush();
  assert.equal(t.count("POST creative/image"), 1);
  assert.equal(t.count("POST creative-assets"), 1);
  assert.equal(t.count("POST social-posts"), 0);
});

test("provider failure keeps the caption and draft, offers retry, and retry succeeds without duplicates", async () => {
  let attempts = 0;
  const t = setup({ "POST creative/image": () => (++attempts === 1 ? { status: 502, body: { error: "Image provider quota exceeded" } } : { body: { imageDataUrl: "data:image/png;base64,AAAA", model: "m", generatedAt: "t" } }) });
  await flush();
  await t.generateCaption();
  await flush();
  assert.match(t.el("creative-message").textContent, /quota exceeded/);
  assert.match(t.el("creative-message").textContent, /caption and draft are kept/);
  assert.equal(t.el("creative-preview-copy").textContent, "Filter coffee, fresh every morning.");
  assert.equal(t.el("creative-image-gemini").textContent, "Retry GPT Image");
  assert.equal(t.el("creative-image-gemini").disabled, false);
  assert.equal(t.el("creative-save").disabled, false);
  assert.equal(t.count("POST creative-assets"), 0);
  assert.equal(t.count("POST social-posts"), 0);
  t.el("creative-image-gemini")._h.click();
  await flush();
  assert.equal(t.count("POST creative/image"), 2);
  assert.equal(t.count("POST creative-assets"), 1);
});

test("only the owner's Save to Approval Centre click creates social posts, with the saved asset attached", async () => {
  const t = setup();
  await flush();
  await t.generateCaption();
  await flush();
  assert.equal(t.count("POST social-posts"), 0);
  await t.el("creative-save")._h.click();
  await flush();
  const posts = t.calls.filter(c => c.method === "POST" && c.path === "social-posts");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.channel, "INSTAGRAM");
  assert.equal(posts[0].body.assetId, "asset-1");
  assert.match(t.el("creative-message").textContent, /nothing has been approved or published/);
});
