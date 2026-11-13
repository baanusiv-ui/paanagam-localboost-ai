export type PoyoMediaKind = "IMAGE" | "VIDEO";

export type PoyoModelDefinition = {
  id: string;
  name: string;
  provider: string;
  mediaType: PoyoMediaKind;
  documentationUrl: string;
  useCases: string[];
  resolutions?: string[];
  estimatedCredits?: number;
  schemaVerified: boolean;
  priceVerified: boolean;
  enabledForGeneration: boolean;
};

// WAN 2.2 Fast IDs and request fields are verified against PoYo's current
// model documentation. Generation itself remains controlled by POYO_ENABLED.
export const POYO_MODEL_CATALOGUE: PoyoModelDefinition[] = [
  {
    id: "wan2.2-text-to-video-fast",
    name: "Wan 2.2 Fast · Text to Video",
    provider: "Alibaba",
    mediaType: "VIDEO",
    documentationUrl: "https://docs.poyo.ai/api-manual/video-series/wan2.2-text-to-video-fast",
    useCases: ["cinematic reels", "Tamil educational clips", "campaign concept videos"],
    resolutions: ["480p", "720p"],
    estimatedCredits: 6,
    schemaVerified: true,
    priceVerified: true,
    enabledForGeneration: false
  },
  {
    id: "wan2.2-image-to-video-fast",
    name: "Wan 2.2 Fast · Image to Video",
    provider: "Alibaba",
    mediaType: "VIDEO",
    documentationUrl: "https://docs.poyo.ai/api-manual/video-series/wan2.2-image-to-video-fast",
    useCases: ["animate approved artwork", "storyboard motion", "product and menu visuals"],
    resolutions: ["480p", "720p"],
    estimatedCredits: 6,
    schemaVerified: true,
    priceVerified: true,
    enabledForGeneration: false
  },
  {
    id: "nano-banana-2.1",
    name: "Google Nano Banana 2.1",
    provider: "Google",
    mediaType: "IMAGE",
    documentationUrl: "https://docs.poyo.ai/api-manual/image-series/overview.md",
    useCases: ["Paanagam campaign artwork", "product visuals", "reference-image editing"],
    resolutions: ["1K", "2K", "4K"],
    estimatedCredits: 2,
    schemaVerified: true,
    priceVerified: true,
    enabledForGeneration: true
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    provider: "OpenAI",
    mediaType: "IMAGE",
    documentationUrl: "https://docs.poyo.ai/api-manual/image-series/gpt-image-2",
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
