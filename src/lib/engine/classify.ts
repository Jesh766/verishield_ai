/**
 * Automatic document recognition.
 *
 * The officer no longer tells the system what they are holding. We score the
 * recognised text against per-document evidence (MRZ prefixes, issuing
 * vocabulary, number grammars) and pick the strongest match. Deterministic —
 * no model, no network.
 */

import type { DocumentType } from "./extract";

export type Classification = {
  type: DocumentType;
  confidence: number; // 0-100
  evidence: string[];
  alternatives: { type: DocumentType; confidence: number }[];
};

type Rule = { points: number; label: string; test: (t: string) => boolean };

const has = (re: RegExp) => (t: string) => re.test(t);

const RULES: Record<DocumentType, Rule[]> = {
  passport: [
    { points: 55, label: "TD3 machine-readable zone (P<)", test: has(/(^|\n)\s*P[<K][A-Z<]{3}/) },
    { points: 25, label: "Passport vocabulary", test: has(/\bPASSPORT\b/) },
    { points: 12, label: "Republic of India header", test: has(/REPUBLIC OF INDIA/) },
    { points: 10, label: "Passport number grammar", test: has(/\b[A-PR-WY][0-9]{7}\b/) },
  ],
  visa: [
    { points: 55, label: "MRV machine-readable zone (V<)", test: has(/(^|\n)\s*V[<A-Z][A-Z<]{2}/) },
    { points: 35, label: "Visa vocabulary", test: has(/\bVISA\b/) },
    {
      points: 15,
      label: "Visa control/entries wording",
      test: has(/\b(ENTRIES|CONTROL NO|VISA TYPE|DURATION OF STAY)\b/),
    },
    { points: 10, label: "Sticker category field", test: has(/\bCATEGORY\b/) },
  ],
  aadhaar: [
    {
      points: 40,
      label: "Aadhaar / UIDAI vocabulary",
      test: has(/\b(AADHAAR|ADHAAR|UIDAI|MERA AADHAAR)\b/),
    },
    { points: 25, label: "4-4-4 digit number block", test: has(/\b\d{4}\s?\d{4}\s?\d{4}\b/) },
    { points: 15, label: "Unique Identification Authority", test: has(/UNIQUE IDENTIFICATION/) },
    { points: 10, label: "Government of India header", test: has(/GOVERNMENT OF INDIA/) },
    { points: 8, label: "VID / enrolment wording", test: has(/\b(VID|ENROL+MENT)\b/) },
  ],
  dl: [
    {
      points: 40,
      label: "Driving licence vocabulary",
      test: has(/\b(DRIVING\s+LIC[EN]NC?E|DRIVING\s+LICENSE)\b/),
    },
    {
      points: 35,
      label: "RTO licence number grammar",
      test: has(/\b[A-Z]{2}[\s-]?\d{2}[\s-]?(19|20)\d{2}[\s-]?\d{6,7}\b/),
    },
    {
      points: 15,
      label: "Transport department wording",
      test: has(/\b(TRANSPORT|RTO|COV|LMV|MCWG)\b/),
    },
    { points: 10, label: "Validity classes", test: has(/\b(NT|TR)\b/) },
  ],
};

export const CLASSIFY_ORDER: DocumentType[] = ["passport", "visa", "aadhaar", "dl"];

export function classifyDocument(text: string): Classification {
  const t = text.toUpperCase();
  const scored = CLASSIFY_ORDER.map((type) => {
    const hits = RULES[type].filter((r) => r.test(t));
    const raw = hits.reduce((s, r) => s + r.points, 0);
    return { type, raw, evidence: hits.map((h) => h.label) };
  }).sort((a, b) => b.raw - a.raw);

  const best = scored[0]!;
  const runner = scored[1];
  const margin = best.raw - (runner?.raw ?? 0);
  const confidence = Math.max(0, Math.min(100, Math.round(best.raw * 0.75 + margin * 0.35)));

  return {
    type: best.raw === 0 ? "aadhaar" : best.type,
    confidence: best.raw === 0 ? 0 : confidence,
    evidence: best.evidence,
    alternatives: scored
      .slice(1)
      .filter((s) => s.raw > 0)
      .map((s) => ({ type: s.type, confidence: Math.round(s.raw * 0.75) })),
  };
}
