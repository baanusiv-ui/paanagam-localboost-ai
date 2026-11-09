CREATE TYPE "GrowthActionStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

CREATE TABLE "GrowthAction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "GrowthActionStatus" NOT NULL DEFAULT 'SUGGESTED',
  "ownerNote" TEXT,
  "evidence" JSONB NOT NULL,
  "priority" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthAction_businessId_actionId_key" ON "GrowthAction"("businessId", "actionId");
CREATE INDEX "GrowthAction_businessId_status_updatedAt_idx" ON "GrowthAction"("businessId", "status", "updatedAt");
ALTER TABLE "GrowthAction" ADD CONSTRAINT "GrowthAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
