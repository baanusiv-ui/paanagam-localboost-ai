CREATE TYPE "KnowledgeItemStatus" AS ENUM ('DRAFT', 'CURRENT', 'ARCHIVED');
CREATE TYPE "RecipeRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'ARCHIVED');
CREATE TYPE "KnowledgeStepVisibility" AS ENUM ('CUSTOMER_SAFE', 'INTERNAL_ONLY');

CREATE TABLE "KnowledgeMenuItem" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameTamil" TEXT,
  "nameEnglish" TEXT,
  "nameTanglish" TEXT,
  "category" TEXT,
  "description" TEXT,
  "status" "KnowledgeItemStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeRecipe" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "recipeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "currentRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeRecipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeRecipeRevision" (
  "id" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "RecipeRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "yieldQuantity" DECIMAL(12,3),
  "yieldUnit" TEXT,
  "ingredients" JSONB NOT NULL,
  "preparationSteps" JSONB NOT NULL,
  "changeSummary" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeRecipeRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeClaim" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "menuItemId" TEXT,
  "recipeRevisionId" TEXT,
  "claimText" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'ta',
  "usage" TEXT[] NOT NULL,
  "sourceRefs" JSONB NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "reviewAfter" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeMenuItem_businessId_itemKey_key" ON "KnowledgeMenuItem"("businessId", "itemKey");
CREATE INDEX "KnowledgeMenuItem_businessId_status_updatedAt_idx" ON "KnowledgeMenuItem"("businessId", "status", "updatedAt");
CREATE UNIQUE INDEX "KnowledgeRecipe_currentRevisionId_key" ON "KnowledgeRecipe"("currentRevisionId");
CREATE UNIQUE INDEX "KnowledgeRecipe_businessId_recipeKey_key" ON "KnowledgeRecipe"("businessId", "recipeKey");
CREATE INDEX "KnowledgeRecipe_businessId_menuItemId_updatedAt_idx" ON "KnowledgeRecipe"("businessId", "menuItemId", "updatedAt");
CREATE UNIQUE INDEX "KnowledgeRecipeRevision_recipeId_revision_key" ON "KnowledgeRecipeRevision"("recipeId", "revision");
CREATE INDEX "KnowledgeRecipeRevision_recipeId_status_revision_idx" ON "KnowledgeRecipeRevision"("recipeId", "status", "revision");
CREATE INDEX "KnowledgeClaim_businessId_approvedAt_updatedAt_idx" ON "KnowledgeClaim"("businessId", "approvedAt", "updatedAt");
CREATE INDEX "KnowledgeClaim_menuItemId_recipeRevisionId_idx" ON "KnowledgeClaim"("menuItemId", "recipeRevisionId");

ALTER TABLE "KnowledgeMenuItem" ADD CONSTRAINT "KnowledgeMenuItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRecipe" ADD CONSTRAINT "KnowledgeRecipe_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRecipe" ADD CONSTRAINT "KnowledgeRecipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "KnowledgeMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRecipeRevision" ADD CONSTRAINT "KnowledgeRecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "KnowledgeRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeRecipe" ADD CONSTRAINT "KnowledgeRecipe_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "KnowledgeRecipeRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeClaim" ADD CONSTRAINT "KnowledgeClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeClaim" ADD CONSTRAINT "KnowledgeClaim_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "KnowledgeMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeClaim" ADD CONSTRAINT "KnowledgeClaim_recipeRevisionId_fkey" FOREIGN KEY ("recipeRevisionId") REFERENCES "KnowledgeRecipeRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
