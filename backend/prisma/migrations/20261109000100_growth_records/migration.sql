CREATE TYPE "GrowthRecordType" AS ENUM ('MENU_ITEM', 'DAILY_SALES', 'RETENTION_SNAPSHOT', 'CAMPAIGN_DRAFT');

CREATE TABLE "GrowthRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recordType" "GrowthRecordType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OWNER_ENTERED',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthRecord_businessId_recordType_externalId_key"
ON "GrowthRecord"("businessId", "recordType", "externalId");

CREATE INDEX "GrowthRecord_businessId_recordType_recordedAt_idx"
ON "GrowthRecord"("businessId", "recordType", "recordedAt");

ALTER TABLE "GrowthRecord"
ADD CONSTRAINT "GrowthRecord_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
