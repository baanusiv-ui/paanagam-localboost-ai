export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageModel = "muse-image-1.0";

export async function generateMetaMuseCampaignImage(input: ImageDraftInput) {
  const apiKey = process.env.MODEL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Meta Muse Image is not configured. Add MODEL_API_KEY to the LocalBoost API environment in Render.");
  }

  const formatSize: Record<ImageDraftInput["format"], string> = {
    SQUARE: "1024x1024",
    PORTRAIT: "1024x1280",
    STORY: "1024x1792"
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

  const response = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      n: 1,
      size: formatSize[input.format],
      response_format: "b64_json",
      output_format: "jpeg",
      reasoning_strength: "high",
      tool_enablement: { enable_web_search: false, enable_shell: false }
    }),
    signal: AbortSignal.timeout(180000)
  });
  const raw = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>;
    output_format?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!response.ok) {
    throw new Error(raw.error?.message || raw.message || "Meta Muse Image failed with HTTP " + response.status);
  }
  const imageData = raw.data?.[0]?.b64_json;
  if (!imageData || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
    throw new Error("Meta Muse Image returned no valid base64 image.");
  }
  return {
    imageDataUrl: "data:image/jpeg;base64," + imageData,
    mimeType: "image/jpeg",
    provider: "META_MUSE_IMAGE",
    model: imageModel,
    generatedAt: new Date().toISOString(),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "Generated artwork is a temporary preview. Download it or save it to the business creative library; this response does not publish it."
  };
}
