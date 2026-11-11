CREATE TABLE "CanvaOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvaOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CanvaConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanvaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CanvaOAuthState_state_key" ON "CanvaOAuthState"("state");
CREATE INDEX "CanvaOAuthState_expiresAt_idx" ON "CanvaOAuthState"("expiresAt");
CREATE UNIQUE INDEX "CanvaConnection_businessId_key" ON "CanvaConnection"("businessId");
ALTER TABLE "CanvaOAuthState" ADD CONSTRAINT "CanvaOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvaOAuthState" ADD CONSTRAINT "CanvaOAuthState_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvaConnection" ADD CONSTRAINT "CanvaConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
