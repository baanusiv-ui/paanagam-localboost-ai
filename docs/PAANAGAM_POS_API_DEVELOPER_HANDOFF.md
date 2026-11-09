# Paanagam POS API — Developer Handoff Checklist

Purpose: provide the verified read-only API contract needed for LocalBoost AI to import Paanagam business data. This is a request for implementation details, not a request to expose database access.

## 1. API overview

Please complete these fields:

- Environment available: staging / production
- Base URL:
- API version:
- API documentation URL:
- API owner / technical contact:
- Supported authentication method:
- Credential provisioning and rotation procedure (do not paste credentials into this document):
- Rate limit and request timeout:
- Expected availability / maintenance window:

## 2. Required read-only endpoints

Please provide the actual implemented paths and methods. Do not create placeholder paths just to fill this table.

| Data | Actual method and path | Available? | Notes |
|---|---|---|---|
| Business and branch metadata |  |  |  |
| Daily sales totals by business date |  |  |  |
| Menu-item sales by business date |  |  |  |
| Order status / completed order summary |  |  |  |
| Payment summary (aggregated only) |  |  |  |
| Sync status / updated-since cursor |  |  |  |

LocalBoost's first import scope is daily sales and menu-item sales. Other endpoints are optional and will be considered only after the first two are validated.

## 3. Sanitised sample responses

Attach representative JSON responses for:
- One completed business day with daily totals.
- The same date with at least two menu items.
- A date containing a refund, void, cancellation, discount or tax adjustment, if supported.
- An empty date with no sales.
- A paginated response, if pagination is used.
- One authentication failure and one validation/rate-limit error response.

Remove customer names, phone numbers, addresses, payment references, tokens, secrets and other personal data. Preserve field names, data types, nullability and realistic numeric relationships.

## 4. Business and accounting rules

Please document the exact POS rules:

- Business ID and branch ID formats; whether IDs are stable.
- Business timezone and business-day cutoff.
- Meaning of gross sales and net sales.
- Whether tax is included in gross/net values.
- How discounts, complimentary items, refunds, voids and cancellations affect totals.
- Which order statuses count as completed orders.
- Whether historical records can change after EOD.
- How changed or reversed records are exposed to API consumers.

## 5. Incremental sync and reliability

- Pagination style and maximum page size:
- Updated-since / cursor support:
- Stable unique ID for each exported record:
- How deletions, voids and corrections are represented:
- Retryable status codes and retry guidance:
- Whether the same request can safely be repeated:
- Maximum permitted date range per request:

## 6. Security confirmation

Please confirm:

- HTTPS is mandatory.
- Credentials are dedicated to this integration and read-only.
- Credentials can be restricted to the intended business/branch and endpoints.
- Credentials can be revoked and rotated.
- The API does not expose customer-level personal data or payment secrets.
- No API method can create, edit, refund or delete POS transactions, menu items, recipes or stock.

Never send credentials in GitHub issues, source code, screenshots, email threads or ChatGPT. Provision them through the approved secret manager after the contract is reviewed.

## 7. LocalBoost validation before activation

The integration will not be enabled for production until:

- The real API contract and sanitised examples are reviewed.
- The business/branch mapping is explicitly confirmed.
- Daily totals and completed-order counts reconcile to the POS closing report for matching dates.
- Menu-item quantities and values reconcile to the POS item-sales report.
- Duplicate imports, retries, pagination and partial failures are tested.
- Tenant isolation and personal-data exclusion tests pass.
- The owner separately approves staging validation and production activation.

## 8. Developer response

Please return this completed checklist together with the API documentation and sanitised JSON examples. If a requested endpoint or capability does not exist, mark it **Not available** rather than estimating or inventing it.
