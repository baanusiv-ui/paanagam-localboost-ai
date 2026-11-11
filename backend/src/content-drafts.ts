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

const modelName = () => (process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash").trim();

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
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return contentSchema.parse(JSON.parse(cleaned));
}

export async function generateLocalContentDraft(input: ContentDraftInput) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Free cloud AI is not configured. Create a Gemini API key in Google AI Studio and add GEMINI_API_KEY to the LocalBoost API environment in Render.");
  }

  const prompt = buildContentDraftMessages(input).map(message => message.role.toUpperCase() + ":\n" + message.content).join("\n\n");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelName()) + ":generateContent", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            postCopy: { type: "STRING" },
            creativeBrief: { type: "STRING" }
          },
          required: ["postCopy", "creativeBrief"]
        },
        thinkingConfig: { thinkingLevel: "LOW" },
        maxOutputTokens: 900
      }
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error("Gemini cloud AI generation failed: " + (data.error?.message || "HTTP " + response.status));
  }
  const raw = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
  if (!raw) throw new Error("Gemini returned an empty content draft. Try again later.");
  return {
    ...parseContentDraftOutput(raw),
    provider: "GOOGLE_GEMINI",
    model: modelName(),
    language: input.language,
    format: input.format,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "AI-generated draft. Verify every business fact and approve before manual publishing. Nothing was scheduled or published."
  };
}
