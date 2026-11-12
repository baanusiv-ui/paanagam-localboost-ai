import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { findOwnedBusiness } from "./modules/businesses/access.js";
import { getPoyoModel } from "./poyo-catalogue.js";

const createDraftSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO", "AUDIO"]),
  modelId: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(12000),
  modelInput: z.record(z.unknown()).default({})
});

export function registerPoyoRoutes(app: FastifyInstance, db: PrismaClient, requireUser: any) {
  app.get("/v1/businesses/:businessId/poyo/tasks", { preHandler: requireUser }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid business ID." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const tasks = await db.poyoCreativeTask.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, mediaType: true, modelId: true, prompt: true, status: true,
        estimatedCredits: true, actualCredits: true, outputUrls: true,
        errorCode: true, errorMessage: true, submittedAt: true, completedAt: true,
        approvedAt: true, createdAt: true, updatedAt: true
      }
    });
    return { tasks };
  });

  app.post("/v1/businesses/:businessId/poyo/tasks", {
    preHandler: requireUser,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
    const body = createDraftSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Provide a valid media type, model ID, prompt and model input." });
    const selectedModel = body.success ? getPoyoModel(body.data.modelId) : null;
    if (body.success && (!selectedModel || selectedModel.mediaType !== body.data.mediaType)) {
      return reply.code(400).send({ error: "Choose a model listed for the selected media type." });
    }
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    if (JSON.stringify(body.data.modelInput).length > 48_000) return reply.code(413).send({ error: "Model input is too large." });
    const task = await db.poyoCreativeTask.create({
      data: {
        businessId: business.id,
        requestedById: request.userId,
        mediaType: body.data.mediaType,
        modelId: body.data.modelId,
        prompt: body.data.prompt,
        modelInput: body.data.modelInput as Prisma.InputJsonValue,
        status: "DRAFT"
      },
      select: {
        id: true, mediaType: true, modelId: true, prompt: true, status: true,
        estimatedCredits: true, createdAt: true
      }
    });
    return reply.code(201).send({
      task,
      submitted: false,
      charged: false,
      message: "Draft saved. No PoYo request has been submitted and no credits have been used. Model schema and live price must be checked before paid generation."
    });
  });

  app.get("/v1/businesses/:businessId/poyo/tasks/:taskId", { preHandler: requireUser }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1), taskId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid task request." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const task = await db.poyoCreativeTask.findFirst({
      where: { id: params.data.taskId, businessId: business.id },
      select: {
        id: true, mediaType: true, modelId: true, prompt: true, modelInput: true,
        status: true, estimatedCredits: true, actualCredits: true, outputUrls: true,
        errorCode: true, errorMessage: true, submittedAt: true, completedAt: true,
        approvedAt: true, createdAt: true, updatedAt: true
      }
    });
    if (!task) return reply.code(404).send({ error: "Creative task not found." });
    return { task };
  });
}
