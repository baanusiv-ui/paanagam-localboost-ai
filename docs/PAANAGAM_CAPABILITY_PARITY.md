# Paanagam → LocalBoost capability parity audit

**Source:** `psiva1974/paanagam`  
**Destination:** `baanusiv-ui/paanagam-localboost-ai`  
**Audit scope:** repository implementation and documented read-only integration API  
**Rule:** LocalBoost is an intelligence layer, not a second POS. Paanagam remains the source of truth for bills, recipes, purchases, stock, payments and operational records.

## 1. Source capabilities verified in the repository

| Paanagam capability | Evidence in source repository | LocalBoost relevance |
|---|---|---|
| POS bills, refunds and offline sale sync | `cloud/migrations/20261111_offline_pos_sync.sql`, cloud README | Revenue and refund intelligence |
| Recipe/BOM and SOP management | `web/src/pages/Recipes.jsx` | Recipe and menu cost analysis |
| Food cost calculator | `web/src/pages/FoodCost.jsx` | Recipe cost, food cost %, contribution |
| FIFO purchase lots | `stock_lots_c` usage in FoodCost, KitchenStock and StockTransfer; FIFO cloud lot functions | Actual ingredient cost |
| Store and kitchen inventory | `web/src/pages/KitchenStock.jsx`, `web/src/pages/StockTransfer.jsx` | Stock valuation and stock health |
| Store → kitchen transfer | `web/src/pages/StockTransfer.jsx` | Transfer reconciliation; never a new purchase or expense |
| Production batches and prepared items | `production_batches_c`, `sub_products_c`, recipe and food-cost logic | Yield-adjusted sub-recipe costing |
| Wastage | `wastage_c`, stock sync migration | Wastage value and causes |
| Purchases and supplier cost | `purchases_c`, `stock_lots_c`, Reports page | Purchase price trends and FIFO layers |
| Daily reports | `web/src/pages/Reports.jsx` | Daily financial snapshot |
| Cash / UPI reconciliation | `web/src/pages/SalesReconciliation.jsx` | Payment variance |
| Operating cost accrual | `web/src/services/costs.js` | Salary, recurring bills, one-off expenses, gas |
| Attendance and pay profiles | `pos_attendance`, `pos_staff_pay` | Labour cost aggregates only |
| Cash shifts and day close | `pos_cash_shift`, `pos_day_close` | Cash drawer variance |
| Split payment | `cloud/migrations/20261118_split_payment.sql` | Payment-method accuracy; verify deployed status before relying on it |
| Cashier attribution | `cloud/migrations/20261120_cashier_attribution.sql` | Not required for LocalBoost financial aggregation; do not import staff identity |
| FIFO-only costing hardening | `cloud/migrations/20261121_fifo_only_costing.sql` | Do not use moving average; verify migration deployment before claiming live enforcement |

Repository presence is not proof that every migration is applied to the live POS database. Check the actual migration history and live API response before production activation.

## 2. LocalBoost gaps found before this change

The existing LocalBoost connector only fetched:
- `GET /menu`
- `GET /sales/daily`

It did not fetch other endpoints already documented by the Paanagam read-only API. This prevented LocalBoost from using menu-item sales, order summaries, payment summaries, inventory summaries and source freshness.

## 3. Added in this branch

The POS sync now requests and stores the following documented, read-only API resources:

| API resource | LocalBoost record type | Use |
|---|---|---|
| `GET /menu` | `MENU_ITEM` | Menu catalogue |
| `GET /sales/daily` | `DAILY_SALES` | Daily revenue |
| `GET /sales/items` | `MENU_ITEM_SALES` | Item mix and menu performance |
| `GET /orders/summary` | `ORDER_SUMMARY` | Orders and AOV context |
| `GET /payments/summary` | `PAYMENT_SUMMARY` | Cash/UPI collections and refunds |
| `GET /inventory/summary` | `INVENTORY_SNAPSHOT` | Store/kitchen stock summary |
| `GET /sync/status` | `POS_SYNC_STATUS` | Freshness, version and sync health |

Additional connector safeguards:
- Every response is checked for `source=paanagam-pos` and API version `v1`.
- After connection, every response must match the saved POS business ID.
- Pagination cursors are checked for repetition and bounded to 1,000 pages.
- Imports are idempotent through the existing business + record type + external ID unique key.
- Source timestamp, currency, timezone, branch, coverage and notes are retained with imported aggregates.
- The connection records source freshness, version, coverage and import counts.
- Data older than 24 hours is marked stale; stale source data is never presented as current.
- The connector remains GET-only and does not write to Paanagam.
- No customer contact details, UPI references, staff PINs or cashier names are imported.

## 4. Still blocked by the current POS export API

The following operational data exists in Paanagam code/cloud sync, but the documented LocalBoost API does not currently expose it:

1. Recipe definitions, recipe ingredients, recipe versions and sub-recipe BOMs.
2. Production batches, actual yields and preparation loss.
3. Purchase invoices, supplier identity and item-level purchase batches.
4. FIFO lot quantities, remaining balances, unit costs and lot allocation history.
5. Stock movement events and store-to-kitchen transfer allocations.
6. Wastage entries with reason, quantity and FIFO cost.
7. One-off operating expenses and covered-period allocation.
8. Recurring costs (daily/monthly/yearly).
9. Staff pay and attendance-derived labour cost totals.
10. Gas/LPG purchase and consumption events.
11. Cash shift and daily cash-close expected/count variance.
12. Detailed split-payment rows and refund-method allocations where only aggregate summaries are insufficient.

LocalBoost must not query Paanagam's database directly or scrape internal app tables. These records require additional privacy-safe, versioned GET endpoints from the POS integration API.

## 5. Required future POS export contract

Ask the POS integration API to add:

- `GET /recipes` — recipe/menu mapping, recipe version, ingredient quantities, units, yield, effective date.
- `GET /production/batches` — batch date, recipe version, input/output quantities, yield and cost totals.
- `GET /purchases/batches` — ingredient, received date, received quantity, remaining quantity, unit, landed unit cost, supplier reference token.
- `GET /inventory/movements` — movement type, item ID, location, quantity, unit, timestamp, source reference and cost basis.
- `GET /inventory/transfers` — store-to-kitchen movement and source FIFO allocations.
- `GET /wastage/summary` — daily item/ingredient quantity, reason category and FIFO value; no staff identity.
- `GET /expenses/summary` — daily expense category and accrued amount; no payee bank details.
- `GET /labour/cost-summary` — daily aggregated labour cost and hours; no employee names, IDs or individual pay.
- `GET /utilities/gas-summary` — daily/period LPG cost and estimated consumption.
- `GET /cash/close-summary` — business date, expected cash/UPI, counted cash/UPI and variances; no cashier names.
- Extend `/payments/summary` with split method amounts and refund method totals.

Every endpoint must include:
- business_id, branch_id, API version, generated_at, data_updated_at
- currency and timezone
- date range and coverage
- record count and pagination cursor where applicable
- source methodology and missing-data notes
- stable source record IDs and source update timestamps
- tenant-bound bearer key and rate limiting

Only expose aggregate or operational cost data needed for analysis. Do not expose customer PII, payment references, employee names, PINs or credentials.

## 6. LocalBoost financial implementation rules

- FIFO is the only permitted ingredient costing method.
- A missing or depleted FIFO lot must create an explicit stock-cost shortfall; never silently substitute an average cost.
- Store-to-kitchen transfers preserve the original lot and cost basis and do not create purchases or expenses.
- Purchases create FIFO layers; they are not COGS until consumed.
- POS item sales create theoretical recipe consumption only when a valid recipe version is available.
- Actual COGS must be derived from stock movements and lot allocations, not inferred from purchases.
- Wastage is tracked separately and must not be double-counted in COGS.
- Tax is separated from net revenue according to source methodology.
- Cash/UPI collections are reconciled separately from recognized sales.
- Labour and recurring expenses are accrued according to their coverage period, not simply the payment date.
- Daily financial snapshots must show freshness, coverage and reconciliation status.
- Missing data is UNKNOWN/INCOMPLETE, never zero.
- Owner approval is required for price changes or any external operational action.

## 7. Release gates

1. Apply the LocalBoost migration on a non-production validation database.
2. Run Prisma generation, TypeScript build, unit tests, API checks and tenant-security checks.
3. Verify the Paanagam integration key and live endpoint responses.
4. Confirm business ID, API version, freshness and date coverage.
5. Reconcile imported daily sales, item sales and payments against the POS for the same dates.
6. Verify inventory snapshot semantics and split payment behaviour.
7. Keep recipe/FIFO/expenses/P&L modules in an incomplete state until the missing POS export endpoints exist and pass reconciliation.
8. Deploy only after explicit production approval and passing regression tests.

## 8. Explicit non-goals

Do not copy Paanagam POS screens, billing workflows, staff management, customer ordering or operational write APIs into LocalBoost. LocalBoost consumes verified information and produces intelligence; Paanagam POS remains operational system of record.
