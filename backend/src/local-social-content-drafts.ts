import { z } from "zod";

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

const baseUrl = () => (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const modelName = () => (process.env.OLLAMA_MODEL || "qwen3.5:4b").trim();
const headers = () => ({
  "content-type": "application/json",
  ...(process.env.OLLAMA_ACCESS_CLIENT_ID && process.env.OLLAMA_ACCESS_CLIENT_SECRET ? {
    "CF-Access-Client-Id": process.env.OLLAMA_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": process.env.OLLAMA_ACCESS_CLIENT_SECRET
  } : {})
});

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
  const base = baseUrl();
  const model = modelName();
  if (!base) throw new Error("Local Ollama is not configured. Check OLLAMA_BASE_URL in the LocalBoost API environment.");
  const response = await fetch(base + "/api/chat", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: buildLocalSocialContentMessages(input),
      stream: false,
      format: "json",
      options: { temperature: 0.3 }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json() as { message?: { content?: string }; error?: string };
  if (!response.ok) throw new Error(data.error || "Local Ollama request failed with HTTP " + response.status);
  const raw = data.message?.content;
  if (!raw) throw new Error("Local Ollama returned an empty content draft.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Local Ollama returned invalid JSON for the content draft."); }
  const draft = outputSchema.parse(parsed);
  return {
    ...draft,
    provider: "LOCAL_OLLAMA",
    model,
    language: input.language,
    format: input.format,
    tone: input.tone,
    generatedAt: new Date().toISOString(),
    status: "DRAFT",
    disclaimer: "Locally generated draft. Verify every business fact and approve before manual publishing. Nothing was scheduled or published."
  };
}
