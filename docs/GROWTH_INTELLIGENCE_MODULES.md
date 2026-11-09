# Growth Intelligence modules

This delivery extends the existing business-scoped GrowthRecord store. It does not create parallel tables or bypass the existing owner-scoped API.

## Record types
- COMPETITOR: owner-recorded public observations, source URL, observation date, and optional rating/review-count/offer fields. These are not independently verified rankings.
- LOCAL_KEYWORD: owner-entered Tamil/English keyword ideas and intent. Search volume and ranking are not inferred.
- REVIEW_ITEM: owner-supplied review text, optional rating/date/source note, and a private reply draft. Do not enter customer names or contact details. Google import is not claimed.
- GOOGLE_CONTENT: exact Google Business Profile post draft, language, planned date, status and owner decision timestamp. Approval means approved for manual publishing only; no automatic publishing or scheduling is connected.

## Google Business Health
Uses the existing authenticated POST/GET /v1/businesses/:businessId/audits and GET /evidence endpoints. The score is checklist completeness, not Google ranking or traffic. Findings retain source and observation timestamps.

## Security and provenance
All writes use the existing authenticated growth-record endpoint, which checks business ownership and scopes reads, updates and deletes to the selected business. The database unique key remains (businessId, recordType, externalId). Records default to OWNER_ENTERED at the record layer; payload provenance distinguishes owner-confirmed data, public observations and other source labels. No Google API evidence is created by the browser. Only the trusted Google import service may create GOOGLE_API evidence.

## Publishing boundary
Google content approvals are stored as APPROVED_FOR_MANUAL_PUBLISH. This does not publish, schedule, reply to reviews or change a Google profile. Exact content must be re-approved if edited; the current interface creates a new draft rather than editing an approved one.
