# CRM source import contract — implementation plan

Status: design contract for the CRM source-import feature branch. No production sync is enabled by this document.

## Goals and boundaries

LocalBoost CRM may ingest Paanagam POS customer profiles and purchase events, Google Business Profile reviews, and eligible Facebook Page / linked Instagram comments. All source integrations are read-only. Paanagam POS remains the system of record for customer and transaction records. Google Business Profile and Meta remain the systems of record for reviews and social interactions.

This is a separately enabled CRM data-sharing scope. It does not silently expand the existing POS aggregate-sales permission. An owner must explicitly enable customer-level import and choose the permitted categories. Disconnecting a source stops future imports.

## POS customer export API — required upstream work

The currently documented LocalBoost POS integration only consumes menu and daily aggregate sales. It does not provide customer profiles or individual purchase history. Do not infer customer identity from daily sales aggregates.

Proposed versioned, read-only endpoints on the POS integration API:

- GET /customers?updated_since=<ISO-8601>&limit=200&cursor=<opaque>
- GET /customers/{customer_id}
- GET /customers/{customer_id}/purchases?updated_since=<ISO-8601>&limit=200&cursor=<opaque>
- GET /integration/capabilities (advertise customer_export and purchase_events separately)

Every response must include source: "paanagam-pos", api_version: "v1", business_id, data, next_cursor and data_updated_at. Cursors are opaque, stable for pagination and must not contain credentials.

Customer fields (minimum necessary):
- customer_id: stable immutable POS ID
- display_name: optional
- phone_e164: optional, normalized E.164
- email: optional, normalized lowercase
- created_at, updated_at: ISO 8601 timestamps
- status: optional source-defined state

At least one contact identifier (phone_e164 or email) is required before a record can create or update a LocalBoost CRM customer. Do not import OTPs, password/PIN hashes, payment instruments, addresses, sensitive notes or staff-only data.

Purchase event fields:
- purchase_id: stable immutable POS ID
- customer_id: stable POS customer ID
- occurred_at: ISO 8601 timestamp with timezone
- currency: INR
- total_minor, discount_minor, refund_minor: integer minor units
- status: explicit source-defined status
- line_items: optional array of menu_item_id, item_name_snapshot, quantity and unit_price_minor

Never import payment credentials, UPI references, full receipts or unrelated inventory data. Only completed, non-void purchases are eligible for positive purchase events; refunds/voids must be represented explicitly and not silently counted as purchases.

## LocalBoost import semantics

- Keep tenant/business scoping on every lookup and write.
- Store source IDs as namespaced external IDs; retries must be idempotent.
- Preserve source timestamps separately from import timestamps.
- Use upsert by (businessId, source, externalId); do not merge identities across businesses.
- Match customer profiles only by exact normalized phone or email. If phone and email resolve to different existing CRM profiles, quarantine the row for owner review; never auto-merge.
- A name-only POS profile may be counted as an unlinked source record but must not create a CRM contact.
- Import purchase events only after the POS customer has been safely mapped to a CRM customer. Unmatched purchases remain unlinked source events or are skipped with an auditable reason; do not guess identity.
- POS purchase activity does not grant WhatsApp, SMS or email marketing consent. Preserve service and marketing consent independently.
- Customer deletion/erasure in LocalBoost must not delete the POS source record. Source retention and CRM erasure behavior must be documented to the owner.
- Provide preview counts, rejected-row counts, last cursor, last successful sync and an explicit "Sync now" action before enabling scheduled sync.

## Google Business Profile reviews

Reuse the existing Reviews workspace as the single source of truth: its existing Google OAuth connection, selected account/location, importer, saved `GrowthRecord` rows (`REVIEW_ITEM`) and review-theme analysis. CRM reads those same saved review records through a tenant-scoped read-only endpoint. Do not create a second Google connection, duplicate review store, or a second review import job.

- Store review source ID, location resource, rating, review text, create/update timestamps, and owner reply state only where permitted by the API and existing product policy.
- Keep reviewer display name/profile image out of CRM identity matching and avoid storing reviewer profile identifiers unless separately justified and approved.
- Show review evidence and aggregate customer-voice insights inside CRM by reading the same `REVIEW_ITEM` records used by Reviews. Do not copy each review into `CustomerEvent` or create a second event stream.
- Keep reviews unlinked from customer profiles by default. Attach only if an explicit, reliable identity key is supplied by an authorized source; a Google display name or review text is not a reliable match.
- Review import is read-only. No replies are created or edited by this importer.
- Use stable namespaced review IDs and idempotent upserts.

## Meta comments

Reuse LocalBoost's existing Meta OAuth / selected Page and linked Instagram account. Do not add a second OAuth connection or use a different Page/account.

- Read only eligible Page and Instagram comments for the selected Paanagam assets, subject to granted permissions and platform policy.
- Store platform, Page/account ID, media/post ID, comment ID, text, timestamp, parent ID and moderation/hidden state when available and permitted.
- Avoid importing private messages or inbox conversations in this phase.
- Do not treat a social username/display name as a POS identity. Link only through a reliable explicit identifier; otherwise retain the interaction as an unlinked CRM source event.
- No comment replies, DMs, moderation changes, post publishing or outbound messaging.

## CRM event taxonomy

Use source-qualified events and stable external IDs:
- POS: PURCHASE_RECORDED / PURCHASE_REFUNDED (namespaced by POS purchase ID)
- Google: REVIEW_SUBMITTED / REVIEW_UPDATED (namespaced by Google review ID)
- Meta: SOCIAL_COMMENT_RECEIVED / SOCIAL_COMMENT_UPDATED (namespaced by platform + comment ID)

If the current CRM event enum does not support an event, add a migration rather than overloading unrelated event types. Store only the minimum metadata needed for timeline display and analysis.

## Sync safety and observability

- Each source has independent connection state, permissions, sync cursor and last successful sync.
- Use bounded page sizes, request timeouts, retry with backoff and per-source rate limits.
- A partial failure must not advance a cursor past unprocessed records.
- Log counts and source IDs, never access tokens, API keys, full contact details or raw payloads containing personal data.
- Show the owner source, selected account/location, data categories, date range, last sync, imported count, skipped count and failure reason.
- Add dry-run/preview mode before first full import and retain a reversible import audit trail.
- Scheduled sync is opt-in and must be disabled until owner confirms the preview.

## Delivery order

1. Confirm POS integration API implementation location and add the read-only customer/purchase export there.
2. Add LocalBoost POS customer importer and mapping/preview UI.
3. Expose the existing Reviews workspace evidence and theme analysis to CRM through a read-only, tenant-scoped view (no second importer or duplicate events).
4. Extend existing Meta Page/Instagram integration for public comment ingestion only.
5. Add unified source status, sync audit and CRM timeline filters.
6. Run tests and deploy only after review; staging remains untouched unless explicitly requested.

## Explicit exclusions

No POS writes, no automatic customer merges, no marketing consent inference, no Google review replies, no Meta inbox/DM import, no comment replies, no posting, no automatic campaigns, no import of passwords/OTPs/payment credentials, and no production or staging configuration changes as part of this contract.
