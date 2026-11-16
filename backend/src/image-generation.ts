import { env } from "./env.js";

export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  caption?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageModel = () => env.OPENROUTER_GPT_IMAGE_MODEL.trim();

export async function generateOpenRouterCampaignImage(input: ImageDraftInput) {
  const apiKey = env.OPENROUTER_API_KEY.trim();
  if (!apiKey) {
    throw new Error("GPT Image generation is not configured. Add OPENROUTER_API_KEY to the LocalBoost API environment in Render.");
  }

  const aspectRatios: Record<ImageDraftInput["format"], string> = {
    SQUARE: "1:1",
    PORTRAIT: "3:4",
    STORY: "9:16"
  };
  const prompt = [
    "Create a premium, photorealistic commercial campaign photograph for a South Indian café.",
    "Business: " + input.businessName.slice(0, 100) + ".",
    "Campaign subject: " + input.topic.slice(0, 180) + ".",
    input.offer ? "Offer context: " + input.offer.slice(0, 240) + "." : "",
    input.creativeBrief ? "Creative direction: " + input.creativeBrief.slice(0, 500) + "." : "",
    input.caption ? "Social caption context (use only to understand the campaign mood and subject; do not render any words): " + input.caption.slice(0, 1800) : "",
    "Brand palette: mustard yellow, warm ivory, coffee brown and dark walnut, with subtle kolam-inspired details where appropriate.",
    "Make the actual campaign subject the clear focal point. Match the visual to the topic: food and drink photography for menu/product posts, people and atmosphere for experience posts, and relevant local context for community posts. Do not default to a storefront.",
    "Compose as finished social campaign photography, not a mockup, phone frame, slide, collage or poster. Leave tasteful negative space for a separate brand overlay.",
    "Do not include text, letters, Tamil or English characters, numbers, logos, watermarks, signage, menus, labels, prices or invented claims.",
    "Do not invent product details or depict items not supported by the campaign subject and supplied brief.",
    "Photographic realism, natural materials, refined lighting and an authentic South Indian setting."
  ].filter(Boolean).join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
      "HTTP-Referer": env.OPENROUTER_SITE_URL,
      "X-Title": "LocalBoost AI"
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      aspect_ratio: aspectRatios[input.format],
      quality: "high",
      n: 1
    }),
    signal: AbortSignal.timeout(180000)
  });

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();
  let raw: {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: { cost?: number };
    error?: { message?: string; type?: string; code?: string } | string;
  } = {};
  if (contentType.toLowerCase().includes("application/json")) {
    try { raw = JSON.parse(responseText) as typeof raw; }
    catch { throw new Error("OpenRouter returned malformed JSON for GPT Image (HTTP " + response.status + ")."); }
  }
  if (!response.ok) {
    const detail = typeof raw.error === "string" ? raw.error : raw.error?.message;
    const guidance = response.status === 401
      ? " Check OPENROUTER_API_KEY in Render."
      : response.status === 402
        ? " OpenRouter image generation requires an available credit balance above its image-request pre-authorization."
        : response.status === 404
          ? " Verify OPENROUTER_GPT_IMAGE_MODEL against OpenRouter's current image-model catalogue."
          : "";
    throw new Error("OpenRouter GPT Image failed (HTTP " + response.status + ")" + (detail ? ": " + detail.slice(0, 260) : ".") + guidance);
  }

  const image = raw.data?.find(item => typeof item.b64_json === "string" && item.b64_json.length > 0);
  const imageData = image?.b64_json;
  if (!imageData || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
    throw new Error("OpenRouter completed the request but returned no valid base64 image. Check that the configured model supports the Image API.");
  }
  const mimeType = image?.media_type || "image/png";
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error("OpenRouter returned an unsupported image format: " + mimeType + ".");
  }

  return {
    imageDataUrl: "data:" + mimeType + ";base64," + imageData,
    mimeType,
    provider: "OPENROUTER_GPT_IMAGE",
    model: imageModel(),
    generatedAt: new Date().toISOString(),
    usage: raw.usage ?? null,
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "GPT Image artwork is a temporary preview until saved to the selected business creative library. Nothing is published."
  };
}
