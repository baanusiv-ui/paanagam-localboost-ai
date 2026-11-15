export type ImageDraftInput = {
  businessName: string;
  topic: string;
  offer?: string;
  creativeBrief?: string;
  language: "Tamil" | "English" | "Tamil + English";
  format: "SQUARE" | "PORTRAIT" | "STORY";
};

const imageModel = () => (process.env.REPLICATE_IMAGE_MODEL || "black-forest-labs/flux-3-image").trim();

function errorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { detail?: unknown; error?: unknown; message?: unknown };
  for (const candidate of [value.detail, value.error, value.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

export async function generateReplicateCampaignImage(input: ImageDraftInput) {
  const apiToken = process.env.REPLICATE_API_TOKEN?.trim();
  if (!apiToken) {
    throw new Error("Replicate image generation is not configured. Add REPLICATE_API_TOKEN to the LocalBoost production API environment in Render.");
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

  const apiBase = "https://api.replicate.com/v1";
  const headers = {
    authorization: "Bearer " + apiToken,
    "content-type": "application/json"
  };
  const createResponse = await fetch(apiBase + "/models/" + imageModel() + "/predictions", {
    method: "POST",
    headers: { ...headers, Prefer: "wait=60" },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: aspectRatio[input.format],
        resolution: "1k",
        grounding: false,
        output_format: "webp",
        output_quality: 90
      }
    }),
    signal: AbortSignal.timeout(90000)
  });

  const createText = await createResponse.text();
  let prediction: {
    id?: string;
    status?: string;
    output?: string | string[] | null;
    error?: unknown;
    urls?: { get?: string };
  };
  try { prediction = JSON.parse(createText) as typeof prediction; }
  catch { throw new Error("Replicate returned malformed JSON (HTTP " + createResponse.status + ")."); }

  if (!createResponse.ok) {
    throw new Error("Replicate FLUX generation failed (HTTP " + createResponse.status + ")" +
      (errorMessage(prediction) ? ": " + errorMessage(prediction)!.slice(0, 240) : ". Check the Replicate token, model access and account balance."));
  }

  let pollUrl = prediction.urls?.get || (prediction.id ? apiBase + "/predictions/" + prediction.id : undefined);
  const deadline = Date.now() + 180000;
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (!pollUrl || Date.now() >= deadline) {
      throw new Error("Replicate FLUX generation is still processing. Retry after checking the prediction in Replicate.");
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    const pollResponse = await fetch(pollUrl, {
      headers: { authorization: "Bearer " + apiToken },
      signal: AbortSignal.timeout(30000)
    });
    const pollText = await pollResponse.text();
    try { prediction = JSON.parse(pollText) as typeof prediction; }
    catch { throw new Error("Replicate returned malformed prediction status (HTTP " + pollResponse.status + ")."); }
    if (!pollResponse.ok) {
      throw new Error("Replicate prediction check failed (HTTP " + pollResponse.status + ").");
    }
    pollUrl = prediction.urls?.get || pollUrl;
  }

  if (prediction.status !== "succeeded") {
    throw new Error("Replicate FLUX generation " + (prediction.status || "failed") +
      (errorMessage(prediction) ? ": " + errorMessage(prediction)!.slice(0, 240) : ". Check the Replicate prediction details."));
  }

  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof outputUrl !== "string" || !/^https:\/\//i.test(outputUrl)) {
    throw new Error("Replicate FLUX returned no valid output image URL.");
  }

  const imageResponse = await fetch(outputUrl, { signal: AbortSignal.timeout(60000) });
  if (!imageResponse.ok) throw new Error("Could not retrieve the generated FLUX image (HTTP " + imageResponse.status + ").");
  const mimeType = (imageResponse.headers.get("content-type") || "image/webp").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("Replicate returned an unsupported image format: " + mimeType);
  }
  const imageData = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
  if (!imageData) throw new Error("Replicate returned an empty image file.");

  return {
    imageDataUrl: "data:" + mimeType + ";base64," + imageData,
    mimeType,
    provider: "REPLICATE_FLUX",
    model: imageModel(),
    predictionId: prediction.id,
    generatedAt: new Date().toISOString(),
    storage: "TEMPORARY_BROWSER_PREVIEW",
    disclaimer: "FLUX-generated artwork is a temporary preview. Save it to the business creative library after review; this response does not publish it."
  };
}
