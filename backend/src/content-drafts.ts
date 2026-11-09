import { z } from "zod";

export type ContentDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  publishDate?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
  tone: "WARM" | "TRADITIONAL" | "OFFER_LED";
};

const contentSchema = z.object({
  postCopy: z.string().trim().min(1).max(2000),
  creativeBrief: z.string().trim().min(1).max(1200)
}).strict();
const localBaseUrl = () => (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const localModel = () => (process.env.OLLAMA_MODEL || "qwen2.5:7b").trim();

export function buildContentDraftMessages(input: ContentDraftInput) {
  return [
    {
      role: "system",
      content: [
        "You create truthful Google Business Profile update drafts for an Indian local business.",
        "Use only the supplied business name, topic and offer. Never invent prices, discounts, dates, availability, opening hours, addresses, product ingredients, awards, customer reviews or guarantees.",
        "If no offer is supplied, do not create an offer or imply a discount.",
        "Write concise, natural copy in the requested language. Avoid fake urgency and unsupported superlatives.",
        "Create a practical visual creative brief for a designer; do not claim an image has been generated.",
        "The brief must match the requested format and must not add products, logos or brand facts that were not supplied.",
        "Return JSON only with exactly two keys: postCopy and creativeBrief. No markdown fences.",
        "Language: " + input.language + ". Tone: " + input.tone + ". Format: " + input.format + "."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        businessName: input.businessName.slice(0, 160),
        topic: input.topic.slice(0, 300),
        offer: (input.offer || "").slice(0, 500),
        publishDate: input.publishDate || null
      })
    }
  ];
}

export function parseContentDraftOutput(raw: string) {
  return contentSchema.parse(JSON.parse(raw));
}

export async function generateLocalContentDraft(input: ContentDraftInput) {
  const baseUrl = localBaseUrl();
  const model = localModel();
  if (!baseUrl) throw new Error("Local AI is not configured. Set OLLAMA_BASE_URL in backend/.env and restart the API.");
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildContentDraftMessages(input),
      stream: false,
      format: "json",
      options: { temperature: 0.35 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json() as { message?: { content?: string }; error?: string };
  if (!response.ok) throw new Error(data.error || "Local Ollama request failed with HTTP " + response.status);
  const content = data.message?.content;
  if (!content) throw new Error("Local AI returned an empty content draft. Try again or check the model.");
  return {
    ...parseContentDraftOutput(content),
    provider: "LOCAL_OLLAMA",
    model,
    language: input.language,
    format: input.format,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "Draft only. Verify every business fact and approve before manual publishing. Nothing was scheduled or published."
  };
}
