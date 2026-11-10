CREATE TYPE "SocialChannel" AS ENUM ('FACEBOOK', 'INSTAGRAM');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TABLE "MetaConnection" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "pageName" TEXT NOT NULL,
  "instagramUserId" TEXT,
  "instagramUsername" TEXT,
  "pageAccessTokenEncrypted" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaConnection_businessId_key" ON "MetaConnection"("businessId");
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "MetaOAuthState" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetaOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaOAuthState_state_key" ON "MetaOAuthState"("state");
CREATE INDEX "MetaOAuthState_expiresAt_idx" ON "MetaOAuthState"("expiresAt");
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "MetaOAuthSession" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userTokenEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaOAuthSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaOAuthSession_businessId_key" ON "MetaOAuthSession"("businessId");
ALTER TABLE "MetaOAuthSession" ADD CONSTRAINT "MetaOAuthSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "SocialPost" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "assetId" TEXT,
  "channel" "SocialChannel" NOT NULL,
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceDraftId" TEXT,
  "caption" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "externalPostId" TEXT,
  "publishError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialPost_businessId_channel_sourceDraftId_key" ON "SocialPost"("businessId", "channel", "sourceDraftId");
CREATE INDEX "SocialPost_businessId_status_createdAt_idx" ON "SocialPost"("businessId", "status", "createdAt");
CREATE INDEX "SocialPost_businessId_channel_createdAt_idx" ON "SocialPost"("businessId", "channel", "createdAt");
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CreativeAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "MetaMediaShare" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetaMediaShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaMediaShare_token_key" ON "MetaMediaShare"("token");
CREATE INDEX "MetaMediaShare_expiresAt_idx" ON "MetaMediaShare"("expiresAt");
ALTER TABLE "MetaMediaShare" ADD CONSTRAINT "MetaMediaShare_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaMediaShare" ADD CONSTRAINT "MetaMediaShare_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CreativeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
