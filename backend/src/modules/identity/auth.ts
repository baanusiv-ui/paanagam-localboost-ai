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
    } catch (error) {
      // Never log the bearer token. Keep the client response generic, but record
      // the verifier's safe error metadata so staging can distinguish expiry,
      // issuer/audience mismatch, missing claims, and JWKS/network failures.
      const authError = error instanceof Error ? error : new Error("Unknown token verification failure");
      request.log.warn({
        authFailure: {
          name: authError.name,
          code: "code" in authError ? String(authError.code) : undefined,
          message: authError.message.slice(0, 240)
        }
      }, "Neon Auth access-token verification failed");
      return reply.code(401).send({ error: "Invalid or expired access token" });
    }
  };
}
