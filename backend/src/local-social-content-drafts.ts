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
  postCopy: z.string().trim().min(1).max(2000),
  creativeBrief: z.string().trim().min(1).max(1200)
}).strict();


export function buildLocalSocialContentMessages(input: LocalSocialContentInput) {
  return [
    {
      role: "system",
      content: [
        "Create truthful social content drafts for an Indian local business.",
        "Use only the supplied business name, topic and evidence. Never invent prices, discounts, dates, availability, opening hours, addresses, ingredients, awards, customer reviews or guarantees.",
        "Treat review excerpts as unverified source material; do not present them as testimonials or claim a business issue has been fixed.",
        "If evidence is missing, write a general helpful post without implying unsupported facts.",
        "For Tamil + English, write natural Tamil first and a concise English version second.",
        "Return JSON only with exactly postCopy and creativeBrief. The creative brief must not claim an image was generated.",
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
  let parsed: unknown;
  try { parsed = JSON.parse(generated.raw); }
  catch { throw new Error("AI provider returned invalid JSON for the social content draft."); }
  const draft = outputSchema.parse(parsed);
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
