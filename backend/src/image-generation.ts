import { z } from "zod";

export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1)
});

const imageModel = () => (process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare").trim();

export async function generateCampaignImage(input: ImageDraftInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Image generation is not configured. Add OPENAI_API_KEY to the LocalBoost API service environment before generating artwork.");

  const formatGuidance: Record<ImageDraftInput["format"], string> = {
    SQUARE: "Square 1:1 composition for a social feed.",
    PORTRAIT: "Portrait 4:5 composition for an Instagram or Facebook feed.",
    STORY: "Vertical 9:16 composition for a Story or Reel cover."
  };
  const prompt = [
    "Create one polished, photorealistic social campaign image for an Indian local business.",
    "Business name: " + input.businessName.slice(0, 160),
    "Campaign topic or product: " + input.topic.slice(0, 300),
    "Owner-supplied offer or facts: " + ((input.offer || "None supplied. Do not invent any offer, price, discount, date or guarantee.").slice(0, 500)),
    "Creative direction: " + ((input.creativeBrief || "Create a tasteful, appetising, locally relevant product-led visual.").slice(0, 1200)),
    "Language context: " + input.language + ".",
    formatGuidance[input.format],
    "Visual accuracy: depict only the topic and facts provided. Do not invent brand marks, packaging, logos, prices, text, watermarks, badges or claims. Do not render words or letters; leave clean negative space for a designer to add verified copy later.",
    "Use natural lighting, authentic materials, clear subject hierarchy and professional commercial food/product photography where appropriate."
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      n: 1,
      size: input.format === "SQUARE" ? "1024x1024" : input.format === "PORTRAIT" ? "1024x1280" : "1008x1792",
      quality: "medium",
      output_format: "png"
    }),
    signal: AbortSignal.timeout(180000)
  });
  const raw = await response.json() as unknown;
  if (!response.ok) {
    const message = (raw as { error?: { message?: string } })?.error?.message;
    throw new Error(message || "Image provider request failed with HTTP " + response.status);
  }
  const parsed = imageResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Image provider returned an unsupported response.");
  return {
    imageDataUrl: "data:image/png;base64," + parsed.data.data[0].b64_json,
    mimeType: "image/png",
    provider: "OPENAI_IMAGES_API",
    model: imageModel(),
    generatedAt: new Date().toISOString(),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "Generated artwork is a temporary preview. Download it or upload it to an approved asset store; this response does not persist the image or publish it."
  };
}
