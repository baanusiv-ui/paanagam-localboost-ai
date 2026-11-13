CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');
CREATE TYPE "CustomerConsentChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');
CREATE TYPE "CustomerConsentPurpose" AS ENUM ('SERVICE', 'MARKETING');
CREATE TYPE "CustomerEventType" AS ENUM ('PROFILE_CREATED', 'CONSENT_GRANTED', 'CONSENT_REVOKED', 'PURCHASE_RECORDED', 'REVIEW_SUBMITTED', 'REFERRAL_RECEIVED', 'REFERRAL_CONVERTED', 'REWARD_EARNED', 'REWARD_REDEEMED', 'PROFILE_UPDATED');

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT,
  "phoneE164" TEXT,
  "email" TEXT,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'OWNER_ENTERED',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerConsent" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" "CustomerConsentChannel" NOT NULL,
  "purpose" "CustomerConsentPurpose" NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "evidence" TEXT,
  CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT,
  "eventType" "CustomerEventType" NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_businessId_phoneE164_key" ON "Customer"("businessId", "phoneE164");
CREATE UNIQUE INDEX "Customer_businessId_email_key" ON "Customer"("businessId", "email");
CREATE INDEX "Customer_businessId_status_createdAt_idx" ON "Customer"("businessId", "status", "createdAt");
CREATE INDEX "Customer_businessId_lastSeenAt_idx" ON "Customer"("businessId", "lastSeenAt");
CREATE INDEX "CustomerConsent_customerId_channel_purpose_capturedAt_idx" ON "CustomerConsent"("customerId", "channel", "purpose", "capturedAt");
CREATE UNIQUE INDEX "CustomerEvent_businessId_source_externalId_key" ON "CustomerEvent"("businessId", "source", "externalId");
CREATE INDEX "CustomerEvent_businessId_eventType_occurredAt_idx" ON "CustomerEvent"("businessId", "eventType", "occurredAt");
CREATE INDEX "CustomerEvent_customerId_occurredAt_idx" ON "CustomerEvent"("customerId", "occurredAt");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerConsent" ADD CONSTRAINT "CustomerConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
