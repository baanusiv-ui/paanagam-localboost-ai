import test from "node:test";
import assert from "node:assert/strict";
import {
  PAANAGAM_FILTER_COFFEE_V1,
  buildPaanagamRecipeEvidenceNote,
  getPaanagamRecipe
} from "./paanagam-recipe-catalogue.js";

test("Paanagam filter coffee evidence keeps the owner-confirmed batch and serving quantities", () => {
  assert.equal(PAANAGAM_FILTER_COFFEE_V1.status, "OWNER_CONFIRMED");
  assert.deepEqual(PAANAGAM_FILTER_COFFEE_V1.batch.quantities.map(({ ingredient, quantity, unit }) => [ingredient, quantity, unit]), [
    ["Coffee powder", 250, "g"],
    ["Water", 1100, "ml"]
  ]);
  assert.deepEqual(PAANAGAM_FILTER_COFFEE_V1.serving.quantities.map(({ ingredient, quantity, unit }) => [ingredient, quantity, unit]), [
    ["Coffee decoction", 25, "ml"],
    ["Milk", 75, "ml"],
    ["Sugar", 5, "g"]
  ]);
});

test("recipe lookup rejects unknown recipes and evidence notes stay within approved facts", () => {
  assert.equal(getPaanagamRecipe("unknown.recipe"), null);
  assert.equal(buildPaanagamRecipeEvidenceNote("unknown.recipe"), null);
  const note = buildPaanagamRecipeEvidenceNote("paanagam.filter-coffee");
  assert.ok(note);
  assert.match(note, /250 g/);
  assert.match(note, /1,100 ml/);
  assert.match(note, /approximately 1,000 ml/);
  assert.match(note, /25 ml/);
  assert.match(note, /75 ml/);
  assert.match(note, /5 g/);
  assert.match(note, /DO NOT CLAIM/);
});
