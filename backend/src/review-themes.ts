export type ReviewThemeKey = "SERVICE" | "FOOD_QUALITY" | "PRICE_VALUE" | "AMBIENCE_CLEANLINESS" | "STAFF" | "WAIT_TIME" | "OTHER";
export type ReviewSentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type ReviewThemeCount = { theme: ReviewThemeKey; count: number; positive: number; negative: number; neutral: number };
export type ReviewThemeAnalysis = {
  method: "BILINGUAL_KEYWORD_HEURISTIC";
  confidence: "LOW" | "MODERATE";
  sampleSize: number;
  textReviewCount: number;
  ratingOnlyCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  themes: ReviewThemeCount[];
  sentiment: { positive: number; negative: number; neutral: number };
  limitations: string[];
};

const themeTerms: Record<ReviewThemeKey, string[]> = {
  SERVICE: ["service", "சேவை", "சர்வீஸ்", "delivery", "டெலிவரி", "order", "ஆர்டர்"],
  FOOD_QUALITY: ["food", "taste", "tasty", "coffee", "tea", "fresh", "quality", "சுவை", "ருசி", "காபி", "தேநீர்", "சாப்பாடு", "உணவு", "தரம்", "சூடு"],
  PRICE_VALUE: ["price", "cost", "value", "expensive", "cheap", "விலை", "காசு", "செலவு", "மலிவு", "அதிகம்"],
  AMBIENCE_CLEANLINESS: ["ambience", "atmosphere", "clean", "cleanliness", "hygiene", "seating", "space", "சுத்தம்", "சுகாதாரம்", "சூழல்", "இடம்", "உட்கார"],
  STAFF: ["staff", "owner", "waiter", "polite", "rude", "friendly", "பணியாளர்", "ஊழியர்", "உரிமையாளர்", "மரியாதை", "நடத்தை"],
  WAIT_TIME: ["wait", "waiting", "delay", "late", "slow", "quick", "fast", "நேரம்", "தாமதம்", "காத்திருப்பு", "வேகம்"],
  OTHER: []
};
const positiveTerms = ["good", "great", "excellent", "best", "love", "nice", "delicious", "fresh", "friendly", "வேலை", "நன்று", "நல்ல", "அருமை", "சிறப்பு", "சுவையாக", "சந்தோஷம்", "மகிழ்ச்சி", "சுத்தமாக"];
const negativeTerms = ["bad", "worst", "poor", "terrible", "cold", "stale", "dirty", "rude", "expensive", "slow", "not good", "பிடிக்கவில்லை", "மோசம்", "சரியில்லை", "கெட்ட", "குளிர்", "அசுத்தம்", "தாமதம்", "அதிக விலை", "ஏமாற்றம்"];

function includesTerm(text: string, term: string) {
  if (/^[a-z0-9 ]+$/i.test(term)) return new RegExp("(^|[^a-z0-9])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i").test(text);
  return text.includes(term);
}
function countHits(text: string, terms: string[]) { return terms.reduce((n, term) => n + (includesTerm(text, term) ? 1 : 0), 0); }
function sentimentOf(text: string, rating?: number | null): ReviewSentiment {
  const positive = countHits(text, positiveTerms);
  const negative = countHits(text, negativeTerms);
  if (positive > negative) return "POSITIVE";
  if (negative > positive) return "NEGATIVE";
  if (positive === negative && rating && rating >= 4) return "POSITIVE";
  if (positive === negative && rating && rating <= 2) return "NEGATIVE";
  return "NEUTRAL";
}

export function analyzeReviewThemes(records: Array<{ reviewText?: unknown; rating?: unknown; reviewDate?: unknown }>): ReviewThemeAnalysis {
  const valid = records.map(record => ({
    text: typeof record.reviewText === "string" ? record.reviewText.trim().toLocaleLowerCase() : "",
    rating: typeof record.rating === "number" ? record.rating : typeof record.rating === "string" && record.rating.trim() ? Number(record.rating) : null,
    date: typeof record.reviewDate === "string" && !Number.isNaN(Date.parse(record.reviewDate)) ? record.reviewDate.slice(0, 10) : null
  }));
  const written = valid.filter(item => item.text.length > 0);
  const ratingOnlyCount = valid.length - written.length;
  const totals = { positive: 0, negative: 0, neutral: 0 };
  const themes = (Object.keys(themeTerms) as ReviewThemeKey[]).map(theme => ({ theme, count: 0, positive: 0, negative: 0, neutral: 0 }));
  for (const item of written) {
    const sentiment = sentimentOf(item.text, item.rating);
    totals[sentiment.toLowerCase() as "positive" | "negative" | "neutral"]++;
    const matched = (Object.keys(themeTerms) as ReviewThemeKey[]).filter(theme => theme !== "OTHER" && countHits(item.text, themeTerms[theme]) > 0);
    const selected = matched.length ? matched : ["OTHER" as const];
    for (const key of selected) {
      const row = themes.find(theme => theme.theme === key)!;
      row.count++;
      row[sentiment.toLowerCase() as "positive" | "negative" | "neutral"]++;
    }
  }
  const dates = valid.map(item => item.date).filter((date): date is string => Boolean(date)).sort();
  return {
    method: "BILINGUAL_KEYWORD_HEURISTIC",
    confidence: written.length >= 10 ? "MODERATE" : "LOW",
    sampleSize: valid.length,
    textReviewCount: written.length,
    ratingOnlyCount,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    themes: themes.filter(theme => theme.count > 0).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme)),
    sentiment: totals,
    limitations: [
      "Keyword matching is a transparent heuristic, not a trained sentiment model; sarcasm, spelling variants and context can be missed.",
      "A review can match more than one theme, so theme counts can exceed the number of written reviews.",
      "Sentiment uses simple bilingual cue words and rating as a tie-breaker; treat it as directional, not a customer satisfaction score.",
      "Rating-only reviews are counted in the sample but excluded from text-theme and text-sentiment analysis."
    ]
  };
}
