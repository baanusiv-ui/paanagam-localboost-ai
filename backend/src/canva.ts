import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "./env.js";
import { decryptSecret, encryptSecret, randomUrlToken } from "./security.js";
import { findOwnedBusiness } from "./modules/businesses/access.js";

const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const API_URL = "https://api.canva.com/rest/v1";
const DEFAULT_SCOPES = "design:meta:read design:content:read design:content:write asset:read";
const DESIGN_LIST_SCOPE = "design:meta:read";

const admins = () => env.CREATIVE_STUDIO_ADMIN_EMAILS.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
async function isAdmin(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  return Boolean(user && admins().includes(user.email.toLowerCase()));
}
async function tokenExchange(form: URLSearchParams) {
  const auth = Buffer.from(env.CANVA_CLIENT_ID + ":" + env.CANVA_CLIENT_SECRET).toString("base64");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { authorization: "Basic " + auth, "content-type": "application/x-www-form-urlencoded" }, body: form });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error || "Canva token exchange failed");
  return data;
}

// A refresh token is single-use. Coalesce refreshes within this API process so
// simultaneous list requests cannot race and invalidate the same refresh token.
const refreshes = new Map<string, Promise<string>>();
async function getCanvaAccessToken(db: PrismaClient, businessId: string, forceRefresh = false): Promise<string> {
  const connection = await db.canvaConnection.findUnique({ where: { businessId } });
  if (!connection) throw new Error("Canva is not connected");
  if (!forceRefresh && connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptSecret(connection.accessTokenEncrypted);
  }
  const active = refreshes.get(businessId);
  if (active) return active;
  const pending = (async () => {
    const latest = await db.canvaConnection.findUnique({ where: { businessId } });
    if (!latest) throw new Error("Canva is not connected");
    if (!forceRefresh && latest.expiresAt && latest.expiresAt.getTime() > Date.now() + 60_000) return decryptSecret(latest.accessTokenEncrypted);
    const result = await tokenExchange(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(latest.refreshTokenEncrypted)
    }));
    await db.canvaConnection.update({
      where: { businessId },
      data: {
        accessTokenEncrypted: encryptSecret(result.access_token!),
        refreshTokenEncrypted: result.refresh_token ? encryptSecret(result.refresh_token) : latest.refreshTokenEncrypted,
        scopes: result.scope || latest.scopes,
        expiresAt: new Date(Date.now() + (result.expires_in || 14400) * 1000)
      }
    });
    return result.access_token!;
  })();
  refreshes.set(businessId, pending);
  try { return await pending; }
  finally { if (refreshes.get(businessId) === pending) refreshes.delete(businessId); }
}

async function listCanvaDesigns(accessToken: string, query: Record<string, string | undefined>) {
  const url = new URL(API_URL + "/designs");
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken, accept: "application/json" } });
  const data = await response.json() as { items?: unknown[]; continuation?: string; code?: string; message?: string };
  if (!response.ok) {
    const error = new Error(data.message || data.code || "Canva design request failed") as Error & { statusCode?: number; canvaCode?: string };
    error.statusCode = response.status;
    error.canvaCode = data.code;
    throw error;
  }
  return data;
}

export async function registerCanvaRoutes(app: FastifyInstance, db: PrismaClient, requireUser: any) {
  app.get("/v1/businesses/:businessId/canva/connect", { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!env.CANVA_CLIENT_ID || !env.CANVA_CLIENT_SECRET) return reply.code(503).send({ error: "Canva credentials are not configured." });
    if (!await isAdmin(db, req.userId)) return reply.code(403).send({ error: "Administrator access required." });
    const business = await findOwnedBusiness(db, req.userId, String(req.params.businessId));
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomUrlToken(32);
    await db.canvaOAuthState.create({ data: { state, codeVerifier: verifier, userId: req.userId, businessId: business.id, expiresAt: new Date(Date.now() + 600000) } });
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", env.CANVA_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", env.CANVA_REDIRECT_URI);
    url.searchParams.set("scope", env.CANVA_SCOPES.trim() || DEFAULT_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "s256");
    return reply.send({ authorizationUrl: url.toString() });
  });
  app.get("/v1/canva/callback", async (req: any, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const back = (s: string) => reply.redirect(env.APP_BASE_URL.replace(/\/$/, "") + "/?canva=" + encodeURIComponent(s));
    if (q.error || !q.code || !q.state) return back(q.error ? "denied" : "error");
    const pending = await db.canvaOAuthState.findUnique({ where: { state: q.state } });
    if (!pending || pending.expiresAt <= new Date()) {
      if (pending) await db.canvaOAuthState.delete({ where: { id: pending.id } });
      return back("expired");
    }
    await db.canvaOAuthState.delete({ where: { id: pending.id } });
    if (!await isAdmin(db, pending.userId)) return back("unauthorized");
    try {
      const result = await tokenExchange(new URLSearchParams({ grant_type: "authorization_code", code: q.code, code_verifier: pending.codeVerifier, redirect_uri: env.CANVA_REDIRECT_URI }));
      if (!result.refresh_token) throw new Error("Canva did not return a refresh token");
      await db.canvaConnection.upsert({
        where: { businessId: pending.businessId },
        create: { businessId: pending.businessId, accessTokenEncrypted: encryptSecret(result.access_token!), refreshTokenEncrypted: encryptSecret(result.refresh_token), scopes: result.scope || "", expiresAt: new Date(Date.now() + (result.expires_in || 14400) * 1000) },
        update: { accessTokenEncrypted: encryptSecret(result.access_token!), refreshTokenEncrypted: encryptSecret(result.refresh_token), scopes: result.scope || "", expiresAt: new Date(Date.now() + (result.expires_in || 14400) * 1000), connectedAt: new Date() }
      });
      return back("connected");
    } catch (e) {
      req.log.error({ error: e instanceof Error ? e.message : "unknown" }, "Canva OAuth callback failed");
      return back("error");
    }
  });
  app.get("/v1/businesses/:businessId/canva/status", { preHandler: requireUser }, async (req: any, reply) => {
    if (!await isAdmin(db, req.userId)) return reply.code(403).send({ error: "Administrator access required." });
    const business = await findOwnedBusiness(db, req.userId, String(req.params.businessId));
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const c = await db.canvaConnection.findUnique({ where: { businessId: business.id }, select: { scopes: true, connectedAt: true, expiresAt: true } });
    return { connected: Boolean(c), connection: c };
  });
  app.get("/v1/businesses/:businessId/canva/designs", {
    preHandler: requireUser,
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req: any, reply) => {
    if (!await isAdmin(db, req.userId)) return reply.code(403).send({ error: "Administrator access required." });
    const params = z.object({ businessId: z.string().min(1) }).safeParse(req.params);
    const query = z.object({
      query: z.string().trim().max(255).optional(),
      continuation: z.string().trim().min(1).max(2048).optional(),
      ownership: z.enum(["any", "owned", "shared"]).default("any"),
      sort_by: z.enum(["relevance", "modified_descending", "modified_ascending", "title_descending", "title_ascending"]).default("modified_descending"),
      limit: z.coerce.number().int().min(1).max(100).default(25)
    }).safeParse(req.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid Canva design list query." });
    const business = await findOwnedBusiness(db, req.userId, params.data.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found." });
    const connection = await db.canvaConnection.findUnique({ where: { businessId: business.id }, select: { scopes: true } });
    if (!connection) return reply.code(409).send({ error: "Canva is not connected.", code: "canva_not_connected" });
    if (!connection.scopes.split(/\s+/).includes(DESIGN_LIST_SCOPE)) {
      return reply.code(409).send({
        error: "Canva design listing requires the design:meta:read permission. Update the Canva app's enabled scopes and reconnect Canva.",
        code: "canva_scope_required",
        requiredScope: DESIGN_LIST_SCOPE
      });
    }
    try {
      const filters = {
        query: query.data.query,
        continuation: query.data.continuation,
        ownership: query.data.ownership,
        sort_by: query.data.sort_by,
        limit: String(query.data.limit)
      };
      let token = await getCanvaAccessToken(db, business.id);
      let result;
      try { result = await listCanvaDesigns(token, filters); }
      catch (error) {
        const apiError = error as Error & { statusCode?: number; canvaCode?: string };
        if (apiError.statusCode !== 401) throw error;
        token = await getCanvaAccessToken(db, business.id, true);
        result = await listCanvaDesigns(token, filters);
      }
      return {
        items: result.items ?? [],
        continuation: result.continuation ?? null,
        count: result.items?.length ?? 0
      };
    } catch (error) {
      const apiError = error as Error & { statusCode?: number; canvaCode?: string };
      req.log.error({ statusCode: apiError.statusCode, code: apiError.canvaCode }, "Canva design listing failed");
      if (apiError.canvaCode === "missing_scope") return reply.code(409).send({ error: "Canva design listing permission is missing. Reconnect Canva after enabling design:meta:read.", code: "canva_scope_required", requiredScope: DESIGN_LIST_SCOPE });
      if (apiError.statusCode === 401) return reply.code(401).send({ error: "Canva authorisation expired or was revoked. Reconnect Canva.", code: "canva_reconnect_required" });
      if (apiError.statusCode === 403) return reply.code(403).send({ error: "Canva denied access to the design library.", code: apiError.canvaCode || "canva_permission_denied" });
      return reply.code(502).send({ error: "Unable to retrieve designs from Canva. Please try again." });
    }
  });
  app.delete("/v1/businesses/:businessId/canva/disconnect", { preHandler: requireUser }, async (req: any, reply) => {
    if (!await isAdmin(db, req.userId)) return reply.code(403).send({ error: "Administrator access required." });
    const business = await findOwnedBusiness(db, req.userId, String(req.params.businessId));
    if (!business) return reply.code(404).send({ error: "Business not found." });
    await db.canvaConnection.deleteMany({ where: { businessId: business.id } });
    return reply.code(204).send();
  });
}
