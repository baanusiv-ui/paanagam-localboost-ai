import type { FastifyInstance } from "fastify";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { findOwnedBusiness } from "./modules/businesses/access.js";
import { recordBusinessActivity } from "./modules/activity/record.js";

const itemBody = z.object({
  itemKey: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  nameTamil: z.string().trim().max(160).optional(),
  nameEnglish: z.string().trim().max(160).optional(),
  nameTanglish: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional()
}).strict();

const ingredientLine = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().positive().finite().optional(),
  unit: z.string().trim().max(40).optional(),
  preparationNote: z.string().trim().max(500).optional()
}).strict();

const preparationStep = z.object({
  instruction: z.string().trim().min(1).max(2000),
  visibility: z.enum(["CUSTOMER_SAFE", "INTERNAL_ONLY"]).default("CUSTOMER_SAFE"),
  equipment: z.string().trim().max(160).optional(),
  parameters: z.record(z.string(), z.union([z.string().max(160), z.number().finite()])).optional()
}).strict();

const recipeBody = z.object({
  recipeKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(180),
  yieldQuantity: z.number().positive().finite().optional(),
  yieldUnit: z.string().trim().max(40).optional(),
  ingredients: z.array(ingredientLine).max(100),
  preparationSteps: z.array(preparationStep).max(100),
  changeSummary: z.string().trim().max(2000).optional()
}).strict();

const revisionBody = z.object({
  yieldQuantity: z.number().positive().finite().nullable().optional(),
  yieldUnit: z.string().trim().max(40).nullable().optional(),
  ingredients: z.array(ingredientLine).max(100),
  preparationSteps: z.array(preparationStep).max(100),
  changeSummary: z.string().trim().max(2000).optional()
}).strict();

const claimBody = z.object({
  menuItemId: z.string().min(1).optional(),
  recipeRevisionId: z.string().min(1).optional(),
  claimText: z.string().trim().min(1).max(2000),
  language: z.enum(["ta", "en", "ta-en"]).default("ta"),
  usage: z.array(z.enum(["MENU_EXPLAINER", "INGREDIENT_EDUCATION", "PREPARATION_EDUCATION", "FAQ", "VIDEO_SCRIPT"])).min(1).max(5),
  sourceRefs: z.array(z.object({ field: z.string().trim().min(1).max(120), note: z.string().trim().max(500).optional() }).strict()).min(1).max(20)
}).strict();

export async function registerKnowledgeRoutes(app: FastifyInstance, prisma: PrismaClient, requireUser: any) {
  app.get("/v1/businesses/:businessId/knowledge/menu-items", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const rows = await prisma.knowledgeMenuItem.findMany({
      where: { businessId: business.id },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { recipes: { orderBy: { updatedAt: "desc" }, include: { currentRevision: true } } }
    });
    return { menuItems: rows, limit: 200, source: "OWNER_ENTERED" };
  });

  app.post("/v1/businesses/:businessId/knowledge/menu-items", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const parsed = itemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid menu item", details: parsed.error.flatten() });
    const item = await prisma.knowledgeMenuItem.create({ data: { businessId: business.id, ...parsed.data } });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_MENU_ITEM_CREATED", entityType: "KNOWLEDGE_MENU_ITEM", entityId: item.id, summary: "Owner created a menu knowledge item" });
    return reply.code(201).send({ menuItem: item });
  });

  app.post("/v1/businesses/:businessId/knowledge/menu-items/:menuItemId/recipes", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const menuItem = await prisma.knowledgeMenuItem.findFirst({ where: { id: request.params.menuItemId, businessId: business.id } });
    if (!menuItem) return reply.code(404).send({ error: "Menu item not found" });
    const parsed = recipeBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid recipe", details: parsed.error.flatten() });
    const { ingredients, preparationSteps, ...recipeFields } = parsed.data;
    const recipe = await prisma.knowledgeRecipe.create({
      data: {
        businessId: business.id,
        menuItemId: menuItem.id,
        recipeKey: recipeFields.recipeKey,
        title: recipeFields.title,
        revisions: { create: {
          revision: 1,
          status: "DRAFT",
          yieldQuantity: recipeFields.yieldQuantity,
          yieldUnit: recipeFields.yieldUnit,
          ingredients: ingredients as unknown as Prisma.InputJsonValue,
          preparationSteps: preparationSteps as unknown as Prisma.InputJsonValue,
          changeSummary: recipeFields.changeSummary
        } }
      },
      include: { revisions: true }
    });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_RECIPE_CREATED", entityType: "KNOWLEDGE_RECIPE", entityId: recipe.id, summary: "Owner created a draft recipe revision" });
    return reply.code(201).send({ recipe });
  });

  app.post("/v1/businesses/:businessId/knowledge/recipes/:recipeId/revisions", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const recipe = await prisma.knowledgeRecipe.findFirst({ where: { id: request.params.recipeId, businessId: business.id } });
    if (!recipe) return reply.code(404).send({ error: "Recipe not found" });
    const parsed = revisionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid recipe revision", details: parsed.error.flatten() });
    const latest = await prisma.knowledgeRecipeRevision.findFirst({ where: { recipeId: recipe.id }, orderBy: { revision: "desc" } });
    const revision = await prisma.knowledgeRecipeRevision.create({
      data: {
        recipeId: recipe.id,
        revision: (latest?.revision ?? 0) + 1,
        status: "DRAFT",
        yieldQuantity: parsed.data.yieldQuantity ?? null,
        yieldUnit: parsed.data.yieldUnit ?? null,
        ingredients: parsed.data.ingredients as unknown as Prisma.InputJsonValue,
        preparationSteps: parsed.data.preparationSteps as unknown as Prisma.InputJsonValue,
        changeSummary: parsed.data.changeSummary
      }
    });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_RECIPE_REVISION_CREATED", entityType: "KNOWLEDGE_RECIPE_REVISION", entityId: revision.id, summary: "Owner created a new draft recipe revision", metadata: { revision: revision.revision } });
    return reply.code(201).send({ revision });
  });

  app.post("/v1/businesses/:businessId/knowledge/recipe-revisions/:revisionId/approve", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const revision = await prisma.knowledgeRecipeRevision.findFirst({
      where: { id: request.params.revisionId, recipe: { businessId: business.id } },
      include: { recipe: true }
    });
    if (!revision) return reply.code(404).send({ error: "Recipe revision not found" });
    if (!["DRAFT", "IN_REVIEW"].includes(revision.status)) return reply.code(409).send({ error: "Only a draft or in-review recipe revision can be approved." });
    if (!Array.isArray(revision.ingredients) || revision.ingredients.length === 0) return reply.code(422).send({ error: "Add at least one ingredient before approval." });
    if (!Array.isArray(revision.preparationSteps) || revision.preparationSteps.length === 0) return reply.code(422).send({ error: "Add at least one preparation step before approval." });
    const approved = await prisma.$transaction(async tx => {
      if (revision.recipe.currentRevisionId) {
        await tx.knowledgeRecipeRevision.updateMany({
          where: { id: revision.recipe.currentRevisionId, recipeId: revision.recipeId, status: "APPROVED" },
          data: { status: "SUPERSEDED" }
        });
      }
      const next = await tx.knowledgeRecipeRevision.update({
        where: { id: revision.id },
        data: { status: "APPROVED", approvedByUserId: request.userId, approvedAt: new Date(), effectiveAt: new Date() }
      });
      await tx.knowledgeRecipe.update({ where: { id: revision.recipeId }, data: { currentRevisionId: revision.id } });
      await tx.knowledgeMenuItem.update({ where: { id: revision.recipe.menuItemId }, data: { status: "CURRENT" } });
      return next;
    });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_RECIPE_APPROVED", entityType: "KNOWLEDGE_RECIPE_REVISION", entityId: approved.id, summary: "Owner approved a recipe revision", metadata: { revision: approved.revision } });
    return { revision: approved, current: true };
  });

  app.post("/v1/businesses/:businessId/knowledge/claims", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const parsed = claimBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid knowledge claim", details: parsed.error.flatten() });
    if (!parsed.data.menuItemId && !parsed.data.recipeRevisionId) return reply.code(400).send({ error: "Link the claim to a menu item or recipe revision." });
    if (parsed.data.menuItemId) {
      const item = await prisma.knowledgeMenuItem.findFirst({ where: { id: parsed.data.menuItemId, businessId: business.id } });
      if (!item) return reply.code(404).send({ error: "Menu item not found" });
    }
    if (parsed.data.recipeRevisionId) {
      const revision = await prisma.knowledgeRecipeRevision.findFirst({ where: { id: parsed.data.recipeRevisionId, recipe: { businessId: business.id } } });
      if (!revision) return reply.code(404).send({ error: "Recipe revision not found" });
      if (revision.status !== "APPROVED") return reply.code(409).send({ error: "Claims can only reference an approved recipe revision." });
    }
    const claim = await prisma.knowledgeClaim.create({
      data: {
        businessId: business.id,
        menuItemId: parsed.data.menuItemId,
        recipeRevisionId: parsed.data.recipeRevisionId,
        claimText: parsed.data.claimText,
        language: parsed.data.language,
        usage: parsed.data.usage,
        sourceRefs: parsed.data.sourceRefs as unknown as Prisma.InputJsonValue
      }
    });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_CLAIM_CREATED", entityType: "KNOWLEDGE_CLAIM", entityId: claim.id, summary: "Owner created an unapproved knowledge claim" });
    return reply.code(201).send({ claim, approved: false });
  });

  app.post("/v1/businesses/:businessId/knowledge/claims/:claimId/approve", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const claim = await prisma.knowledgeClaim.findFirst({ where: { id: request.params.claimId, businessId: business.id }, include: { recipeRevision: true } });
    if (!claim) return reply.code(404).send({ error: "Knowledge claim not found" });
    if (claim.recipeRevisionId && claim.recipeRevision?.status !== "APPROVED") return reply.code(409).send({ error: "The linked recipe revision is no longer current and approved." });
    const updated = await prisma.knowledgeClaim.update({ where: { id: claim.id }, data: { approvedByUserId: request.userId, approvedAt: new Date() } });
    await recordBusinessActivity(prisma, { businessId: business.id, actorUserId: request.userId, eventType: "KNOWLEDGE_CLAIM_APPROVED", entityType: "KNOWLEDGE_CLAIM", entityId: claim.id, summary: "Owner approved a factual knowledge claim" });
    return { claim: updated, approved: true };
  });

  app.get("/v1/businesses/:businessId/knowledge/search", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const query = z.string().trim().min(2).max(120).safeParse(request.query?.q);
    if (!query.success) return reply.code(400).send({ error: "Enter a search term between 2 and 120 characters." });
    const [menuItems, claims] = await Promise.all([
      prisma.knowledgeMenuItem.findMany({
        where: { businessId: business.id, status: "CURRENT", OR: [{ name: { contains: query.data, mode: "insensitive" } }, { nameTamil: { contains: query.data } }, { nameEnglish: { contains: query.data, mode: "insensitive" } }] },
        take: 20,
        include: { recipes: { where: { currentRevisionId: { not: null } }, include: { currentRevision: true } } }
      }),
      prisma.knowledgeClaim.findMany({
        where: { businessId: business.id, approvedAt: { not: null }, claimText: { contains: query.data, mode: "insensitive" }, OR: [{ recipeRevision: { status: "APPROVED" } }, { recipeRevisionId: null }] },
        take: 20,
        orderBy: { updatedAt: "desc" }
      })
    ]);
    return { menuItems, approvedClaims: claims, unconfirmedWhenAbsent: true };
  });
}
