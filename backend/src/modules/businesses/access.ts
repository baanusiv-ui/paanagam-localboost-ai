import type { PrismaClient } from "@prisma/client";

/**
 * Resolve a business only when it belongs to the authenticated user.
 * Keep this ownership predicate centralized so extracted route modules
 * cannot accidentally query a business by ID alone.
 */
export async function findOwnedBusiness(
  db: Pick<PrismaClient, "business">,
  userId: string,
  businessId: string
) {
  return db.business.findFirst({
    where: { id: businessId, ownerId: userId }
  });
}
