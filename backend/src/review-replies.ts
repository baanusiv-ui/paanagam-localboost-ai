import { z } from "zod";
import { generateAiJson } from "./ai-provider.js";

export type ReviewReplyInput = {
  businessName: string;
  reviewText: string;
  rating?: number;
  language: "Tamil" | "English" | "Tamil + English";
  tone: "WARM" | "PROFESSIONAL" | "APOLOGETIC";
};

const replySchema = z.object({ reply: z.string().trim().min(1).max(1200) }).strict();


export function redactReviewPersonalData(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, "[redacted phone]");
}

export function buildReviewReplyMessages(input: ReviewReplyInput) {
  const reviewText = redactReviewPersonalData(input.reviewText).slice(0, 4000);
  return [
    {
      role: "system",
      content: [
        "You draft concise, respectful public replies for an Indian local business.",
        "Use only the review text and rating supplied. Never invent facts, offers, compensation, contact details, opening hours, investigations or promises.",
        "Do not repeat names, phone numbers, email addresses, addresses or other personal data from the review.",
        "For negative feedback, acknowledge the concern and apologise for the experience without admitting legal liability or promising a refund. Invite the reviewer to contact the business through its already-known official channel, but do not invent a channel or contact detail.",
        "For positive feedback, thank the reviewer naturally. For neutral feedback, acknowledge the feedback and invite a specific clarification only if needed.",
        "Keep the reply brief, natural and suitable for a public Google review response. Do not use hashtags or emojis unless they are clearly appropriate.",
        "Return JSON only with one key: reply. Do not include analysis or multiple options.",
        "Language: " + input.language + ". Tone: " + input.tone + "."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        businessName: input.businessName.slice(0, 160),
        rating: input.rating ?? null,
        reviewText
      })
    }
  ];
}

export function parseReviewReplyOutput(raw: string) {
  return replySchema.parse(JSON.parse(raw));
}

export async function generateLocalReviewReplyDraft(input: ReviewReplyInput) {
  const generated = await generateAiJson({
    task: "review-reply",
    messages: buildReviewReplyMessages(input),
    temperature: 0.25,
    maxOutputTokens: 500,
    responseSchema: {
      type: "OBJECT",
      properties: { reply: { type: "STRING" } },
      required: ["reply"]
    }
  });
  const parsed = parseReviewReplyOutput(generated.raw);
  return {
    ...parsed,
    provider: generated.provider,
    model: generated.model,
    fallbackUsed: generated.fallbackUsed,
    language: input.language,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "Private draft only. Review and edit before saving. Nothing was sent or published."
  };
}
