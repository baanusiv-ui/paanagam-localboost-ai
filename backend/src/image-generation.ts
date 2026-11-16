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
    throw new Error("GPT Image generation is not configured. OPENROUTER_API_KEY is missing from the LocalBoost API environment in Render.");
  }

  const sizes: Record<ImageDraftInput["format"], string> = {
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
    input.caption ? "Exact social caption context (use only to understand the campaign mood and subject; do not render any words): " + input.caption.slice(0, 1800) : "",
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
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      aspect_ratio: sizes[input.format],
      quality: "high",
      output_format: "png",
      n: 1
    }),
    signal: AbortSignal.timeout(180000)
  });

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();
  let raw: {
    data?: Array<{ b64_json?: string; revised_prompt?: string; media_type?: string }>;
    usage?: { cost?: number };
    error?: { message?: string; type?: string; code?: string };
  } = {};
  if (contentType.toLowerCase().includes("application/json")) {
    try { raw = JSON.parse(responseText) as typeof raw; }
    catch { throw new Error("OpenRouter returned malformed JSON (HTTP " + response.status + ")."); }
  }
  if (!response.ok) {
    const detail = raw.error?.message;
    throw new Error("GPT Image generation failed (HTTP " + response.status + ")" + (detail ? ": " + detail.slice(0, 240) : ". Check OpenRouter model access, account credits and model availability."));
  }
  const imageData = raw.data?.[0]?.b64_json;
  if (!imageData || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
    throw new Error("OpenRouter returned no buffered image data. Check the configured GPT Image model and account credits.");
  }
  return {
    imageDataUrl: "data:" + (raw.data?.[0]?.media_type || "image/png") + ";base64," + imageData,
    mimeType: raw.data?.[0]?.media_type || "image/png",
    provider: "OPENAI_GPT_IMAGE",
    model: imageModel(),
    generatedAt: new Date().toISOString(),
    costUsd: raw.usage?.cost,
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "GPT Image artwork is a temporary preview. Save it to the business creative library after review; this response does not publish it."
  };
}
