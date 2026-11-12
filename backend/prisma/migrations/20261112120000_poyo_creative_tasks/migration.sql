CREATE TYPE "PoyoCreativeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "PoyoMediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

CREATE TABLE "PoyoCreativeTask" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "providerTaskId" TEXT,
  "mediaType" "PoyoMediaType" NOT NULL,
  "modelId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "modelInput" JSONB NOT NULL,
  "status" "PoyoCreativeStatus" NOT NULL DEFAULT 'DRAFT',
  "estimatedCredits" DOUBLE PRECISION,
  "actualCredits" DOUBLE PRECISION,
  "outputUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PoyoCreativeTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PoyoCreativeTask_providerTaskId_key" ON "PoyoCreativeTask"("providerTaskId");
CREATE INDEX "PoyoCreativeTask_businessId_status_createdAt_idx" ON "PoyoCreativeTask"("businessId", "status", "createdAt");
CREATE INDEX "PoyoCreativeTask_businessId_requestedById_createdAt_idx" ON "PoyoCreativeTask"("businessId", "requestedById", "createdAt");
ALTER TABLE "PoyoCreativeTask" ADD CONSTRAINT "PoyoCreativeTask_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
