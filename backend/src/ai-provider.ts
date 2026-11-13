export type AiMessage = { role: string; content: string };

type JsonSchema = {
  type: "OBJECT";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
};

type GenerateOptions = {
  task: string;
  messages: AiMessage[];
  responseSchema: JsonSchema;
  maxOutputTokens?: number;
  temperature?: number;
};

const cloudBaseUrl = "https://ollama.com";
const cloudModel = () => (process.env.OLLAMA_CLOUD_MODEL || "glm-5.3-flash").trim();
const localBaseUrl = () => (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const localModel = () => (process.env.OLLAMA_MODEL || "qwen2.5:7b").trim();
const geminiModel = () => (process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite").trim();

function asPrompt(messages: AiMessage[]) {
  return messages.map(message => message.role.toUpperCase() + ":\n" + message.content).join("\n\n");
}

async function callOllama(baseUrl: string, model: string, messages: AiMessage[], temperature: number) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (baseUrl === cloudBaseUrl) {
    if (!apiKey) throw new Error("OLLAMA_API_KEY is not configured.");
    headers.authorization = "Bearer " + apiKey;
  }
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, stream: false, format: "json", options: { temperature } }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json() as { message?: { content?: string }; error?: string };
  if (!response.ok) throw new Error(data.error || "Ollama request failed with HTTP " + response.status);
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Ollama returned an empty response.");
  return content;
}

async function callGemini(messages: AiMessage[], responseSchema: JsonSchema, maxOutputTokens: number) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini fallback is not configured.");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(geminiModel()) + ":generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: asPrompt(messages) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        maxOutputTokens
      }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Gemini fallback failed with HTTP " + response.status);
  const content = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
  if (!content) throw new Error("Gemini fallback returned an empty response.");
  return content;
}

export async function generateAiJson(options: GenerateOptions) {
  const attempts: Array<{ provider: string; model: string; run: () => Promise<string> }> = [];
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (apiKey) attempts.push({ provider: "OLLAMA_CLOUD", model: cloudModel(), run: () => callOllama(cloudBaseUrl, cloudModel(), options.messages, options.temperature ?? 0.2) });
  const localUrl = localBaseUrl();
  if (localUrl) attempts.push({ provider: "LOCAL_OLLAMA", model: localModel(), run: () => callOllama(localUrl, localModel(), options.messages, options.temperature ?? 0.2) });
  if (process.env.GEMINI_API_KEY?.trim()) attempts.push({ provider: "GOOGLE_GEMINI", model: geminiModel(), run: () => callGemini(options.messages, options.responseSchema, options.maxOutputTokens ?? 700) });
  if (!attempts.length) throw new Error("AI is not configured. Add OLLAMA_API_KEY and OLLAMA_CLOUD_MODEL in Render; configure GEMINI_API_KEY for fallback.");
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const raw = await attempt.run();
      return { raw, provider: attempt.provider, model: attempt.model, fallbackUsed: failures.length > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      failures.push(attempt.provider + ": " + message);
      console.warn("[ai-provider] provider failed", { task: options.task, provider: attempt.provider, error: message });
    }
  }
  throw new Error("All configured AI providers failed. " + failures.join(" | "));
}

async function probeOllama(baseUrl: string, model: string, apiKey?: string) {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.authorization = "Bearer " + apiKey;
    const response = await fetch(baseUrl + "/api/tags", { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { reachable: false, modelAvailable: false };
    const data = await response.json() as { models?: Array<{ name?: string }> };
    return { reachable: true, modelAvailable: (data.models ?? []).some(item => item.name === model || item.name === model + ":latest") };
  } catch {
    return { reachable: false, modelAvailable: false };
  }
}

export async function getAiProviderStatus() {
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  const cloudModelName = cloudModel();
  const cloud = apiKey ? await probeOllama(cloudBaseUrl, cloudModelName, apiKey) : { reachable: false, modelAvailable: false };
  const localUrl = localBaseUrl();
  const local = localUrl ? await probeOllama(localUrl, localModel()) : { reachable: false, modelAvailable: false };
  const primaryReady = cloud.reachable && cloud.modelAvailable;
  const fallbackConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const localReady = local.reachable && local.modelAvailable;
  return {
    configured: Boolean(apiKey || localUrl || fallbackConfigured),
    reachable: primaryReady || localReady,
    modelInstalled: primaryReady || localReady,
    provider: primaryReady ? "OLLAMA_CLOUD" : localReady ? "LOCAL_OLLAMA" : "UNAVAILABLE",
    model: primaryReady ? cloudModelName : localModel(),
    cloud: { configured: Boolean(apiKey), ...cloud, model: cloudModelName },
    local: { configured: Boolean(localUrl), ...local, model: localModel() },
    fallback: { provider: "GOOGLE_GEMINI", configured: fallbackConfigured, model: geminiModel() },
    message: primaryReady
      ? "Ollama Cloud is ready."
      : localReady
        ? "Cloud Ollama is not ready; local Ollama is available."
        : fallbackConfigured
          ? "Ollama is unavailable; Gemini fallback is configured."
          : "No AI provider is currently reachable. Configure Ollama Cloud and Gemini fallback."
  };
}
