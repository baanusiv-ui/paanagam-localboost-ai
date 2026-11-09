import { Prisma, type PrismaClient } from "@prisma/client";

export type BusinessActivityInput = {
  businessId: string;
  actorUserId: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export async function recordBusinessActivity(
  db: PrismaClient,
  input: BusinessActivityInput
) {
  return db.activityEvent.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}
