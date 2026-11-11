export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageModel = "@cf/black-forest-labs/flux-1-schnell";

export async function generateCampaignImage(input: ImageDraftInput) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) {
    throw new Error("Free image generation is not configured yet. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the LocalBoost API environment in Render. Create a Workers AI API token in Cloudflare with Workers AI Read and Edit permissions.");
  }

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

  const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/run/" + imageModel;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + apiToken, "content-type": "application/json" },
    body: JSON.stringify({ prompt, steps: 4 }),
    signal: AbortSignal.timeout(180000)
  });
  const raw = await response.json() as {
    success?: boolean;
    result?: { image?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || raw.success === false) {
    const message = raw.errors?.map(item => item.message).filter(Boolean).join("; ");
    throw new Error(message || "Cloudflare Workers AI image generation failed with HTTP " + response.status);
  }
  const image = raw.result?.image;
  if (!image || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new Error("Cloudflare image provider returned an unsupported image response.");
  }
  return {
    imageDataUrl: "data:image/jpeg;base64," + image,
    mimeType: "image/jpeg",
    provider: "CLOUDFLARE_WORKERS_AI",
    model: imageModel,
    generatedAt: new Date().toISOString(),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "Generated artwork is a temporary preview. Download it or upload it to the business creative library; this response does not persist the image or publish it."
  };
}
