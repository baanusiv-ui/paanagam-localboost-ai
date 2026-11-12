import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

export type PoyoGenerationInput = {
  model: string;
  input: Record<string, unknown>;
  callbackUrl?: string;
  endUserId?: string;
};

export type PoyoTaskSubmission = {
  taskId: string;
  raw: unknown;
};

export function isPoyoConfigured(): boolean {
  return Boolean(env.POYO_ENABLED && env.POYO_API_KEY);
}

export function verifyPoyoWebhook(input: {
  taskId: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowSeconds?: number;
}): boolean {
  if (!input.taskId || !input.timestamp || !input.signature || !input.secret) return false;
  if (!/^\d{10,}$/.test(input.timestamp)) return false;
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const expected = createHmac("sha256", input.secret)
    .update(input.taskId + "." + input.timestamp)
    .digest("base64");
  const receivedBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}


export type PoyoBalance = { email: string; creditsAmount: number };
export type PoyoTaskStatus = {
  taskId: string;
  status: "not_started" | "running" | "finished" | "failed" | string;
  progress?: number;
  files?: Array<{ file_url: string; file_type?: string }>;
  errorMessage?: string | null;
};

async function poyoRequest<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  if (!env.POYO_API_KEY) throw new Error("PoYo API key is not configured.");
  const response = await fetchImpl(new URL(path, env.POYO_API_BASE_URL), {
    method: "GET",
    headers: { authorization: "Bearer " + env.POYO_API_KEY, accept: "application/json" },
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null) as { code?: number; data?: T; error?: { message?: string } } | null;
  if (!response.ok || !payload || payload.code !== 200 || payload.data === undefined) {
    const message = payload?.error?.message;
    throw new Error("PoYo request failed with HTTP " + response.status + (message ? ": " + message.slice(0, 200) : ""));
  }
  return payload.data;
}

export async function getPoyoBalance(fetchImpl: typeof fetch = fetch): Promise<PoyoBalance> {
  const data = await poyoRequest<{ email: string; credits_amount: number }>("/api/user/balance", fetchImpl);
  if (typeof data.email !== "string" || typeof data.credits_amount !== "number") {
    throw new Error("PoYo returned an unexpected balance response.");
  }
  return { email: data.email, creditsAmount: data.credits_amount };
}

export async function getPoyoTaskStatus(taskId: string, fetchImpl: typeof fetch = fetch): Promise<PoyoTaskStatus> {
  if (!taskId.trim() || taskId.length > 200) throw new Error("A valid PoYo task ID is required.");
  const data = await poyoRequest<{
    task_id: string; status: string; progress?: number;
    files?: Array<{ file_url: string; file_type?: string }>;
    error_message?: string | null;
  }>("/api/generate/status/" + encodeURIComponent(taskId), fetchImpl);
  return {
    taskId: data.task_id,
    status: data.status,
    ...(typeof data.progress === "number" ? { progress: data.progress } : {}),
    ...(Array.isArray(data.files) ? { files: data.files } : {}),
    errorMessage: data.error_message ?? null
  };
}

export async function submitPoyoGeneration(
  request: PoyoGenerationInput,
  fetchImpl: typeof fetch = fetch
): Promise<PoyoTaskSubmission> {
  if (!isPoyoConfigured()) throw new Error("PoYo generation is disabled or not configured.");
  if (!request.model.trim()) throw new Error("A PoYo model ID is required.");
  if (!request.input || typeof request.input !== "object" || Array.isArray(request.input)) {
    throw new Error("PoYo model input must be an object.");
  }
  if (request.callbackUrl) {
    const callback = new URL(request.callbackUrl);
    if (callback.protocol !== "https:") throw new Error("PoYo callback URL must use HTTPS.");
  }

  const endpoint = new URL("/api/generate/submit", env.POYO_API_BASE_URL);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.POYO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
      ...(request.endUserId ? { "X-End-User-ID": request.endUserId } : {})
    },
    body: JSON.stringify({
      model: request.model,
      input: request.input,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {})
    }),
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.json().catch(() => null) as {
    task_id?: string;
    data?: { task_id?: string };
    message?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error("PoYo submission failed with HTTP " + response.status + (raw?.message ? ": " + raw.message.slice(0, 240) : ""));
  }
  if (!raw || raw.code !== 200) throw new Error("PoYo rejected the generation request" + (raw?.message ? ": " + raw.message.slice(0, 200) : ""));
  const taskId = raw?.task_id ?? raw?.data?.task_id;
  if (!taskId || typeof taskId !== "string") throw new Error("PoYo response did not contain a task ID.");
  return { taskId, raw };
}
