import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { findOwnedBusiness } from "./access.js";

test("findOwnedBusiness always scopes lookup by business ID and owner ID", async () => {
  let received: unknown;
  const expected = { id: "business-1", ownerId: "user-1" };
  const fakeDb = {
    business: {
      findFirst: async (args: unknown) => {
        received = args;
        return expected;
      }
    }
  } as unknown as Pick<PrismaClient, "business">;

  const result = await findOwnedBusiness(fakeDb, "user-1", "business-1");

  assert.equal(result, expected);
  assert.deepEqual(received, {
    where: { id: "business-1", ownerId: "user-1" }
  });
});

test("findOwnedBusiness returns null when the business is not owned by the user", async () => {
  const fakeDb = {
    business: {
      findFirst: async () => null
    }
  } as unknown as Pick<PrismaClient, "business">;

  const result = await findOwnedBusiness(fakeDb, "another-user", "business-1");

  assert.equal(result, null);
});
