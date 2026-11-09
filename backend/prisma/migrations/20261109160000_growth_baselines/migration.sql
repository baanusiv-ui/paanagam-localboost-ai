CREATE TABLE "GrowthBaseline" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "metric" "GrowthGoalMetric" NOT NULL,
  "baselineValue" DOUBLE PRECISION NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "ownerNote" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrowthBaseline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GrowthBaseline_businessId_metric_periodStart_periodEnd_idx"
ON "GrowthBaseline"("businessId", "metric", "periodStart", "periodEnd");

CREATE INDEX "GrowthBaseline_businessId_archivedAt_createdAt_idx"
ON "GrowthBaseline"("businessId", "archivedAt", "createdAt");

ALTER TABLE "GrowthBaseline" ADD CONSTRAINT "GrowthBaseline_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
