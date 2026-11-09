# Paanagam Intelligence Engine — v1

## Purpose
Provide deterministic, explainable business intelligence from records the owner has entered into the standalone LocalBoost workspace. Paanagam is the first pilot. The engine does not modify Paanagam POS or the main Paanagam app.

## Current implementation
- Authenticated endpoint: `GET /v1/businesses/:businessId/intelligence`.
- Tenant isolation: the API verifies that the requested business belongs to the signed-in owner before reading records.
- Inputs: owner-entered menu items, daily sales summaries and privacy-safe retention snapshots. Demo-source records are excluded.
- Output: engine version, generation time, data status, record count and insight list.
- Every insight includes a source, evidence record IDs, date range where applicable, calculation basis, confidence, suggested action and `requiresOwnerApproval: true`.
- Dashboard growth records sync to the authenticated PostgreSQL API when a business workspace is selected. Local browser data remains a fallback.

## v1 calculations
1. **Sales baseline:** sum of recorded net sales, sum of orders and net sales divided by orders.
2. **Seven-record-window comparison:** compares the latest seven recorded dates with the preceding seven recorded dates only when there are at least fourteen records and the prior window has a positive total. It is a date-window comparison, not a causal claim or forecast.
3. **Menu volume leader:** sorts entered item quantities. It is explicitly not labelled POS-verified.
4. **Supplied unit contribution:** uses selling price minus supplied unit cost only when price, cost and quantity are present. It is not a complete profit margin and excludes costs not represented in the supplied cost.
5. **Latest reward redemption snapshot:** calculates redeemed divided by issued for the latest dated snapshot only. Active-member snapshots are never summed across dates.

## Data integrity rules
- Missing data is reported as missing; it is never silently converted into a real zero.
- Demo records do not enter owner intelligence.
- Sales and menu conclusions are labelled owner-entered until reconciled with an authorised POS export.
- No customer names, phone numbers, emails, payment identifiers or individual purchase histories are required.
- Every operational, pricing, purchasing or marketing action remains a recommendation. The API does not execute it.
- AI language models are not used for arithmetic. Future model-assisted explanations must consume the calculated report and must not alter source facts or numeric results.

## Next increments
- Versioned ingredient and recipe cost snapshots with effective dates.
- Reconciliation status and source freshness.
- Demand forecast only after sufficient complete historical data and validation.
- Optional read-only POS import after the POS team confirms and implements the documented contract.
- Owner-approved action lifecycle with immutable action scope and audit history.
- Replaceable AI explanation provider, disabled until credentials and usage limits are deliberately configured.


## Optional local AI explanation layer

The deterministic report remains the source of truth for arithmetic and evidence. An optional Ollama adapter on the owner's Windows PC can explain that report in Tamil, English or both. The adapter receives only report findings, calculations and evidence record IDs, validates the model's JSON response, and removes any evidence IDs not present in the report. It cannot change numeric results or execute actions. Configure `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in the ignored backend environment file; if the model is unavailable, the deterministic report remains available.
