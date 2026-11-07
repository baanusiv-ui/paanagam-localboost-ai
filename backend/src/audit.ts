import { Evidence, EvidenceSource } from "@prisma/client";

const checklist = [
  { key: "business_name", label: "Business name", group: "Identity" },
  { key: "primary_category", label: "Primary business category", group: "Identity" },
  { key: "address", label: "Business address", group: "Contact" },
  { key: "phone", label: "Business phone", group: "Contact" },
  { key: "website", label: "Website", group: "Digital presence" },
  { key: "business_hours", label: "Opening hours", group: "Operations" },
  { key: "business_photos", label: "Business photos", group: "Visual presence" },
  { key: "google_profile_access", label: "Authorised Google profile connection", group: "Connectivity" }
] as const;

type Finding = {
  key: string;
  label: string;
  group: string;
  status: "verified" | "owner_confirmed" | "observed" | "demo_only" | "missing";
  source: string | null;
  observedAt: string | null;
  recommendation: string;
};

export function buildAudit(evidence: Evidence[]) {
  const now = Date.now();
  const findings: Finding[] = checklist.map((item) => {
    const candidates = evidence
      .filter((entry) => entry.category === item.key && (!entry.expiresAt || entry.expiresAt.getTime() > now))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    const selected = candidates.find((entry) => entry.verified && entry.source === EvidenceSource.GOOGLE_API)
      ?? candidates.find((entry) => entry.verified && entry.source === EvidenceSource.OWNER_CONFIRMED)
      ?? candidates.find((entry) => entry.source === EvidenceSource.PUBLIC_OBSERVATION)
      ?? candidates.find((entry) => entry.source === EvidenceSource.DEMO);

    let status: Finding["status"] = "missing";
    if (selected?.source === EvidenceSource.GOOGLE_API && selected.verified) status = "verified";
    else if (selected?.source === EvidenceSource.OWNER_CONFIRMED && selected.verified) status = "owner_confirmed";
    else if (selected?.source === EvidenceSource.PUBLIC_OBSERVATION) status = "observed";
    else if (selected?.source === EvidenceSource.DEMO) status = "demo_only";

    const recommendation = status === "missing"
      ? `Add ${item.label.toLowerCase()} information from an appropriate source.`
      : status === "observed"
        ? `Confirm the observed ${item.label.toLowerCase()} with the business owner or an authorised source.`
        : status === "demo_only"
          ? `Replace demo ${item.label.toLowerCase()} data with real, attributable evidence.`
          : status === "owner_confirmed"
            ? `Owner-confirmed ${item.label.toLowerCase()}; connect an authorised source if independent verification is required.`
            : `${item.label} is present in authorised Google API evidence.`;

    return {
      key: item.key,
      label: item.label,
      group: item.group,
      status,
      source: selected?.source ?? null,
      observedAt: selected?.observedAt.toISOString() ?? null,
      recommendation
    };
  });

  const complete = findings.filter((item) => item.status === "verified" || item.status === "owner_confirmed").length;
  const completeness = Math.round((complete / checklist.length) * 100);
  return {
    engine: "rules-v1",
    completeness,
    status: findings.every((item) => item.status === "verified" || item.status === "owner_confirmed") ? "COMPLETED" as const : "INCOMPLETE" as const,
    scoreMeaning: "Percentage of checklist fields with current verified or owner-confirmed evidence. This is not a Google ranking, visibility, or performance score.",
    findings,
    evidenceIds: [...new Set(evidence.map((item) => item.id))]
  };
}