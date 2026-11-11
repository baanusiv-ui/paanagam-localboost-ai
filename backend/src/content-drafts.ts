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

const modelName = () => (process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini").trim();

export function buildContentDraftMessages(input: ContentDraftInput) {
  return [
    {
      role: "system",
      content: [
        "You create truthful social campaign drafts for an Indian local business.",
        "Use only the supplied business name, topic, offer and publish date. Never invent prices, discounts, dates, availability, opening hours, addresses, ingredients, awards, customer reviews or guarantees.",
        "If no offer is supplied, do not create an offer or imply a discount.",
        "Write concise, natural, engaging copy in the requested language. For Tamil + English, write natural Tamil first and a short English version second.",
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

export function parseContentDraftOutput(raw: string) {
  return contentSchema.parse(JSON.parse(raw));
}

export async function generateLocalContentDraft(input: ContentDraftInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Cloud AI is not configured. Add OPENAI_API_KEY to the LocalBoost API service environment in Render, then redeploy.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: modelName(),
      messages: buildContentDraftMessages(input),
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 900
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    const reason = data.error?.message || "OpenAI request failed with HTTP " + response.status;
    throw new Error("Cloud AI generation failed: " + reason);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Cloud AI returned an empty content draft. Try again.");
  return {
    ...parseContentDraftOutput(content),
    provider: "OPENAI_API",
    model: modelName(),
    language: input.language,
    format: input.format,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "AI-generated draft. Verify every business fact and approve before manual publishing. Nothing was scheduled or published."
  };
}
