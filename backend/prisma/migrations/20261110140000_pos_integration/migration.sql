CREATE TABLE "PosIntegrationConnection" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "apiKeyEncrypted" TEXT NOT NULL,
  "posBusinessId" TEXT NOT NULL,
  "posBusinessName" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "lastStatus" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosIntegrationConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosIntegrationConnection_businessId_key" ON "PosIntegrationConnection"("businessId");
ALTER TABLE "PosIntegrationConnection" ADD CONSTRAINT "PosIntegrationConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
