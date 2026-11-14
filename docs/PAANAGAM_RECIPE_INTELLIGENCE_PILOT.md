# Paanagam recipe intelligence pilot

## Scope

The first pilot is limited to **Paanagam Filter Coffee**. POS menu sync is known to be stale, so this feature must not depend on the synced menu list or infer other menu items.

## Evidence record

The source-of-truth pilot record is `backend/src/paanagam-recipe-catalogue.ts`.

- Status: owner-confirmed
- Version: 1
- Batch: 250 g coffee powder + 1,100 ml water
- Expected usable decoction: approximately 1,000 ml
- Serving: 25 ml decoction + 75 ml milk + 5 g sugar
- Expected serving volume: approximately 100 ml

These quantities are the only approved recipe facts for this pilot. Do not infer coffee origin, roast profile, chicory percentage, health benefits, certifications, or additional menu ingredients.

## Safety and content rules

1. A creative brief may cite only an owner-confirmed recipe record.
2. Every recipe record must carry an ID, version, source label, verification date and status.
3. Unverified or trial-only data must be excluded from customer-facing claims.
4. Do not use the stale POS menu sync as a recipe source.
5. PoYo remains draft-only. Saving a recipe-grounded brief must not submit a provider request, spend credits or publish content.
6. Owner approval remains required before any future generation or publishing workflow.

## Next implementation gate

Before mounting API routes or wiring the catalogue into PoYo, verify the backend build/test conventions and the existing route registration entry point. Then add tenant-scoped read access and bind a saved PoYo draft to the recipe ID and version used to create it. Do not modify POS data or production authentication.
