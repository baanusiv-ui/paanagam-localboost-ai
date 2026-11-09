# LocalBoost Windows desktop client and offline sync roadmap

## Product direction

LocalBoost launches as a cloud-first, multi-tenant application. The browser dashboard and future Windows desktop client use the same Fastify API and the same Neon PostgreSQL source of truth. The desktop client must never connect directly to PostgreSQL or bypass API authorization.

## Cloud foundation

- Dashboard: existing static web application on Render.
- API: Fastify + TypeScript on Render.
- Identity: Neon Auth (Managed Better Auth); the API verifies short-lived JWTs against the branch JWKS.
- Data: Neon PostgreSQL, tenant-scoped by the authenticated LocalBoost owner and business.
- POS boundary: Paanagam POS remains a separate system of record. Any future LocalBoost POS connection is read-only, tenant-scoped, permissioned and audited.

## Windows client target

Preferred implementation direction: Tauri 2 with the Windows WebView2 runtime and a local SQLite database. Confirm packaging and encryption choices with a Windows pilot before committing to a production installer.

The desktop app will:
- Reuse the cloud dashboard experience where practical.
- Authenticate through Neon Auth using a system-browser flow and a secure return/deep link.
- Keep refresh/session credentials in Windows-protected credential storage, never in plaintext files or SQLite.
- Store only the minimum approved offline business data in an encrypted local database.
- Use the same versioned API contracts as the browser client.
- Show clear Online, Offline, Syncing, Pending and Sync failed states.

## Offline sync design

Use an outbox/inbox pattern.

1. A user action creates a local record with a client-generated UUID, tenant/business ID, operation type, payload, local timestamp and idempotency key.
2. The operation is committed locally before the UI reports it as saved.
3. When connectivity returns, the client sends queued operations through authenticated API endpoints in bounded batches.
4. The API validates the user, tenant, business permissions, schema version and idempotency key before applying an operation.
5. The API returns accepted/rejected operation IDs and a server sync cursor.
6. The client pulls server changes after its last cursor and reconciles local records.
7. Failed operations remain visible and retry with backoff; they are never silently discarded.

## Conflict policy

- Use server versions and updatedAt/ETag-style version checks.
- Idempotent retries must not create duplicate records.
- Never use blind last-write-wins for conflicting owner edits.
- Non-conflicting changes may merge automatically.
- Conflicting edits must show both versions and require an authorised user to choose.
- Every accepted/rejected sync operation must be traceable in activity history.

## Offline scope for the first Windows pilot

Start with read-only cached workspace data and draftable internal records. Add offline writes only for modules with explicit conflict and retry tests. Do not permit offline execution of external or irreversible actions.

Never queue or perform offline:
- Google Business Profile changes, review replies or publishing.
- Campaign scheduling or external messages.
- POS write-back, price changes or inventory changes.
- Authentication, role changes, invitations or credential management.
- Any action requiring live third-party confirmation.

## API work required before desktop implementation

- Versioned sync contract and schema version negotiation.
- Tenant-scoped push/pull endpoints with strict per-operation authorization.
- Idempotency-key storage and duplicate request tests.
- Cursor-based delta pull with tombstones for deletions.
- Record versioning and explicit conflict responses.
- Batch size limits, rate limits, audit events and retry guidance.
- Data export, local cache reset and secure sign-out/wipe behavior.

## Delivery gates

1. Cloud identity migration: Neon Auth integration, email verification and API tenant mapping.
2. Cloud acceptance: signup, verification, login, session renewal, sign-out, owner mapping and cross-tenant denial tests.
3. Sync contract: API design, versioning, idempotency, cursors and conflict tests.
4. Windows prototype: sign-in, secure local cache, offline read, reconnect and visible sync state.
5. Pilot: simulate network loss, app restart, duplicate retries, concurrent edits, expired sessions and account sign-out.
6. Production release: installer signing, auto-update policy, telemetry/privacy review, backup/recovery and support runbook.

## Deployment guard

Render API and dashboard auto-deploy remain disabled. Code changes and database migrations must pass CI and be reviewed before an explicitly approved manual deployment. Applying the Neon Auth identity migration is part of the next approved API deployment; it has not been applied to the live database by this roadmap document.
