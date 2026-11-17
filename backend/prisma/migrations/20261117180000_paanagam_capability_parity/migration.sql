ALTER TYPE "GrowthRecordType" ADD VALUE IF NOT EXISTS 'MENU_ITEM_SALES';
ALTER TYPE "GrowthRecordType" ADD VALUE IF NOT EXISTS 'ORDER_SUMMARY';
ALTER TYPE "GrowthRecordType" ADD VALUE IF NOT EXISTS 'PAYMENT_SUMMARY';
ALTER TYPE "GrowthRecordType" ADD VALUE IF NOT EXISTS 'INVENTORY_SNAPSHOT';
ALTER TYPE "GrowthRecordType" ADD VALUE IF NOT EXISTS 'POS_SYNC_STATUS';

ALTER TABLE "PosIntegrationConnection"
  ADD COLUMN "lastSourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncVersion" TEXT,
  ADD COLUMN "lastSyncCounts" JSONB,
  ADD COLUMN "lastCoverage" JSONB,
  ADD COLUMN "lastDataStatus" TEXT;

CREATE INDEX "GrowthRecord_businessId_recordType_recordedAt_idx"
  ON "GrowthRecord"("businessId", "recordType", "recordedAt");
