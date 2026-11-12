# Paanagam POS → LocalBoost customer education data contract

Status: proposed integration contract; not implemented by either application.

## Why this contract exists

The native Paanagam POS stores menu items, ingredient records, recipe/BOM lines, production batches and SOP documents in its local Room database. The current LocalBoost POS connector imports only `menu` and `sales/daily`. It does not receive recipe lines, ingredient master data or approved SOP facts.

LocalBoost must therefore treat imported menu names and sales data as discovery context only. It must not infer ingredients, preparation methods, sourcing, nutrition, allergens, health benefits or quality claims from a menu name or sales record.

## Data minimisation and publication boundary

Do **not** export raw `recipe_lines`, ingredient quantities, FIFO costs, supplier costs, stock balances, production yields or internal SOP instructions to the marketing system.

Instead, the POS should expose a dedicated, read-only, owner-curated education feed. The feed should contain only facts that the owner has explicitly approved for customer-facing use. A recipe being configured for stock deduction is not, by itself, permission to disclose its ingredients or method.

Suggested endpoint:

`GET /api/v1/integration/education/catalog?limit=500&cursor=...`

Every response should include:

- `source: "paanagam-pos"`
- `api_version: "v1"`
- `data_updated_at` (ISO-8601)
- `data` (array)
- `next_cursor` (opaque cursor or null)

Suggested item shape:

```json
{
  "menu_item_id": "stable-id",
  "name": "Filter Coffee",
  "active": true,
  "education": {
    "status": "OWNER_APPROVED",
    "fact_version": 3,
    "approved_at": "2026-11-12T00:00:00.000Z",
    "approved_by": "owner",
    "language": ["ta", "en"],
    "customer_facing_facts": [
      {
        "fact_id": "stable-fact-id",
        "topic": "preparation",
        "text_ta": "Owner-approved Tamil fact.",
        "text_en": "Owner-approved English fact.",
        "evidence_ref": "SOP-or-recipe-version-reference"
      }
    ],
    "allowed_claims": ["preparation"],
    "prohibited_claims": ["health benefit", "nutrition", "allergen-free"]
  }
}
```

The example text is a placeholder, not a Paanagam claim. Only POS owner-entered and approved text may populate customer-facing facts. Empty or missing `education`, any status other than `OWNER_APPROVED`, or a missing version must make the item ineligible for script generation.

## POS source-of-truth mapping

The native POS currently has these relevant local records:

- `catalog_items`: menu item identity, name, category and active state.
- `ingredients`: ingredient identity and base unit.
- `recipe_lines`: menu item → ingredient and base-unit quantity used for stock deduction.
- `sop_documents`: versioned SOP document with status and instructions.
- `production_batches` / `production_inputs`: operational preparation and input records.

These are private operational records. The education feed must not expose the raw recipe/BOM or internal instructions. A separate owner-approved customer-facing fact set should be stored/maintained in POS and linked to the relevant menu item and recipe/SOP version. The current POS schema does not yet show a dedicated customer-facing fact approval model; adding one requires a separate POS change and migration review.

## LocalBoost import and validation requirements

1. Keep the existing menu and daily-sales sync unchanged.
2. Add a separate read-only education-catalog sync after the POS endpoint exists.
3. Persist each menu item's approved education payload as a tenant-scoped record, with stable external ID `paanagam-pos:education:<menu_item_id>`.
4. Validate the response envelope, menu item ID, active state, approval status, positive integer fact version, approved timestamp, language and fact shape before saving.
5. Preserve source timestamps and source version. Upsert must not downgrade a newer approved fact version with an older response.
6. Do not treat a POS connection or recipe presence as customer-publication approval.
7. Every generated script must retain its menu item ID, fact version and evidence references. If any fact is stale, withdrawn, missing or not approved, block generation and explain why.
8. Render Tamil-first and English variants only from approved facts. Translation may change wording but must not add factual content.
9. Require owner review of every script and creative before any external post or video is created. Publishing remains a separate explicit approval action.
10. Log the exact approved fact version used for each draft so later edits to a recipe/SOP cannot silently rewrite historical content.

## Test cases required before enabling the connector

- Missing education object → item visible as menu context, script generation blocked.
- Draft / rejected / withdrawn education status → blocked.
- Approved facts with no evidence reference → blocked.
- Older fact version arriving after a newer version → newer record retained.
- Inactive menu item → excluded from new education opportunities.
- Recipe/BOM quantities, ingredient costs and stock balances → never present in LocalBoost payload or generated copy.
- Tamil and English copy → both trace to the same approved fact IDs and version.
- POS API unavailable → existing review and menu-sales features continue to work.
- Tenant A cannot read Tenant B's education records.
- No auto-publish, no public reply and no paid generation from the import path.

## Current implementation status

- LocalBoost imports POS menu items and daily sales only; there is no POS recipe/education feed importer.
- LocalBoost now has a manual owner-entered education facts screen. It reads active menu context from imported `MENU_ITEM` records and stores owner-approved bilingual facts as tenant-scoped `Evidence` records using the existing evidence API; no Prisma enum or database migration was needed.
- The facts screen supports explicit owner confirmation before saving, Tamil and English text, an evidence reference, fact versioning and withdrawal records. Withdrawn facts remain in the audit history and are not counted as active.
- The facts screen does not generate scripts, create creatives, or publish. Script generation remains blocked pending a tested approved-fact retrieval/traceability pipeline.
- Paanagam POS has local recipe/BOM and SOP tables, but no confirmed customer-facing education approval/export endpoint. Raw recipe/BOM data is not exported.
- No production database migration or deployment is authorised by this document.
