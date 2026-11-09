import { z } from "zod";

export type ReviewReplyInput = {
  businessName: string;
  reviewText: string;
  rating?: number;
  language: "Tamil" | "English" | "Tamil + English";
  tone: "WARM" | "PROFESSIONAL" | "APOLOGETIC";
};

const replySchema = z.object({ reply: z.string().trim().min(1).max(1200) }).strict();
const localBaseUrl = () => (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const localModel = () => (process.env.OLLAMA_MODEL || "qwen2.5:7b").trim();

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
  const baseUrl = localBaseUrl();
  const model = localModel();
  if (!baseUrl) throw new Error("Local AI is not configured. Set OLLAMA_BASE_URL in backend/.env and restart the API.");
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildReviewReplyMessages(input),
      stream: false,
      format: "json",
      options: { temperature: 0.25 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json() as { message?: { content?: string }; error?: string };
  if (!response.ok) throw new Error(data.error || "Local Ollama request failed with HTTP " + response.status);
  const content = data.message?.content;
  if (!content) throw new Error("Local AI returned an empty reply draft. Try again or check the model.");
  const parsed = parseReviewReplyOutput(content);
  return {
    ...parsed,
    provider: "LOCAL_OLLAMA",
    model,
    language: input.language,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "Private draft only. Review and edit before saving. Nothing was sent or published."
  };
}
