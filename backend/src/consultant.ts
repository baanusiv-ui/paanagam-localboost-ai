import { z } from "zod";
import { env } from "./env.js";

type ReportInsight = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  title: string;
  finding: string;
  evidence: { source: string; recordIds: string[]; dateRange?: { from: string; to: string }; calculation: string };
  recommendation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};
type IntelligenceReport = {
  engine: string;
  generatedAt: string;
  dataStatus: string;
  recordCount: number;
  sourcePolicy: string;
  insights: ReportInsight[];
};

const outputSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(1200),
  recommendations: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    priority: z.enum(["HIGH", "MEDIUM", "INFO"]),
    action: z.string().trim().min(1).max(700),
    reason: z.string().trim().min(1).max(700),
    evidenceIds: z.array(z.string().min(1).max(100)).max(10),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"])
  }).strict()).max(5)
}).strict();

const localBaseUrl = () => env.OLLAMA_BASE_URL.replace(/\/$/, "");
const localModel = () => env.OLLAMA_MODEL.trim();
const ollamaHeaders = () => ({
  "content-type": "application/json",
  ...(env.OLLAMA_ACCESS_CLIENT_ID && env.OLLAMA_ACCESS_CLIENT_SECRET ? {
    "CF-Access-Client-Id": env.OLLAMA_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.OLLAMA_ACCESS_CLIENT_SECRET
  } : {})
});

export function buildConsultantMessages(report: IntelligenceReport, language: "Tamil" | "English" | "Tamil + English") {
  const compactReport = {
    engine: report.engine,
    generatedAt: report.generatedAt,
    dataStatus: report.dataStatus,
    recordCount: report.recordCount,
    sourcePolicy: report.sourcePolicy,
    insights: report.insights.map(item => ({
      id: item.id,
      priority: item.priority,
      title: item.title,
      finding: item.finding,
      source: item.evidence.source,
      recordIds: item.evidence.recordIds,
      dateRange: item.evidence.dateRange ?? null,
      calculation: item.evidence.calculation,
      existingRecommendation: item.recommendation,
      confidence: item.confidence
    }))
  };
  return [
    {
      role: "system",
      content: [
        "You are Paanagam LocalBoost's evidence-grounded small-business growth consultant.",
        "Explain the supplied deterministic report; do not recalculate or change any numeric result.",
        "Use only facts, dates, names and numbers explicitly present in the report. Never invent sales, rankings, search volumes, competitor facts, causes or forecasts.",
        "If evidence is missing or owner-entered, state that limitation clearly. Do not treat owner-entered data as POS-verified or Google-verified.",
        "Recommend practical next steps for a local Indian cafe/QSR, but clearly separate evidence from assumptions.",
        "Do not publish, schedule, message, edit a profile, change prices or perform any external action.",
        "Return JSON only with keys executiveSummary and recommendations. Each recommendation must contain title, priority (HIGH|MEDIUM|INFO), action, reason, evidenceIds (only IDs supplied below), and confidence (HIGH|MEDIUM|LOW). Maximum five recommendations.",
        "Response language: " + language + ". For Tamil + English, use natural Tamil first with concise English clarification."
      ].join(" ")
    },
    { role: "user", content: JSON.stringify(compactReport) }
  ];
}

export function parseConsultantOutput(raw: string, allowedEvidenceIds: string[]) {
  const parsed = outputSchema.parse(JSON.parse(raw));
  const allowed = new Set(allowedEvidenceIds);
  return {
    executiveSummary: parsed.executiveSummary,
    recommendations: parsed.recommendations.map(item => ({
      ...item,
      evidenceIds: item.evidenceIds.filter(id => allowed.has(id))
    }))
  };
}

export async function getLocalAiStatus() {
  const baseUrl = localBaseUrl();
  const model = localModel();
  if (!baseUrl) {
    return {
      configured: false, reachable: false, modelInstalled: false, model,
      message: "Local AI is not configured. Set OLLAMA_BASE_URL in backend/.env and restart the API."
    };
  }
  try {
    const response = await fetch(baseUrl + "/api/tags", { headers: ollamaHeaders(), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Ollama returned HTTP " + response.status);
    const data = await response.json() as { models?: Array<{ name?: string }> };
    const installed = (data.models ?? []).some(item => item.name === model || item.name === model + ":latest");
    return {
      configured: true, reachable: true, modelInstalled: installed, model,
      message: installed ? "Local Ollama model is ready." : "Ollama is running, but the model is not installed. Run: ollama pull " + model
    };
  } catch {
    return {
      configured: true, reachable: false, modelInstalled: false, model,
      message: "Cannot reach Ollama. Check the Windows tunnel, Cloudflare Access credentials, and OLLAMA_BASE_URL."
    };
  }
}

export async function generateLocalConsultant(report: IntelligenceReport, language: "Tamil" | "English" | "Tamil + English") {
  const baseUrl = localBaseUrl();
  const model = localModel();
  if (!baseUrl) throw new Error("Local AI is not configured. Set OLLAMA_BASE_URL in backend/.env and restart the API.");
  const messages = buildConsultantMessages(report, language);
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: ollamaHeaders(),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0.2 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await response.json() as { message?: { content?: string }; error?: string };
  if (!response.ok) throw new Error(data.error || "Local Ollama request failed with HTTP " + response.status);
  const content = data.message?.content;
  if (!content) throw new Error("Local AI returned an empty response. Try again or check the model.");
  const allowedIds = report.insights.flatMap(item => item.evidence.recordIds);
  const result = parseConsultantOutput(content, allowedIds);
  return {
    ...result,
    provider: "LOCAL_OLLAMA",
    model,
    language,
    generatedAt: new Date().toISOString(),
    disclaimer: "AI explanation only. Calculations and evidence remain from the rules engine. Suggestions require owner approval; no action was executed."
  };
}
