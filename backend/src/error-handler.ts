import type { FastifyReply, FastifyRequest } from "fastify";

// Client mistakes that Fastify itself (or the rate limiter) detects are reported with their own
// 4xx status and a fixed, safe message so the dashboard can tell "fix your request" and "slow down"
// apart from a server failure. Messages are fixed so no parser, validator or provider text leaks.
const clientErrorMessages: Record<number, string> = {
  400: "Invalid request",
  413: "Request body too large",
  415: "Unsupported media type",
  429: "Too many requests. Try again shortly."
};

type ErrorLike = { statusCode?: unknown; code?: unknown; validation?: unknown };

export function clientErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const { statusCode, code, validation } = error as ErrorLike;
  if (typeof statusCode !== "number" || !(statusCode in clientErrorMessages)) return null;
  // The rate limiter throws a plain 429 response object, so a bare 429 is accepted.
  if (statusCode === 429) return 429;
  // Other 4xx are only trusted when Fastify raised them. Upstream API errors (for example Canva)
  // also carry a statusCode; forwarding it would let an upstream 401/403 look like the owner's own
  // session or permissions failing, so those stay 500.
  const fromFastify = validation !== undefined || (typeof code === "string" && code.startsWith("FST_ERR_"));
  return fromFastify ? statusCode : null;
}

export function apiErrorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const status = clientErrorStatus(error);
  if (status) request.log.warn(error); else request.log.error(error);
  if (reply.sent) return;
  return reply.code(status ?? 500).send({ error: status ? clientErrorMessages[status] : "Internal server error" });
}
