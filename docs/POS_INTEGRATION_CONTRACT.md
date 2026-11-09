# Paanagam POS integration contract

## Purpose
LocalBoost is a standalone growth-intelligence product. The Paanagam POS remains the system of record for transactions, menu items, recipes, inventory, payments and loyalty balances. LocalBoost consumes only minimum business summaries needed for analysis. It must never become a second POS or write operational records back into the POS.

The integration is optional. LocalBoost must remain useful with owner-entered data and approved CSV imports when no POS connection exists.

## Boundary and trust model
- Separate repository, deployment, database, authentication and release lifecycle.
- POS credentials and database credentials must never be stored in LocalBoost.
- Prefer a versioned, read-only POS API or signed export feed. Do not read the POS database directly.
- The owner explicitly enables the connection and chooses which data categories and date range may be shared.
- Use HTTPS and a revocable, scoped server-to-server credential with rotation.
- Every imported record stores source system, source record ID, source timestamp, import timestamp and connection ID.
- Do not infer missing values or silently convert currencies, units, tax treatment or time zones.
- Disconnecting stops future imports. Provide a documented deletion/export path for imported data.
- No customer-level personal data is required for the first release. Use daily aggregates and anonymous cohort counts.

## First-release data contract

All timestamps use ISO 8601 with timezone. Currency uses integer minor units plus an explicit ISO 4217 currency code (INR). Quantities carry an explicit unit.

### Daily sales summary
daily_sales fields:
- business_external_id: stable POS business identifier
- business_date: local business date, YYYY-MM-DD
- currency: INR
- gross_sales_minor: integer
- discounts_minor: integer
- refunds_minor: integer
- net_sales_minor: integer
- order_count: integer
- item_quantity_total: decimal
- payment_totals: optional map of payment method to integer minor units

### Menu item sales
menu_item_sales fields:
- business_date
- menu_item_external_id
- menu_item_name_snapshot
- quantity_sold: decimal
- gross_sales_minor: integer
- discount_minor: integer
- net_sales_minor: integer
- void_quantity: decimal, if supplied

### Menu and recipe cost snapshot (optional, owner-approved)
menu_cost_snapshot fields:
- menu_item_external_id
- menu_item_name
- selling_price_minor
- estimated_food_cost_minor
- costing_method: explicit value supplied by POS
- effective_at
- currency
- cost_version

LocalBoost must not recompute recipe costs from incomplete ingredient data. It may calculate gross contribution only when both selling price and cost are present, current and expressed in the same currency and tax basis.

### Loyalty aggregates (later phase)
- business_date
- new_members_count
- active_members_count
- rewards_issued_count
- rewards_redeemed_count
- repeat_visit_cohort_counts

No names, phone numbers, email addresses, OTPs, payment identifiers or raw customer profiles in this feed.

## Sync protocol
1. POS exposes a read-only endpoint or produces a signed export for an approved date range.
2. LocalBoost validates schema version, business identity, currency, units and date boundaries.
3. Import is idempotent using connection ID, source record ID and source update timestamp.
4. Store source provenance with normalized aggregate rows and controlled retention.
5. Record sync cursor, result counts, rejected rows and error details. A failed batch must be retryable without double-counting.
6. Show the owner last successful sync, covered date range, imported categories and rejected records.

Suggested API shape (proposal only; not implemented):
- GET /v1/integrations/pos/capabilities
- POST /v1/integrations/pos/connections
- POST /v1/integrations/pos/sync
- GET /v1/integrations/pos/sync-runs
- DELETE /v1/integrations/pos/connections/:connectionId

The POS side must confirm and implement the versioned read-only export API before LocalBoost builds against it.

## Analytics LocalBoost may derive
- Sales trend, average order value and orders per day.
- Item mix, top/bottom sellers and daypart performance when timestamps are available.
- Menu contribution ranking only when trustworthy item cost snapshots exist.
- Discount/refund/void rates when source fields are provided.
- Repeat-customer and loyalty performance only from privacy-safe aggregate cohorts.

Each insight must show its date range, source, freshness and calculation definition. Mark low sample sizes. Never present correlation as causation or forecast as fact.

## Explicitly out of scope
- Creating or editing POS orders.
- Changing prices, recipes, stock, suppliers or payments.
- Issuing or redeeming loyalty rewards.
- Accessing card, UPI, bank or payment credentials.
- Importing customer contact lists or individual purchase histories in phase one.
- Treating demo data as business performance.

## Acceptance criteria
- LocalBoost runs with no POS connection.
- A disconnected or expired connection never blocks the dashboard.
- Duplicate syncs do not duplicate sales.
- Imported totals reconcile to source totals for the same date range.
- Owner can see source, freshness, scope and sync status.
- Revocation prevents subsequent imports.
- No write path exists from LocalBoost into POS operations.
