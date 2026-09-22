/**
 * Advisory risk score.
 *
 * Weighted evidence aggregation across the deterministic checks, the ELA
 * tamper classifier, the face matcher and capture quality. It produces a
 * recommendation band, never a decision — the officer records the outcome.
 */

import type { CheckItem } from "./checksum";
import type { TamperResult } from "./ela";
import type { FaceMatchResult } from "./face";

export type RiskBand = "clear" | "review" | "escalate";

export type RiskContribution = {
  source: string;
  label: string;
  points: number;
  detail: string;
  kind: "deterministic" | "ai";
};

export type RiskResult = {
  score: number;
  band: RiskBand;
  headline: string;
  primaryReason: string | null;
  recommendation: string;
  contributions: RiskContribution[];
};

export function scoreRisk(input: {
  checks: CheckItem[];
  ocrConfidence: number;
  tamper?: TamperResult | null;
  face?: FaceMatchResult | null;
}): RiskResult {
  const contributions: RiskContribution[] = [];
  let score = 0;

  const failed = input.checks.filter((c) => c.passed === false);
  const unknown = input.checks.filter((c) => c.passed === null);

  // A failed check only carries full weight when the reading behind it is
  // trustworthy. On a blurred or glared capture the same failure is far more
  // likely to be a misread than a forgery, so it is weighted down and said so.
  const confident = !input.ocrConfidence || input.ocrConfidence >= 62;
  for (const check of failed) {
    const critical = /verhoeff|composite|number_cd|dl_format/.test(check.check);
    const points = critical ? (confident ? 45 : 26) : confident ? 18 : 10;
    score += points;
    contributions.push({
      source: check.check,
      label: `${check.label} failed`,
      points,
      detail: confident
        ? check.detail
        : `${check.detail} Capture quality was low, so this may be a misread — recapture before treating it as an alteration.`,
      kind: "deterministic",
    });
  }

  if (unknown.length) {
    const points = 12;
    score += points;
    contributions.push({
      source: "unreadable_fields",
      label: `${unknown.length} check${unknown.length > 1 ? "s" : ""} could not run`,
      points,
      detail: "Fields were not readable from the capture. Recapture usually resolves this.",
      kind: "deterministic",
    });
  }

  if (input.ocrConfidence && input.ocrConfidence < 60) {
    const points = input.ocrConfidence < 40 ? 14 : 7;
    score += points;
    contributions.push({
      source: "capture_quality",
      label: "Low capture quality",
      points,
      detail: `Recognition confidence was ${input.ocrConfidence}%. Glare, blur or angle reduce every downstream check.`,
      kind: "ai",
    });
  }

  if (input.tamper) {
    const t = input.tamper;
    // Below the "clean" threshold the ELA reading is noise, not evidence.
    // Photographing a printed card already re-compresses it; only a clearly
    // localised anomaly counts as evidence.
    const points = t.score >= 45 && t.hotspots >= 3 ? Math.round((t.score / 100) * 34) : 0;
    if (points > 0) {
      score += points;
      contributions.push({
        source: "ela_tamper",
        label: `Tamper likelihood ${t.score}%`,
        points,
        detail: t.headline,
        kind: "ai",
      });
    }
  }

  if (input.face) {
    const f = input.face;
    if (f.verdict === "mismatch") {
      score += 35;
      contributions.push({
        source: "face_match",
        label: `Face match ${f.score}%`,
        points: 35,
        detail: f.headline,
        kind: "ai",
      });
    } else if (f.verdict === "possible") {
      score += 15;
      contributions.push({
        source: "face_match",
        label: `Face match ${f.score}% — borderline`,
        points: 15,
        detail: f.headline,
        kind: "ai",
      });
    } else if (f.verdict === "no_face") {
      score += 10;
      contributions.push({
        source: "face_match",
        label: "Face comparison could not run",
        points: 10,
        detail: f.headline,
        kind: "ai",
      });
    } else {
      contributions.push({
        source: "face_match",
        label: `Face match ${f.score}%`,
        points: 0,
        detail: f.headline,
        kind: "ai",
      });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const band: RiskBand = score >= 55 ? "escalate" : score >= 22 ? "review" : "clear";

  const sorted = contributions.sort((a, b) => b.points - a.points);
  const primaryReason = sorted[0];

  // The headline is the single most important piece of text on this screen —
  // it must say WHY, not just WHAT band. A generic "escalate to secondary
  // inspection" tells the officer something is wrong without telling them
  // what, which is exactly the gap that made a real, itemized `contributions`
  // list feel useless in practice: the reason was there, just never promoted
  // to where anyone would read it first.
  const bandLabel = {
    clear: "No blocking anomalies detected",
    review: "Manual review recommended",
    escalate: "Escalate to secondary inspection",
  }[band];
  const headline =
    band === "clear" || !primaryReason ? bandLabel : `${bandLabel} — ${primaryReason.label}`;

  return {
    score,
    band,
    headline,
    primaryReason: primaryReason?.label ?? null,
    recommendation: {
      clear:
        "Every check that could run, passed. Confirm the holder visually and record your decision.",
      review:
        "Some evidence is weak or unreadable. Recapture or ask a clarifying question before deciding.",
      escalate:
        "At least one strong signal failed. Refer for secondary inspection — do not clear on this screen alone.",
    }[band],
    contributions: sorted,
  };
}
