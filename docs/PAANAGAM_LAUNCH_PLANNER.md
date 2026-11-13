# Paanagam launch planner

The dashboard's Launch planner view tracks the Paanagam pilot opening plan for Valayapatty, Namakkal.

## Confirmed timeline

- Foundation: 13–20 November 2026
- Infrastructure: 21–30 November 2026
- Operational preparation: 1–7 December 2026
- Marketing: 8–14 December 2026
- Final readiness: 15–20 December 2026
- Soft launch: 21–24 December 2026
- Final preparation: 25–26 December 2026
- Grand opening: Sunday, 27 December 2026

## Persistence and data model

The planner uses the existing authenticated, business-scoped GrowthRecord API. It stores one owner-entered `CAMPAIGN_DRAFT` record with external ID `paanagam-launch-plan-2026-12-27` and payload kind `PAANAGAM_LAUNCH_PLAN`. This avoids a new Prisma migration and keeps the plan in the selected business workspace. The API's existing 64 KB payload limit applies.

Tasks carry a stable ID, phase, title, owner, due date, priority, status and progress notes. Soft-launch observations are owner-entered notes with date and observation type. Checklist completion is a calculated ratio of completed tasks to saved tasks; it is not a business-performance metric or opening-readiness certification.

## Safety and scope

- All records are owner-entered and tenant-scoped by the existing API.
- The planner does not create sales, food-cost, review, inventory or customer metrics.
- Soft-launch observations are not populated until the owner records actual findings.
- POS is separate and remains the system of record. POS integration is not changed by this feature.
- Marketing content, replies, messages and profile changes remain subject to the existing approval workflows.
- No publishing, messaging, profile edits, POS writes or other external actions are triggered by the planner.

## Use

Sign in, select the Paanagam business workspace, and open **Launch planner** in the left navigation. Save each task after changing its owner, date, priority, status or notes. Use **Add a launch task** for additional work. During the soft launch, add actual observations in the Soft-launch observations section.
