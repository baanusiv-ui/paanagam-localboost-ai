export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageModel = () => (process.env.OPENROUTER_IMAGE_MODEL || "black-forest-labs/flux-3-image").trim();

export async function generateOpenRouterCampaignImage(input: ImageDraftInput) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenRouter image generation is not configured. Add OPENROUTER_API_KEY to the LocalBoost API environment in Render.");
  }

  const aspectRatio: Record<ImageDraftInput["format"], string> = {
    SQUARE: "1:1",
    PORTRAIT: "4:5",
    STORY: "9:16"
  };
  const prompt = [
    "Create a premium, photorealistic commercial campaign photograph for a South Indian café.",
    "Business: " + input.businessName.slice(0, 100) + ".",
    "Campaign subject: " + input.topic.slice(0, 180) + ".",
    input.offer ? "Offer context: " + input.offer.slice(0, 240) + "." : "",
    input.creativeBrief ? "Creative direction: " + input.creativeBrief.slice(0, 500) + "." : "",
    "Brand palette: mustard yellow, warm ivory, coffee brown and dark walnut, with subtle traditional kolam-inspired atmosphere.",
    "Make the main subject clear, attractive and fully visible. Compose with deliberate negative space for a brand and campaign text overlay.",
    "Generate the visual artwork only. Do not include text, letters, Tamil or English characters, numbers, logos, watermarks, signage, menus, labels, prices or invented claims.",
    "Do not render the business name or campaign copy; LocalBoost adds approved text separately.",
    "Photographic realism, natural materials, refined lighting, authentic South Indian setting."
  ].filter(Boolean).join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://paanagam-localboost-dashboard.onrender.com",
      "X-Title": "LocalBoost AI"
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      aspect_ratio: aspectRatio[input.format],
      resolution: "1K"
    }),
    signal: AbortSignal.timeout(180000)
  });

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();
  let raw: {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
    error?: { message?: string };
    message?: string;
  } = {};
  if (contentType.toLowerCase().includes("application/json")) {
    try { raw = JSON.parse(responseText) as typeof raw; }
    catch { throw new Error("OpenRouter returned malformed JSON (HTTP " + response.status + ")."); }
  }
  if (!response.ok) {
    const detail = raw.error?.message || raw.message;
    throw new Error("OpenRouter image generation failed (HTTP " + response.status + ")" + (detail ? ": " + detail.slice(0, 240) : ". Check the OpenRouter key, model availability and credit balance."));
  }
  const imageData = raw.data?.[0]?.b64_json;
  if (!imageData || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
    throw new Error("OpenRouter returned no buffered image data. Verify the selected model supports the Images API.");
  }
  const mimeType = raw.data?.[0]?.media_type || (imageData.startsWith("iVBOR") ? "image/png" : imageData.startsWith("UklGR") ? "image/webp" : imageData.startsWith("/9j/") ? "image/jpeg" : "image/png");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("OpenRouter returned an unsupported image format: " + mimeType);
  }
  return {
    imageDataUrl: "data:" + mimeType + ";base64," + imageData,
    mimeType,
    provider: "OPENROUTER_FLUX",
    model: imageModel(),
    generatedAt: new Date().toISOString(),
    ...(typeof raw.usage?.cost === "number" ? { costUsd: raw.usage.cost } : {}),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "FLUX-generated artwork is a temporary preview. Save it to the business creative library after review; this response does not publish it."
  };
}
