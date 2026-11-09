ALTER TABLE "User" ADD COLUMN "authSubject" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");
