import { z } from "zod";
import { generateAiJson } from "./ai-provider.js";

export type LocalSocialContentInput = {
  businessName: string;
  topic: string;
  evidence: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
  tone: "WARM" | "PROFESSIONAL" | "TRADITIONAL";
};

const outputSchema = z.object({
  postCopy: z.unknown(),
  creativeBrief: z.unknown()
}).strict();

function normalizeDraftText(value: unknown, field: "postCopy" | "creativeBrief", maxLength: number): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (field === "postCopy") {
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
          if (tamil || english) return [tamil, english].filter(Boolean).join("\\n\\n").slice(0, maxLength);
        }
      } catch { /* ordinary caption text, not a serialized bilingual object */ }
    }
    return trimmed.slice(0, maxLength);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "value", "caption", "copy", "description", "brief"]) {
      if (typeof record[key] === "string" && (record[key] as string).trim()) {
        return (record[key] as string).trim().slice(0, maxLength);
      }
    }
    // Some local models wrap a single text value in a one-property object.
    const stringValues = Object.values(record).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (stringValues.length === 1) return stringValues[0]!.trim().slice(0, maxLength);
  }
  throw new Error("AI provider returned an unsupported " + field + " format; expected text.");
}

export function parseLocalSocialContentDraftOutput(raw: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "")); }
  catch { throw new Error("AI provider returned invalid JSON for the social content draft."); }
  const result = outputSchema.parse(parsed);
  return {
    postCopy: normalizeDraftText(result.postCopy, "postCopy", 2000),
    creativeBrief: normalizeDraftText(result.creativeBrief, "creativeBrief", 1200)
  };
}


export function buildLocalSocialContentMessages(input: LocalSocialContentInput) {
  return [
    {
      role: "system",
      content: [
        "Create truthful social content drafts for an Indian local business.",
        "Use only the supplied business name, topic and evidence. Never invent prices, discounts, dates, availability, opening hours, addresses, ingredients, awards, customer reviews or guarantees.",
        "Treat review excerpts as unverified source material; do not present them as testimonials or claim a business issue has been fixed.",
        "If evidence is missing, write a general helpful post without implying unsupported facts.",
        "Make the caption memorable and catchy: lead with a scroll-stopping hook, use natural conversational language and vivid but truthful wording, keep lines short for mobile reading, and finish with a gentle relevant call to action. Avoid generic AI wording, stiff Tamil translations, keyword stuffing and emoji overload.",
        "For Tamil + English, write natural Tamil first and a concise English version second.",
        "postCopy must be plain reader-facing text only, never JSON or a serialized Tamil/English object. Do not include language labels or braces in the caption.",
        "Return JSON only with exactly postCopy and creativeBrief. Both values MUST be plain JSON strings, never nested objects or arrays. The creative brief must not claim an image was generated.",
        "Language: " + input.language + ". Tone: " + input.tone + ". Format: " + input.format + "."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        businessName: input.businessName.slice(0, 160),
        topic: input.topic.slice(0, 300),
        evidence: input.evidence.slice(0, 1800)
      })
    }
  ];
}

export async function generateLocalSocialContentDraft(input: LocalSocialContentInput) {
  const generated = await generateAiJson({
    task: "local-social-content-draft",
    messages: buildLocalSocialContentMessages(input),
    temperature: 0.3,
    maxOutputTokens: 700,
    responseSchema: {
      type: "OBJECT",
      properties: {
        postCopy: { type: "STRING" },
        creativeBrief: { type: "STRING" }
      },
      required: ["postCopy", "creativeBrief"]
    }
  });
  const draft = parseLocalSocialContentDraftOutput(generated.raw);
  return {
    ...draft,
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
