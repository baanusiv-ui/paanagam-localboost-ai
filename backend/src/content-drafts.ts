import { z } from "zod";
import { generateAiJson } from "./ai-provider.js";

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

function normalizeCreativeBrief(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI creative brief must be text or a structured brief object");
  }

  // Some model/provider combinations return the designer brief as a JSON
  // object despite the requested string schema. Flatten it deterministically
  // so downstream image-generation APIs always receive a string.
  const parts: string[] = [];
  const visit = (entry: unknown, path: string, depth: number): void => {
    if (depth > 4 || parts.join(" ").length >= 1200) return;
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      const text = String(entry).trim();
      if (text) parts.push(path ? path + ": " + text : text);
      return;
    }
    if (Array.isArray(entry)) {
      entry.slice(0, 12).forEach((item, index) => visit(item, path ? path + " " + (index + 1) : String(index + 1), depth + 1));
      return;
    }
    if (entry && typeof entry === "object") {
      for (const [key, child] of Object.entries(entry as Record<string, unknown>).slice(0, 16)) {
        visit(child, path ? path + " / " + key : key, depth + 1);
      }
    }
  };
  visit(value, "", 0);
  const normalized = parts.join("; ").slice(0, 1200).trim();
  if (!normalized) throw new Error("AI returned an empty structured creative brief");
  return normalized;
}

export function buildContentDraftMessages(input: ContentDraftInput) {
  return [
    {
      role: "system",
      content: [
        "You create truthful social campaign drafts for an Indian local business.",
        "Use only the supplied business name, topic, offer and publish date. Never invent prices, discounts, dates, availability, opening hours, addresses, ingredients, awards, customer reviews or guarantees.",
        "If no offer is supplied, do not create an offer or imply a discount.",
        "Write catchy, high-quality social copy with a strong scroll-stopping opening hook, natural rhythm, vivid but truthful language, short readable lines and a clear low-pressure call to action. Avoid generic AI phrases, stiff translations, keyword stuffing and excessive emojis. For Tamil, use fluent conversational Tamil suited to local audiences, not literal English translation. For Tamil + English, write natural Tamil first and a concise English version second.",
        "Create a practical visual creative brief for a designer. Do not claim an image has been generated.",
        "The brief must match the requested format and must not add products, logos or brand facts that were not supplied.",
        "Return JSON only with exactly two keys: postCopy and creativeBrief. Both values MUST be plain strings, never objects or arrays. No markdown fences.",
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
  const cleaned = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return contentSchema.parse({
    ...parsed,
    creativeBrief: normalizeCreativeBrief(parsed?.creativeBrief)
  });
}

export async function generateLocalContentDraft(input: ContentDraftInput) {
  const generated = await generateAiJson({
    task: "google-content-draft",
    messages: buildContentDraftMessages(input),
    temperature: 0.2,
    maxOutputTokens: 500,
    responseSchema: {
      type: "OBJECT",
      properties: {
        postCopy: { type: "STRING" },
        creativeBrief: { type: "STRING" }
      },
      required: ["postCopy", "creativeBrief"]
    }
  });
  return {
    ...parseContentDraftOutput(generated.raw),
    provider: generated.provider,
    model: generated.model,
    fallbackUsed: generated.fallbackUsed,
    language: input.language,
    format: input.format,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "AI-generated draft. Verify every business fact and approve before manual publishing. Nothing was scheduled or published."
  };
}
