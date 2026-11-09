import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY_BASE64: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().url().optional().default("http://localhost:4100/v1/google/callback"),
  OLLAMA_BASE_URL: z.string().default("").refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(url.hostname); }
    catch { return false; }
  }, "OLLAMA_BASE_URL must point to localhost or host.docker.internal"),
  OLLAMA_MODEL: z.string().trim().min(1).default("qwen2.5:7b")
});

export const env = schema.parse(process.env);
export const corsOrigins = env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean);