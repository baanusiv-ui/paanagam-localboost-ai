import type { FastifyReply, FastifyRequest } from "fastify";
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

type TokenVerifier = (token: string) => Promise<string>;

export function createRequireUser(verifyToken: TokenVerifier) {
  return async function requireUser(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    try {
      request.userId = await verifyToken(header.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid or expired access token" });
    }
  };
}

