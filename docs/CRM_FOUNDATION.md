# LocalBoost CRM Foundation

## Scope
This additive foundation introduces business-scoped customer profiles, consent history, and an auditable customer event stream. It does not import historical POS identities, send marketing messages, issue rewards, or change existing POS behaviour.

## Data model
- `Customer`: one business-scoped profile; optional normalized E.164 phone and lower-case email; status and first/last seen timestamps.
- `CustomerConsent`: append-only channel/purpose consent decisions with capture source and evidence. A later revocation is a new row; never overwrite history.
- `CustomerEvent`: business-scoped event ledger with optional customer association and source/external ID idempotency key.

## Safety requirements
1. Every API query must first resolve the authenticated user's owned business using the existing `findOwnedBusiness` guard.
2. Never infer marketing consent from a purchase, QR scan, referral, or service message.
3. Marketing delivery requires an explicit current consent for the requested channel and purpose.
4. Do not collect birthday, gender, precise location, or other unnecessary profile data in the CRM foundation.
5. Normalize phone numbers to E.164 and emails to trimmed lower-case before lookup; enforce uniqueness per business.
6. Customer events are append-only. Corrections use compensating events, not silent edits.
7. External event ingestion must be idempotent using `businessId + source + externalId`.
8. Deletion/export workflows must be implemented before production customer imports. Business deletion cascades through CRM records.
9. No customer identity is imported from Paanagam POS until a separately approved, consent-aware integration contract exists.

## Migration
Migration `20261111100000_crm_foundation` is additive. Apply only after Prisma validation, generated-client build, tests, tenant-guard checks, and staging migration verification. Do not run against production as part of this feature branch.

## Next implementation steps
- Add authenticated customer create/list/detail/update routes.
- Add explicit consent grant/revoke endpoints.
- Add idempotent customer-event ingestion.
- Add customer profile and consent UI.
- Add authenticated customer JSON export and confirmed permanent erasure.\n- Add a business-level 12–84 month retention setting, preview, and owner-confirmed manual expiry purge. Automatic deletion remains disabled.
- Add tests for cross-tenant isolation, duplicate identities, consent history, and idempotency.
