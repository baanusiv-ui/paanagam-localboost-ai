import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { EvidenceSource, Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { env, corsOrigins } from "./env.js";
import { hashPassword, verifyPassword, issueAccessToken, verifyAccessToken, encryptSecret, randomUrlToken } from "./security.js";
import { buildAudit } from "./audit.js";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
await app.register(helmet);
await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Origin not allowed"), false);
  }
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.decorateRequest("userId", null);
declare module "fastify" {
  interface FastifyRequest { userId: string | null }
}

async function requireUser(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return reply.code(401).send({ error: "Authentication required" });
  try {
    request.userId = await verifyAccessToken(header.slice(7));
  } catch {
    return reply.code(401).send({ error: "Invalid or expired access token" });
  }
}

async function ownedBusiness(userId: string, businessId: string) {
  return prisma.business.findFirst({ where: { id: businessId, ownerId: userId } });
}

app.get("/health", async () => ({ ok: true, service: "localboost-api", version: "0.1.0" }));

app.post("/v1/auth/register", async (request, reply) => {
  const parsed = z.object({
    email: z.string().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(1).max(100).optional()
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid registration details", details: parsed.error.flatten() });
  try {
    const user = await prisma.user.create({
      data: { email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), name: parsed.data.name },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    return reply.code(201).send({ user, accessToken: await issueAccessToken(user.id), expiresIn: 900 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }
    throw error;
  }
});

app.post("/v1/auth/login", async (request, reply) => {
  const parsed = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid login details" });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return reply.code(401).send({ error: "Email or password is incorrect" });
  }
  return { user: { id: user.id, email: user.email, name: user.name }, accessToken: await issueAccessToken(user.id), expiresIn: 900 };
});

app.get("/v1/me", { preHandler: requireUser }, async (request, reply) => {
  const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { id: true, email: true, name: true, createdAt: true } });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return { user };
});

app.get("/v1/businesses", { preHandler: requireUser }, async (request) => {
  return prisma.business.findMany({
    where: { ownerId: request.userId! },
    select: { id: true, displayName: true, category: true, address: true, website: true, phone: true, createdAt: true, googleConnection: { select: { connectedAt: true, scope: true } } },
    orderBy: { createdAt: "desc" }
  });
});

app.post("/v1/businesses", { preHandler: requireUser }, async (request, reply) => {
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(160),
    category: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
    website: z.string().url().max(500).optional(),
    phone: z.string().trim().max(40).optional(),
    countryCode: z.string().length(2).default("IN")
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid business details", details: parsed.error.flatten() });
  const business = await prisma.business.create({ data: { ...parsed.data, ownerId: request.userId! } });
  return reply.code(201).send({ business });
});

app.post("/v1/businesses/:businessId/evidence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    category: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
    value: z.unknown(),
    source: z.nativeEnum(EvidenceSource),
    sourceLabel: z.string().trim().max(160).optional(),
    verified: z.boolean().default(false),
    observedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional()
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid evidence details" });
  if (body.data.source === EvidenceSource.DEMO && body.data.verified) return reply.code(400).send({ error: "Demo evidence cannot be marked verified" });
  if (body.data.source === EvidenceSource.PUBLIC_OBSERVATION && body.data.verified) return reply.code(400).send({ error: "Public observations cannot be marked owner-verified or API-verified" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const evidence = await prisma.evidence.create({
    data: {
      businessId: business.id,
      category: body.data.category,
      value: body.data.value as Prisma.InputJsonValue,
      source: body.data.source,
      sourceLabel: body.data.sourceLabel,
      verified: body.data.verified,
      observedAt: body.data.observedAt,
      expiresAt: body.data.expiresAt
    }
  });
  return reply.code(201).send({ evidence });
});

app.get("/v1/businesses/:businessId/evidence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  return prisma.evidence.findMany({
    where: { businessId: params.data.businessId },
    orderBy: { observedAt: "desc" },
    select: { id: true, category: true, value: true, source: true, sourceLabel: true, verified: true, observedAt: true, expiresAt: true }
  });
});

app.post("/v1/businesses/:businessId/audits", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  const evidence = await prisma.evidence.findMany({ where: { businessId: params.data.businessId } });
  const result = buildAudit(evidence);
  const audit = await prisma.audit.create({
    data: {
      businessId: params.data.businessId,
      status: result.status,
      completeness: result.completeness,
      findings: result.findings as unknown as Prisma.InputJsonValue,
      evidenceIds: result.evidenceIds
    }
  });
  return reply.code(201).send({ audit, interpretation: result.scoreMeaning, engine: result.engine });
});

app.get("/v1/businesses/:businessId/audits", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  return prisma.audit.findMany({ where: { businessId: params.data.businessId }, orderBy: { createdAt: "desc" } });
});

app.get("/v1/google/connect/:businessId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return reply.code(503).send({ error: "Google OAuth is not configured. Add credentials to the deployment environment first." });

  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await prisma.oAuthState.create({
    data: { state, codeVerifier: verifier, userId: request.userId!, businessId: business.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  return reply.redirect(url.toString());
});

app.get("/v1/google/callback", async (request, reply) => {
  const query = z.object({ code: z.string().optional(), state: z.string().min(1), error: z.string().optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid OAuth callback" });
  if (query.data.error) return reply.code(400).send({ error: "Google authorisation was not completed", providerError: query.data.error });
  if (!query.data.code) return reply.code(400).send({ error: "Missing authorisation code" });

  const oauthState = await prisma.oAuthState.findUnique({ where: { state: query.data.state } });
  if (!oauthState || oauthState.expiresAt.getTime() < Date.now()) {
    if (oauthState) await prisma.oAuthState.delete({ where: { id: oauthState.id } });
    return reply.code(400).send({ error: "OAuth state is invalid or expired. Start the connection again." });
  }
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: query.data.code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: oauthState.codeVerifier
    })
  });
  const tokenData = await tokenResponse.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    request.log.error({ providerError: tokenData.error }, "Google token exchange failed");
    return reply.code(502).send({ error: "Google token exchange failed. Check OAuth configuration and try again." });
  }
  const grantedScopes = (tokenData.scope ?? "").split(" ");
  if (!grantedScopes.includes("https://www.googleapis.com/auth/business.manage")) {
    return reply.code(400).send({ error: "The required Business Profile permission was not granted." });
  }

  await prisma.googleConnection.upsert({
    where: { businessId: oauthState.businessId },
    create: {
      businessId: oauthState.businessId,
      accessTokenEncrypted: encryptSecret(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : null,
      scope: tokenData.scope ?? "",
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
    },
    update: {
      accessTokenEncrypted: encryptSecret(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : undefined,
      scope: tokenData.scope ?? "",
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
    }
  });
  return reply.redirect(`${env.APP_BASE_URL}/?google=connected`);
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (reply.sent) return;
  return reply.code(500).send({ error: "Internal server error" });
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
};
process.on("SIGINT", () => void close().then(() => process.exit(0)));
process.on("SIGTERM", () => void close().then(() => process.exit(0)));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}