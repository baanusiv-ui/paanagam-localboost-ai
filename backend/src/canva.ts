import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { env } from "./env.js";
import { encryptSecret, randomUrlToken } from "./security.js";
import { findOwnedBusiness } from "./modules/businesses/access.js";

const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const DEFAULT_SCOPES = "design:content:read design:content:write asset:read";

const admins = () => env.CREATIVE_STUDIO_ADMIN_EMAILS.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
async function isAdmin(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  return Boolean(user && admins().includes(user.email.toLowerCase()));
}
async function tokenExchange(form: URLSearchParams) {
  const auth = Buffer.from(env.CANVA_CLIENT_ID + ":" + env.CANVA_CLIENT_SECRET).toString("base64");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { authorization: "Basic " + auth, "content-type": "application/x-www-form-urlencoded" }, body: form });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error || "Canva token exchange failed");
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
      await db.canvaConnection.upsert({
        where: { businessId: pending.businessId },
        create: { businessId: pending.businessId, accessTokenEncrypted: encryptSecret(result.access_token!), refreshTokenEncrypted: encryptSecret(result.refresh_token!), scopes: result.scope || "", expiresAt: new Date(Date.now() + (result.expires_in || 14400) * 1000) },
        update: { accessTokenEncrypted: encryptSecret(result.access_token!), refreshTokenEncrypted: encryptSecret(result.refresh_token!), scopes: result.scope || "", expiresAt: new Date(Date.now() + (result.expires_in || 14400) * 1000), connectedAt: new Date() }
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
  app.delete("/v1/businesses/:businessId/canva/disconnect", { preHandler: requireUser }, async (req: any, reply) => {
    if (!await isAdmin(db, req.userId)) return reply.code(403).send({ error: "Administrator access required." });
    const business = await findOwnedBusiness(db, req.userId, String(req.params.businessId));
    if (!business) return reply.code(404).send({ error: "Business not found." });
    await db.canvaConnection.deleteMany({ where: { businessId: business.id } });
    return reply.code(204).send();
  });
}
