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

  const formatGuidance: Record<ImageDraftInput["format"], { description: string; width: number; height: number }> = {
    SQUARE: { description: "Square 1:1 composition for a social feed.", width: 1024, height: 1024 },
    PORTRAIT: { description: "Portrait 4:5 composition for an Instagram or Facebook feed.", width: 896, height: 1120 },
    STORY: { description: "Vertical 9:16 composition for a Story or Reel cover.", width: 768, height: 1360 }
  };
  const prompt = [
    "Create a clean, photorealistic BACKGROUND IMAGE ONLY for a premium Indian local-business social campaign. The app adds typography separately.",
    "Business name: " + input.businessName.slice(0, 160),
    "Campaign topic or product: " + input.topic.slice(0, 300),
    "Owner-supplied offer or facts: " + ((input.offer || "None supplied. Do not invent any offer, price, discount, date or guarantee.").slice(0, 500)),
    "Creative direction: " + ((input.creativeBrief || "Create a tasteful, appetising, locally relevant product-led visual.").slice(0, 1200)),
    "Language context: " + input.language + ".",
    formatGuidance[input.format].description,
    "COMPOSITION: show the entire hero subject fully inside the frame, with generous safe margins. Keep the main product in the central 60 percent. Do not crop the cup, tumbler, saucer, hands or food. Keep the lower 30 percent visually calm and slightly darker for a separate text overlay.",
    "STRICT NO-TEXT RULE: absolutely no text, letters, numbers, typography, signage, labels, logos, watermarks, badges, borders or graphic overlays. Do not write the business name or campaign date. The app adds verified text after generation.",
    "For filter coffee, show a complete traditional South Indian stainless-steel davara and tumbler with coffee and gentle steam, fully visible and not cut off. Use a warm, authentic South Indian cafe setting and premium commercial food photography."
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
