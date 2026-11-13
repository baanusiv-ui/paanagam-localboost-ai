import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { findOwnedBusiness } from "./modules/businesses/access.js";
import { env } from "./env.js";
import { getPoyoModel } from "./poyo-catalogue.js";
import { getPoyoTaskStatus, isPoyoConfigured, submitPoyoGeneration } from "./poyo.js";

const createDraftSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO", "AUDIO"]),
  modelId: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(800),
  modelInput: z.record(z.unknown()).default({})
});

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch { return false; }
}

async function requirePoyoAdmin(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  const admins = env.CREATIVE_STUDIO_ADMIN_EMAILS.split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && admins.includes(user.email.trim().toLowerCase()));
}

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
        id: true, mediaType: true, modelId: true, prompt: true, modelInput: true, status: true,
        estimatedCredits: true, actualCredits: true, outputUrls: true,
        errorCode: true, errorMessage: true, submittedAt: true, completedAt: true,
        approvedAt: true, approvedById: true, createdAt: true, updatedAt: true
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
    if (!params.success || !body.success) return reply.code(400).send({ error: "Provide a valid media type, model ID, prompt (maximum 800 characters) and model input." });
    const selectedModel = getPoyoModel(body.data.modelId);
    if (!selectedModel || selectedModel.mediaType !== body.data.mediaType) {
      return reply.code(400).send({ error: "Choose a supported PoYo model for the selected media type." });
    }
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    if (JSON.stringify(body.data.modelInput).length > 12_000) return reply.code(413).send({ error: "Model input is too large." });
    const task = await db.poyoCreativeTask.create({
      data: {
        businessId: business.id,
        requestedById: request.userId,
        mediaType: body.data.mediaType,
        modelId: body.data.modelId,
        prompt: body.data.prompt,
        modelInput: body.data.modelInput as Prisma.InputJsonValue,
        status: "DRAFT",
        estimatedCredits: body.data.mediaType === "VIDEO" ? 6 : null
      },
      select: {
        id: true, mediaType: true, modelId: true, prompt: true, modelInput: true,
        status: true, estimatedCredits: true, createdAt: true
      }
    });
    return reply.code(201).send({
      task,
      submitted: false,
      charged: false,
      message: "Draft saved. No PoYo request has been submitted and no credits have been used."
    });
  });

  app.post("/v1/businesses/:businessId/poyo/tasks/:taskId/submit", {
    preHandler: requireUser,
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } }
  }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1), taskId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid task request." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    if (!await requirePoyoAdmin(db, request.userId)) return reply.code(403).send({ error: "Administrator approval is required to start paid PoYo generation." });
    if (!isPoyoConfigured()) return reply.code(503).send({ error: "PoYo generation is paused. Configure POYO_API_KEY and explicitly enable POYO_ENABLED after the no-spend checks." });

    const task = await db.poyoCreativeTask.findFirst({ where: { id: params.data.taskId, businessId: business.id } });
    if (!task) return reply.code(404).send({ error: "Creative task not found." });
    if (task.status !== "DRAFT") return reply.code(409).send({ error: "Only a saved draft can be submitted. This task may already have been charged." });
    const rawInput = task.modelInput && typeof task.modelInput === "object" && !Array.isArray(task.modelInput)
      ? task.modelInput as Record<string, unknown> : {};
    const isImage = task.mediaType === "IMAGE" && task.modelId === "nano-banana-2.1";
    const isVideo = task.mediaType === "VIDEO" && ["wan2.2-text-to-video-fast", "wan2.2-image-to-video-fast"].includes(task.modelId);
    if (!isImage && !isVideo) return reply.code(400).send({ error: "Choose Nano Banana 2.1 for images or a verified Wan 2.2 Fast model for video." });
    const input: Record<string, unknown> = { prompt: task.prompt.slice(0, 800) };
    if (isImage) {
      const size = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].includes(String(rawInput.size)) ? String(rawInput.size) : "1:1";
      const resolution = ["1K", "2K", "4K"].includes(String(rawInput.resolution)) ? String(rawInput.resolution) : "2K";
      input.size = size; input.resolution = resolution; input.n = 1;
      const urls = Array.isArray(rawInput.image_urls) ? rawInput.image_urls : [];
      if (urls.length > 10 || !urls.every(v => typeof v === "string" && isPublicHttpsUrl(v))) return reply.code(400).send({ error: "Image editing supports up to 10 publicly reachable HTTPS reference image URLs." });
      if (urls.length) input.image_urls = urls;
    } else {
      input.resolution = "480p";
      if (task.modelId === "wan2.2-text-to-video-fast") input.aspect_ratio = rawInput.aspect_ratio === "16:9" ? "16:9" : "9:16";
      else {
        const urls = Array.isArray(rawInput.image_urls) ? rawInput.image_urls : [];
        if (urls.length < 1 || urls.length > 2 || !urls.every(v => typeof v === "string" && isPublicHttpsUrl(v))) return reply.code(400).send({ error: "Image-to-video needs one or two publicly reachable HTTPS image URLs." });
        input.image_urls = urls;
      }
      if (Number.isSafeInteger(rawInput.seed) && Number(rawInput.seed) >= 0) input.seed = Number(rawInput.seed);
    }
    try {
      const submitted = await submitPoyoGeneration({ model: task.modelId, input });
      const updated = await db.poyoCreativeTask.update({
        where: { id: task.id },
        data: { providerTaskId: submitted.taskId, status: "SUBMITTED", submittedAt: new Date(), errorCode: null, errorMessage: null },
        select: { id: true, status: true, modelId: true, estimatedCredits: true, submittedAt: true }
      });
      await db.activityEvent.create({
        data: { businessId: business.id, actorUserId: request.userId, eventType: "POYO_VIDEO_SUBMITTED", entityType: "POYO_VIDEO", entityId: task.id, summary: "Owner submitted a Wan 2.2 Fast video generation job", metadata: { modelId: task.modelId, resolution: "480p", estimatedCredits: 6 } }
      });
      return reply.code(202).send({ task: updated, providerTaskId: submitted.taskId, estimatedCredits: 6, resolution: "480p", message: "Generation submitted. Final output is not approved or published." });
    } catch (error) {
      request.log.warn({ error: error instanceof Error ? error.message : "unknown", taskId: task.id }, "PoYo submission failed");
      await db.poyoCreativeTask.update({ where: { id: task.id }, data: { status: "FAILED", errorCode: "SUBMISSION_FAILED", errorMessage: "PoYo submission failed. Check provider status before retrying." } });
      return reply.code(502).send({ error: "PoYo could not accept the generation request. Check the task before trying again." });
    }
  });

  app.post("/v1/businesses/:businessId/poyo/tasks/:taskId/refresh", { preHandler: requireUser }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1), taskId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid task request." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const task = await db.poyoCreativeTask.findFirst({ where: { id: params.data.taskId, businessId: business.id } });
    if (!task) return reply.code(404).send({ error: "Creative task not found." });
    if (!task.providerTaskId) return { task, refreshed: false };
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(task.status) && task.outputUrls.length) return { task, refreshed: false };

    try {
      const remote = await getPoyoTaskStatus(task.providerTaskId);
      if (remote.status === "failed") {
        const updated = await db.poyoCreativeTask.update({ where: { id: task.id }, data: { status: "FAILED", completedAt: new Date(), errorCode: "PROVIDER_FAILED", errorMessage: (remote.errorMessage || "Video generation failed").slice(0, 500) } });
        return { task: updated, refreshed: true };
      }
      if (remote.status !== "finished") {
        const updated = await db.poyoCreativeTask.update({ where: { id: task.id }, data: { status: "PROCESSING" } });
        return { task: updated, refreshed: true };
      }

      const expectedType = task.mediaType === "IMAGE" ? "image" : "video";
      const outputFile = (remote.files || []).find(file => file.file_type?.toLowerCase() === expectedType && typeof file.file_url === "string");
      if (!outputFile || !outputFile.file_url) return reply.code(502).send({ error: "PoYo marked the task complete but did not return the expected media file." });
      const outputUrl = new URL(outputFile.file_url);
      if (outputUrl.protocol !== "https:" || outputUrl.hostname !== "storage.poyo.ai") return reply.code(502).send({ error: "PoYo returned an unexpected storage host." });
      const response = await fetch(outputUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return reply.code(502).send({ error: "Generated video could not be downloaded from PoYo storage." });
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > 25 * 1024 * 1024) return reply.code(413).send({ error: "Generated video exceeds the 25 MB preview storage limit." });
      const fallbackMime = task.mediaType === "IMAGE" ? "image/png" : "video/mp4";
      const mimeType = ((response.headers.get("content-type") || fallbackMime).split(";")[0] ?? fallbackMime).trim().toLowerCase();
      const allowedMime = task.mediaType === "IMAGE" ? ["image/png", "image/jpeg", "image/webp"] : ["video/mp4", "video/webm"];
      if (!allowedMime.includes(mimeType)) return reply.code(415).send({ error: "PoYo returned an unsupported media format." });
      const reader = response.body?.getReader();
      if (!reader) return reply.code(502).send({ error: "Generated video response had no readable body." });
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const value = chunk.value;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > 25 * 1024 * 1024) {
          await reader.cancel();
          return reply.code(413).send({ error: "Generated video exceeds the 25 MB preview storage limit." });
        }
        chunks.push(value);
      }
      if (!totalBytes) return reply.code(502).send({ error: "PoYo returned an empty video file." });
      const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), totalBytes);
      const usage = await db.creativeAsset.aggregate({ where: { businessId: business.id }, _count: { _all: true }, _sum: { byteSize: true } });
      if (usage._count._all >= 100 || (usage._sum.byteSize ?? 0) + bytes.length > 100 * 1024 * 1024) {
        return reply.code(413).send({ error: "Business creative library limit reached (100 assets or 100 MB)." });
      }
      const asset = await db.creativeAsset.create({
        data: { businessId: business.id, fileName: "wan22-" + task.id.slice(0, 18) + ".mp4", mimeType, byteSize: bytes.length, data: bytes, altText: task.prompt.slice(0, 240) },
        select: { id: true }
      });
      const contentPath = "/v1/businesses/" + business.id + "/poyo/assets/" + asset.id + "/content";
      const updated = await db.poyoCreativeTask.update({
        where: { id: task.id },
        data: { status: "SUCCEEDED", completedAt: new Date(), outputUrls: [contentPath], errorCode: null, errorMessage: null },
        select: { id: true, status: true, outputUrls: true, completedAt: true, approvedAt: true }
      });
      await db.activityEvent.create({
        data: { businessId: business.id, actorUserId: request.userId, eventType: "POYO_VIDEO_READY", entityType: "POYO_VIDEO", entityId: task.id, summary: "Generated video saved to the business creative library", metadata: { assetId: asset.id, byteSize: bytes.length } }
      });
      return { task: updated, refreshed: true };
    } catch (error) {
      request.log.warn({ error: error instanceof Error ? error.message : "unknown", taskId: task.id }, "PoYo task refresh failed");
      return reply.code(502).send({ error: "PoYo task status could not be refreshed. Try again shortly." });
    }
  });

  app.post("/v1/businesses/:businessId/poyo/tasks/:taskId/approve", { preHandler: requireUser }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1), taskId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid approval request." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const task = await db.poyoCreativeTask.findFirst({ where: { id: params.data.taskId, businessId: business.id } });
    if (!task) return reply.code(404).send({ error: "Creative task not found." });
    if (task.status !== "SUCCEEDED" || !task.outputUrls.length) return reply.code(409).send({ error: "Only a completed video can be approved." });
    const updated = await db.poyoCreativeTask.update({
      where: { id: task.id },
      data: { approvedAt: new Date(), approvedById: request.userId },
      select: { id: true, status: true, outputUrls: true, approvedAt: true, approvedById: true }
    });
    await db.activityEvent.create({
      data: { businessId: business.id, actorUserId: request.userId, eventType: "POYO_VIDEO_APPROVED", entityType: "POYO_VIDEO", entityId: task.id, summary: "Owner explicitly approved the generated video for a separate publishing workflow", metadata: { autoPublished: false } }
    });
    return { task: updated, published: false, message: "Approval recorded. This does not publish the video." };
  });

  app.get("/v1/businesses/:businessId/poyo/assets/:assetId/content", { preHandler: requireUser }, async (request: any, reply) => {
    const params = z.object({ businessId: z.string().min(1), assetId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid video asset identifier." });
    const business = await findOwnedBusiness(db, request.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const asset = await db.creativeAsset.findFirst({ where: { id: params.data.assetId, businessId: business.id }, select: { data: true, mimeType: true, byteSize: true } });
    if (!asset || !["video/mp4", "video/webm"].includes(asset.mimeType)) return reply.code(404).send({ error: "Video asset not found." });
    return reply.header("content-type", asset.mimeType).header("content-length", String(asset.byteSize)).header("content-disposition", "inline").header("cache-control", "private, no-store").header("x-content-type-options", "nosniff").send(Buffer.from(asset.data));
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
        approvedAt: true, approvedById: true, createdAt: true, updatedAt: true
      }
    });
    if (!task) return reply.code(404).send({ error: "Creative task not found." });
    return { task };
  });
}
