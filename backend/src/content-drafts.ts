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



export function buildContentDraftMessages(input: ContentDraftInput) {
  return [
    {
      role: "system",
      content: [
        "You create truthful social campaign drafts for an Indian local business.",
        "Use only the supplied business name, topic, offer and publish date. Never invent prices, discounts, dates, availability, opening hours, addresses, ingredients, awards, customer reviews or guarantees.",
        "If no offer is supplied, do not create an offer or imply a discount.",
        "Write concise, natural, engaging copy in the requested language. For Tamil + English, write natural Tamil first and a short English version second.",
        "The postCopy value must contain reader-facing caption text only. Never put JSON, language labels, object syntax, or escaped key/value data inside postCopy. Use a plain Tamil paragraph, a blank line, then a plain English paragraph.",
        "Create a practical visual creative brief for a designer. Do not claim an image has been generated.",
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

function normalizePostCopy(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed);
      const pick = (keys: string[]) => {
        const item = entries.find(([key, candidate]) => keys.includes(key.trim().toLowerCase()) && typeof candidate === "string" && candidate.trim());
        return item ? (item[1] as string).trim() : "";
      };
      const tamil = pick(["tamil", "ta", "தமிழ்"]);
      const english = pick(["english", "en"]);
      if (tamil || english) return [tamil, english].filter(Boolean).join("\\n\\n").slice(0, 2000);
    }
  } catch { /* ordinary prose, not a serialized bilingual object */ }
  return trimmed.slice(0, 2000);
}

export function parseContentDraftOutput(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = contentSchema.parse(JSON.parse(cleaned));
  return { ...parsed, postCopy: normalizePostCopy(parsed.postCopy) };
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
