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
  const visualBrief = (input.creativeBrief || "").replace(/text overlay[^.]*\.?|text overlay[^\n]*/gi, "").slice(0, 500);\n  const prompt = [\n    "Photorealistic commercial food photograph. This is a product photograph, NOT a poster, NOT a logo, NOT a menu, and NOT a graphic design.",\n    "PRIMARY SUBJECT: one complete traditional South Indian stainless-steel davara and tumbler filled with freshly brewed dark filter coffee, with a small layer of golden-brown froth and delicate natural steam. The tumbler and davara must be large, sharp, clearly recognizable, and fully visible in the center of the image.",\n    "CAMERA AND COMPOSITION: eye-level three-quarter close-up, 50mm food photography lens, crisp focus on the entire coffee tumbler and davara, warm natural window light, softly blurred authentic South Indian cafe background. Keep the product within the central 65 percent and leave comfortable empty space around it. Do not place the cup at the edge or crop any part of it.",\n    "COLOR AND MOOD: inviting warm ivory, coffee brown and subtle brass highlights; bright enough to see the coffee and metal reflections clearly; premium but authentic local cafe atmosphere.",\n    "BACKGROUND ONLY. Absolutely no writing, no letters, no Tamil or English characters, no numbers, no signage, no menu, no label, no logo, no watermark, no icon, no badge, no poster, no typography, no decorative graphic, no packaging.",\n    "Do not render any part of the business name, campaign headline, opening date, offer, or designer instructions as visible content. The application adds all campaign text after image generation.",\n    "Business context: " + input.businessName.slice(0, 100) + ". Product: " + input.topic.slice(0, 180) + ".",\n    visualBrief ? "Visual mood reference only (ignore any text or layout instructions): " + visualBrief : "Use a warm, authentic South Indian cafe setting.",\n    formatGuidance[input.format].description

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
