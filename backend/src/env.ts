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
  GOOGLE_REDIRECT_URI: z.string().url().optional().default("http://localhost:4100/v1/google/callback")
});

export const env = schema.parse(process.env);
export const corsOrigins = env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean);