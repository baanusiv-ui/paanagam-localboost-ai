import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { recordBusinessActivity } from "./record.js";

test("recordBusinessActivity writes the event with a null entity ID by default", async () => {
  let received: unknown;
  const created = { id: "event-1" };
  const fakeDb = {
    activityEvent: {
      create: async (args: unknown) => {
        received = args;
        return created;
      }
    }
  } as unknown as PrismaClient;

  const result = await recordBusinessActivity(fakeDb, {
    businessId: "business-1",
    actorUserId: "user-1",
    eventType: "EVIDENCE_CREATED",
    entityType: "EVIDENCE",
    summary: "Evidence added"
  });

  assert.equal(result, created);
  assert.deepEqual(received, {
    data: {
      businessId: "business-1",
      actorUserId: "user-1",
      eventType: "EVIDENCE_CREATED",
      entityType: "EVIDENCE",
      entityId: null,
      summary: "Evidence added",
      metadata: undefined
    }
  });
});

test("recordBusinessActivity preserves supplied metadata and entity ID", async () => {
  let received: unknown;
  const fakeDb = {
    activityEvent: {
      create: async (args: unknown) => {
        received = args;
        return { id: "event-2" };
      }
    }
  } as unknown as PrismaClient;

  await recordBusinessActivity(fakeDb, {
    businessId: "business-1",
    actorUserId: "user-1",
    eventType: "GROWTH_RECORD_CREATED",
    entityType: "DAILY_SALES",
    entityId: "record-1",
    summary: "Daily sales record added",
    metadata: { source: "OWNER_ENTERED", count: 1 }
  });

  assert.deepEqual(received, {
    data: {
      businessId: "business-1",
      actorUserId: "user-1",
      eventType: "GROWTH_RECORD_CREATED",
      entityType: "DAILY_SALES",
      entityId: "record-1",
      summary: "Daily sales record added",
      metadata: { source: "OWNER_ENTERED", count: 1 }
    }
  });
});
