export type PoyoMediaKind = "IMAGE" | "VIDEO";

export type PoyoModelDefinition = {
  id: string;
  name: string;
  provider: string;
  mediaType: PoyoMediaKind;
  documentationUrl: string;
  useCases: string[];
  schemaVerified: false;
  priceVerified: false;
  enabledForGeneration: false;
};

// Documentation-backed discovery catalogue only. This is deliberately not
// a claim that these models are enabled on the connected PoYo account.
// Generation remains blocked until live account/model schema and price checks pass.
export const POYO_MODEL_CATALOGUE: PoyoModelDefinition[] = [
  {
    id: "wan-2.7-video",
    name: "Wan 2.7",
    provider: "Alibaba",
    mediaType: "VIDEO",
    documentationUrl: "https://docs.poyo.ai/api-manual/video-series/wan-2-7-video.md",
    useCases: ["cinematic reels", "image-to-video", "reference-led campaigns"],
    schemaVerified: false,
    priceVerified: false,
    enabledForGeneration: false
  },
  {
    id: "wan-3.0-video",
    name: "Wan 3.0",
    provider: "Alibaba",
    mediaType: "VIDEO",
    documentationUrl: "https://docs.poyo.ai/api-manual/video-series/wan-3-0-video.md",
    useCases: ["story-led video", "multimodal references", "controllable audio"],
    schemaVerified: false,
    priceVerified: false,
    enabledForGeneration: false
  },
  {
    id: "wan-2.7-image",
    name: "Wan 2.7 Image",
    provider: "Alibaba",
    mediaType: "IMAGE",
    documentationUrl: "https://docs.poyo.ai/api-manual/image-series/wan-2-7-image.md",
    useCases: ["brand graphics", "product imagery", "reference-image editing"],
    schemaVerified: false,
    priceVerified: false,
    enabledForGeneration: false
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    provider: "OpenAI",
    mediaType: "IMAGE",
    documentationUrl: "https://docs.poyo.ai/api-manual/image-series/gpt-image-2.md",
    useCases: ["campaign graphics", "product photography", "image editing"],
    schemaVerified: false,
    priceVerified: false,
    enabledForGeneration: false
  }
];

export function listPoyoModels(mediaType?: PoyoMediaKind) {
  return POYO_MODEL_CATALOGUE.filter(model => !mediaType || model.mediaType === mediaType);
}

export function getPoyoModel(modelId: string) {
  return POYO_MODEL_CATALOGUE.find(model => model.id === modelId) ?? null;
}
