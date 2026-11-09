export type LocalSeoInput = {
  businessName: string;
  category?: string;
  locality: string;
  services: string[];
  language: "Tamil" | "English" | "Tamil + English";
};

export type LocalSeoKeyword = {
  keyword: string;
  language: "Tamil" | "English";
  intent: "LOCAL_DISCOVERY" | "PRODUCT_SERVICE" | "BRANDED";
  relevance: "HIGH" | "MEDIUM";
  suggestedPlacement: string[];
  source: "RULES_GENERATED";
};

const clean = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 120);

export function generateLocalKeywords(input: LocalSeoInput): LocalSeoKeyword[] {
  const locality = clean(input.locality);
  const businessName = clean(input.businessName);
  const category = clean(input.category || "");
  const services = [...new Set(input.services.map(clean).filter(Boolean))].slice(0, 8);
  if (!locality || !services.length) return [];

  const output: LocalSeoKeyword[] = [];
  const add = (keyword: string, language: "Tamil" | "English", intent: LocalSeoKeyword["intent"], relevance: LocalSeoKeyword["relevance"]) => {
    const value = clean(keyword);
    if (!value || output.some(item => item.keyword.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    output.push({
      keyword: value,
      language,
      intent,
      relevance,
      suggestedPlacement: intent === "BRANDED"
        ? ["Business description", "Website title"]
        : intent === "PRODUCT_SERVICE"
          ? ["Services or products", "Website page", "Google profile description"]
          : ["Google profile description", "Website title", "Local content"],
      source: "RULES_GENERATED"
    });
  };

  for (const service of services) {
    if (input.language !== "Tamil") {
      add(`${service} in ${locality}`, "English", "LOCAL_DISCOVERY", "HIGH");
      add(`best ${service} in ${locality}`, "English", "LOCAL_DISCOVERY", "HIGH");
      add(`${service} near me`, "English", "LOCAL_DISCOVERY", "MEDIUM");
      add(`${service} ${locality}`, "English", "PRODUCT_SERVICE", "HIGH");
    }
    if (input.language !== "English") {
      add(`${locality} ${service}`, "Tamil", "LOCAL_DISCOVERY", "HIGH");
      add(`${service} ${locality}`, "Tamil", "PRODUCT_SERVICE", "HIGH");
      add(`${locality} ${service} கடை`, "Tamil", "LOCAL_DISCOVERY", "MEDIUM");
    }
  }
  if (category && input.language !== "Tamil") {
    add(`${category} in ${locality}`, "English", "LOCAL_DISCOVERY", "MEDIUM");
  }
  if (businessName) {
    for (const service of services.slice(0, 3)) {
      add(`${businessName} ${service}`, input.language === "Tamil" ? "Tamil" : "English", "BRANDED", "HIGH");
    }
  }
  return output.slice(0, 30);
}
