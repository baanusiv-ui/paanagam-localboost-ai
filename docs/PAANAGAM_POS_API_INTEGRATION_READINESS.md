# Paanagam POS API Integration Readiness

Status: **Waiting for the Paanagam POS read-only API implementation and its real contract.**

This document records the LocalBoost-side preparation. It is not evidence that a POS connection exists. No POS endpoint, credential, live sales record, or successful sync is assumed.

## System boundary

- Paanagam POS remains the system of record for orders, payments, menu, recipes, and stock.
- LocalBoost AI is a separate growth-intelligence workspace. It consumes a limited, read-only export from the POS.
- Do not connect to the POS database directly, modify POS workflows, or write back to POS.
- Use the authenticated LocalBoost business workspace as the tenant boundary. Never trust a business ID supplied by an untrusted POS payload to select another tenant.
- Do not import customer names, phone numbers, addresses, payment identifiers, or other personal data. Aggregate sales and anonymised item-level metrics are sufficient.
- Do not deploy, expose secrets, or enable scheduled production sync until the owner approves the tested integration.

## Existing LocalBoost data model

The current backend stores imported/entered operational data in `GrowthRecord`, scoped by `businessId`, with a unique key on `businessId + recordType + externalId`.

Supported record types include:
- `DAILY_SALES`
- `MENU_ITEM`

The current performance calculations recognise daily net sales from `payload.net` or `payload.netSales`, and order count from `payload.orders`. Records with source `DEMO` are excluded from growth reporting. Missing evidence must remain missing; never convert it to zero.

## Proposed mapping — confirm against the actual POS API

| POS export concept | LocalBoost record | Mapping rule |
|---|---|---|
| Business/branch identity | Tenant mapping configuration | Bind to the already-selected LocalBoost business after explicit owner verification. Reject unknown branches. |
| Business date | `recordedAt` and payload date | Preserve the POS business date and timezone; do not substitute server import time. |
| Daily net sales | `DAILY_SALES.payload.net` | Map only after the POS confirms its exact net-sales definition and treatment of tax, discounts, refunds and cancellations. |
| Completed order count | `DAILY_SALES.payload.orders` | Count only the POS-defined completed/paid orders; do not infer from raw order rows. |
| Menu item sales | `MENU_ITEM` | Preserve stable POS item ID, item name, quantity, gross/net amount and business date only where the API provides them. |
| Stock summary | Not currently part of the growth-record mapping | Defer until the POS API contract and a clear LocalBoost use case are confirmed. |

The proposed mapping is not final until the actual endpoint documentation and sample responses are reviewed.

## Required API contract before implementation

Obtain from the POS developer:
1. Production/staging base URL and API version.
2. Authentication scheme and credential provisioning/rotation instructions. Send secrets through a secure secret manager, never in source code or chat.
3. Endpoint list, HTTP methods, query parameters, pagination and rate limits.
4. Exact response schemas and representative JSON for daily sales and menu item sales.
5. Business/branch identifiers and timezone/business-date rules.
6. Definitions for gross sales, net sales, taxes, discounts, refunds, voids, cancellations, complimentary items and order status.
7. Stable record IDs, update semantics, deletion/void notifications, and a reliable updated-since cursor if incremental sync is supported.
8. Error response format, retry guidance and API availability expectations.

## Import and reconciliation requirements

- Use an idempotency key derived from the POS source record identity and record type; never use the current timestamp as the identity.
- Upsert only within the verified LocalBoost business mapping.
- Preserve the POS source label, source record ID, business date, import timestamp and API version as provenance.
- Support pagination and bounded date windows; persist a sync cursor only after a complete successful page/window.
- Retry transient failures with bounded backoff. Do not advance the cursor after partial failure.
- Treat changed, refunded, voided or cancelled orders according to the POS's documented update model. Do not double-count reversals.
- Reconcile imported daily net sales and completed order counts against the POS daily closing report for the same business date and branch.
- Surface discrepancies and incomplete coverage; never silently coerce missing values to zero.
- Keep a sync run log with counts, date range, outcome and safe error summaries. Never log credentials or personal data.

## Security and privacy checks

- HTTPS only.
- Dedicated read-only integration credentials, scoped to the intended business/branch and endpoints.
- Secrets stored only in deployment secret configuration; support rotation and revocation.
- Rate limits, request timeouts, input validation and strict response-size limits.
- No customer-level PII or payment secrets in LocalBoost.
- Tenant-isolation tests must prove one business cannot read another business's imported records.
- Keep the integration pull-only. No POS writes, refunds, order edits, inventory adjustments or menu changes.

## Acceptance checklist

- [ ] Actual API base URL and version received.
- [ ] Authentication tested without exposing secrets.
- [ ] API schemas and sample responses reviewed.
- [ ] Branch-to-LocalBoost business mapping explicitly confirmed.
- [ ] Business date/timezone behaviour confirmed.
- [ ] Gross/net/tax/discount/refund/cancellation definitions confirmed.
- [ ] Pagination and incremental update behaviour tested.
- [ ] Duplicate import and retry tests pass.
- [ ] Partial failure does not advance the sync cursor.
- [ ] Daily totals reconcile with POS closing reports.
- [ ] PII exclusion and tenant isolation tests pass.
- [ ] Owner approves staging test and then production activation separately.

## Current decision

**Do not implement a guessed connector or enable live sync yet.** Continue using existing owner-entered records where needed. Once the POS API contract is received, implement the adapter against the real schema, add tests, run a staging reconciliation, and request approval before production activation.
