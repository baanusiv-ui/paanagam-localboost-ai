/**
 * Paanagam recipe evidence catalogue.
 *
 * This is deliberately a narrow, owner-confirmed pilot record. Do not infer
 * unrecorded ingredients, origin, roast, chicory ratio, health claims or yield.
 * Expand only from an approved source document or owner confirmation.
 */

export type RecipeEvidenceStatus = "OWNER_CONFIRMED" | "NEEDS_REVIEW" | "TRIAL_ONLY";

export type RecipeQuantity = {
  ingredient: string;
  quantity: number;
  unit: "g" | "ml";
  role: "BATCH" | "SERVING";
};

export type RecipeEvidence = {
  id: string;
  businessKey: "paanagam";
  name: string;
  version: number;
  status: RecipeEvidenceStatus;
  sourceLabel: string;
  verifiedAt: string;
  language: readonly ("ta" | "en")[];
  batch: {
    quantities: readonly RecipeQuantity[];
    expectedUsableOutput: { quantity: number; unit: "ml"; qualifier: "approximately" };
  };
  serving: {
    quantities: readonly RecipeQuantity[];
    expectedServingVolume: { quantity: number; unit: "ml"; qualifier: "approximately" };
  };
  allowedClaims: readonly string[];
  prohibitedClaims: readonly string[];
};

export const PAANAGAM_FILTER_COFFEE_V1: RecipeEvidence = Object.freeze({
  id: "paanagam.filter-coffee",
  businessKey: "paanagam",
  name: "Paanagam Filter Coffee",
  version: 1,
  status: "OWNER_CONFIRMED",
  sourceLabel: "Paanagam owner-confirmed coffee decoction and serving SOP",
  verifiedAt: "2026-11-12",
  language: ["ta", "en"],
  batch: {
    quantities: [
      { ingredient: "Coffee powder", quantity: 250, unit: "g", role: "BATCH" },
      { ingredient: "Water", quantity: 1100, unit: "ml", role: "BATCH" }
    ],
    expectedUsableOutput: { quantity: 1000, unit: "ml", qualifier: "approximately" }
  },
  serving: {
    quantities: [
      { ingredient: "Coffee decoction", quantity: 25, unit: "ml", role: "SERVING" },
      { ingredient: "Milk", quantity: 75, unit: "ml", role: "SERVING" },
      { ingredient: "Sugar", quantity: 5, unit: "g", role: "SERVING" }
    ],
    expectedServingVolume: { quantity: 100, unit: "ml", qualifier: "approximately" }
  },
  allowedClaims: [
    "The recorded decoction batch uses 250 g coffee powder and 1,100 ml water.",
    "The expected usable decoction output is approximately 1,000 ml.",
    "The recorded serving uses 25 ml decoction, 75 ml milk and 5 g sugar.",
    "Consistent measurement supports consistency in preparation."
  ],
  prohibitedClaims: [
    "Coffee bean origin, variety or grade",
    "Roast profile or roast date",
    "Chicory percentage or blend composition",
    "Health, medical or nutritional benefit claims",
    "Certifications, awards or superiority claims",
    "Exact decoction yield beyond the stated approximate value"
  ]
});

export function getPaanagamRecipe(recipeId: string): RecipeEvidence | null {
  return recipeId === PAANAGAM_FILTER_COFFEE_V1.id ? PAANAGAM_FILTER_COFFEE_V1 : null;
}

/** Build a constrained source note for a creative brief; never invent missing facts. */
export function buildPaanagamRecipeEvidenceNote(recipeId: string): string | null {
  const recipe = getPaanagamRecipe(recipeId);
  if (!recipe || recipe.status !== "OWNER_CONFIRMED") return null;

  const batch = recipe.batch.quantities.map(q => `${q.ingredient}: ${q.quantity} ${q.unit}`).join("; ");
  const serving = recipe.serving.quantities.map(q => `${q.ingredient}: ${q.quantity} ${q.unit}`).join("; ");

  return [
    `SOURCE: ${recipe.sourceLabel}; version ${recipe.version}; verified ${recipe.verifiedAt}.`,
    `BATCH: ${batch}. Expected usable decoction: approximately ${recipe.batch.expectedUsableOutput.quantity} ml.`,
    `SERVING: ${serving}. Expected serving volume: approximately ${recipe.serving.expectedServingVolume.quantity} ml.`,
    `ALLOWED FACTS: ${recipe.allowedClaims.join(" ")}`,
    `DO NOT CLAIM: ${recipe.prohibitedClaims.join("; ")}.`,
    "If a fact is not listed above, mark it unverified and omit it from customer-facing content."
  ].join("\\n");
}
