import { Prisma, type PrismaClient } from "@prisma/client";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";

type IdentityDatabase = Pick<PrismaClient, "user">;
type IdentitySecurity = {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (hash: string, password: string) => Promise<boolean>;
  issueAccessToken: (userId: string) => Promise<string>;
};

export function registerIdentityRoutes(
  app: FastifyInstance,
  db: IdentityDatabase,
  requireUser: preHandlerHookHandler,
  security: IdentitySecurity
) {
  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = z.object({
      email: z.string().email().max(254).transform((value) => value.toLowerCase()),
      password: z.string().min(12).max(128),
      name: z.string().trim().min(1).max(100).optional()
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid registration details", details: parsed.error.flatten() });
    try {
      const user = await db.user.create({
        data: { email: parsed.data.email, passwordHash: await security.hashPassword(parsed.data.password), name: parsed.data.name },
        select: { id: true, email: true, name: true, createdAt: true }
      });
      return reply.code(201).send({ user, accessToken: await security.issueAccessToken(user.id), expiresIn: 900 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({ error: "An account with this email already exists" });
      }
      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = z.object({
      email: z.string().email().transform((value) => value.toLowerCase()),
      password: z.string().min(1).max(128)
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid login details" });
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await security.verifyPassword(user.passwordHash, parsed.data.password))) {
      return reply.code(401).send({ error: "Email or password is incorrect" });
    }
    return {
      user: { id: user.id, email: user.email, name: user.name },
      accessToken: await security.issueAccessToken(user.id),
      expiresIn: 900
    };
  });

  app.get("/v1/me", { preHandler: requireUser }, async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.userId! },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    if (!user) return reply.code(404).send({ error: "User not found" });
    return { user };
  });
}
