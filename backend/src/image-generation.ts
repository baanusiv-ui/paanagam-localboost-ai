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
  const visualBrief = (input.creativeBrief || "").slice(0, 500);
  const prompt = [
    "Photorealistic commercial food photograph, not a poster, logo, menu, or graphic design.",
    "PRIMARY SUBJECT: one complete traditional South Indian stainless-steel davara bowl with matching tumbler filled with freshly brewed dark filter coffee, golden-brown froth, and delicate natural steam. Show BOTH pieces completely, including their bases and rims. Place the complete coffee set in the CENTER of the frame, slightly above the vertical midpoint, never at the bottom or side edge.",
    "CAMERA: eye-level medium product shot from farther away, 50mm lens, not an extreme close-up. Entire cup and davara fully inside the central 50 percent of the image with at least 18 percent clear margin on every side. Leave the lower 35 percent free of objects for the app text panel. Do not crop, cut off, enlarge beyond the frame, or place the coffee set in the lower-right corner. No hands or people.",
    "COLOR: warm ivory, coffee brown, subtle brass highlights. Bright exposure so coffee and metal reflections are clearly visible.",
    "BACKGROUND PHOTOGRAPH ONLY. No writing, letters, Tamil or English characters, numbers, signage, menus, labels, logos, watermarks, icons, badges, posters, typography, decorative graphics, or packaging.",
    "Do not render the business name, campaign headline, opening date, offer, or designer instructions. The application adds all campaign text after image generation.",
    "Business context: " + input.businessName.slice(0, 100) + ". Product: " + input.topic.slice(0, 180) + ".",
    visualBrief ? "Visual mood reference only: " + visualBrief : "Use a warm, authentic South Indian cafe setting.",
    formatGuidance[input.format].description
  ].join("\\n");

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


export async function generateGeminiCampaignImage(input: ImageDraftInput) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Gemini image generation is not configured. Add GEMINI_API_KEY to the LocalBoost API environment in Render.");
  }
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
  const aspectRatio: Record<ImageDraftInput["format"], string> = {
    SQUARE: "1:1",
    PORTRAIT: "4:5",
    STORY: "9:16"
  };
  const prompt = [
    "Create a photorealistic commercial South Indian cafe campaign background photograph only.",
    "PRIMARY SUBJECT: " + input.topic.slice(0, 180) + ".",
    "Business context: " + input.businessName.slice(0, 100) + ".",
    input.offer ? "Offer context only; do not render text: " + input.offer.slice(0, 240) : "",
    input.creativeBrief ? "Visual mood guidance: " + input.creativeBrief.slice(0, 500) : "",
    "Warm ivory, coffee brown, mustard-gold highlights, dark walnut details, authentic premium but welcoming South Indian cafe atmosphere.",
    "Use a clear focal subject and uncluttered negative space near the top and bottom for the app to add the brand and campaign copy.",
    "NO text, letters, numbers, Tamil or English typography, logos, watermarks, signage, menus, labels, packaging, badges or graphic design.",
    "Photograph only. Do not invent prices, phone numbers, addresses, dates or claims.",
    "Output composition aspect ratio " + aspectRatio[input.format] + "."
  ].filter(Boolean).join("\\n");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: aspectRatio[input.format], imageSize: "1K" }
      }
    }),
    signal: AbortSignal.timeout(180000)
  });
  const raw = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> }; finishReason?: string }>;
    error?: { message?: string; status?: string };
  };
  if (!response.ok) {
    throw new Error(raw.error?.message || "Gemini image generation failed with HTTP " + response.status);
  }
  const parts = raw.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part.inlineData?.data);
  const imageData = imagePart?.inlineData?.data;
  const mimeType = imagePart?.inlineData?.mimeType || "image/png";
  if (!imageData || !/^image\/(png|jpeg|webp)$/.test(mimeType)) {
    const explanation = parts.map(part => part.text).filter(Boolean).join(" ").slice(0, 400);
    throw new Error(explanation || "Gemini returned no image. Finish reason: " + (raw.candidates?.[0]?.finishReason || "unknown"));
  }
  return {
    imageDataUrl: "data:" + mimeType + ";base64," + imageData,
    mimeType,
    provider: "GOOGLE_GEMINI",
    model,
    generatedAt: new Date().toISOString(),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "Generated artwork is a temporary preview. Download it or save it to the business creative library; this response does not publish it."
  };
}
