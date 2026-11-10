CREATE TABLE "CreativeAsset" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "altText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreativeAsset_businessId_createdAt_idx" ON "CreativeAsset"("businessId", "createdAt");
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
