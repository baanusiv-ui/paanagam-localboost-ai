import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const encryptionKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY_BASE64, "base64");
if (encryptionKey.length !== 32) {
  throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
}

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

export async function issueAccessToken(userId: string) {
  return new SignJWT({ sub: userId, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtKey);
}

export async function verifyAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwtKey);
  if (payload.typ !== "access" || typeof payload.sub !== "string") throw new Error("Invalid access token");
  return payload.sub;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export const randomUrlToken = (bytes = 32) => randomBytes(bytes).toString("base64url");