CREATE TYPE "GrowthGoalMetric" AS ENUM ('NET_SALES', 'REVIEW_COUNT', 'AVERAGE_RATING');

CREATE TABLE "GrowthGoal" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "metric" "GrowthGoalMetric" NOT NULL,
  "targetValue" DOUBLE PRECISION NOT NULL,
  "monthStart" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthGoal_businessId_metric_monthStart_key" ON "GrowthGoal"("businessId", "metric", "monthStart");
CREATE INDEX "GrowthGoal_businessId_monthStart_archivedAt_idx" ON "GrowthGoal"("businessId", "monthStart", "archivedAt");
ALTER TABLE "GrowthGoal" ADD CONSTRAINT "GrowthGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
