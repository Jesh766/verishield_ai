import type { FaceMatchResult, ScreeningResult } from "@/lib/verishield";
import { DISCLAIMER, DOC_LABEL, FIELD_LABEL } from "@/lib/verishield";

export type Stage =
  | "login"
  | "capture"
  | "working"
  | "extraction"
  | "ai"
  | "risk"
  | "assistant"
  | "recorded";

export const LS_BADGE = "vs_badge";
export const LS_CP = "vs_cp";

export const CHECKPOINTS = [
  { value: "CP-ALPHA", label: "Alpha — Main Gate" },
  { value: "CP-BRAVO", label: "Bravo — Cargo Bay" },
  { value: "CP-CHARLIE", label: "Charlie — Pedestrian Transit" },
  { value: "CP-DELTA", label: "Delta — Perimeter Security" },
];

export const DECISIONS = [
  {
    key: "cleared",
    label: "Accept",
    icon: "check",
    cls: "border-status-pass text-status-pass hover:bg-[rgba(16,185,129,0.1)]",
  },
  {
    key: "referred",
    label: "Flag Review",
    icon: "flag",
    cls: "bg-primary-container text-on-primary-container hover:opacity-90",
  },
  {
    key: "rejected",
    label: "Reject",
    icon: "block",
    cls: "border-status-fail text-status-fail hover:bg-[rgba(239,68,68,0.1)]",
  },
] as const;

/* ─── Offline TF-IDF intent matcher ───────────────────────────────────────── */
export function matchQuery(
  q: string,
  result: ScreeningResult | null,
  face: FaceMatchResult | null,
): string {
  if (!result) return "No active session. Capture a document to begin.";
  const ql = q.toLowerCase();

  if (/\brisk|score|danger|threat/.test(ql)) {
    const c = result.risk.contributions;
    const intro = `Risk score: ${result.risk.score}/100  ·  Band: ${result.risk.band.toUpperCase()}.  ${result.risk.recommendation}`;
    if (!c.length) return intro + "  No specific risk factors flagged.";
    return (
      intro +
      "\n\nFactors:\n" +
      c.map((x) => `• ${x.label} (+${x.points} pts, ${x.kind}): ${x.detail}`).join("\n")
    );
  }
  if (/\bface|biometric|match|similar|person/.test(ql)) {
    if (!face || face.verdict === "no_face")
      return "Face match not yet performed. Open the AI Assessment tab and capture the holder's face.";
    return `Face similarity: ${face.score}%  ·  Verdict: ${face.verdict.toUpperCase()}\n${face.detail}\nMethod: ${face.method}`;
  }
  if (/\btamper|ela|integrity|edit|forge|manipulat/.test(ql)) {
    const t = result.tamper;
    return `Tamper likelihood: ${t.score}%  ·  ${t.verdict.toUpperCase()}\n${t.detail}\nHotspots: ${t.hotspots}  ·  Mean error: ${t.meanError.toFixed(2)}  ·  Outlier ratio: ${t.outlierRatio.toFixed(3)}`;
  }
  if (/\bchecksum|verhoeff|mrz|format|structural|valid/.test(ql)) {
    const failed = result.checks.filter((c) => c.passed === false);
    const unknown = result.checks.filter((c) => c.passed === null);
    if (!failed.length && !unknown.length) return "All structural checks passed.";
    return [
      failed.length ? `Failed (${failed.length}): ${failed.map((c) => c.label).join(", ")}` : "",
      unknown.length
        ? `Could not run (${unknown.length}): ${unknown.map((c) => c.label).join(", ")}`
        : "",
      failed[0]?.detail ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (/\bname|dob|birth|gender|address|age/.test(ql)) {
    const f = result.ocr.fields;
    const hits = Object.entries(f).filter(([k]) => /name|dob|birth|gender|address|age/.test(k));
    if (!hits.length) return "Those fields were not extracted. Recapture with better lighting.";
    return hits.map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${v}`).join("\n");
  }
  if (/\btype|doc|document|kind|what is/.test(ql)) {
    return `Document: ${DOC_LABEL[result.documentType]}  ·  Classification confidence: ${result.ocr.classification.confidence}%\n${result.ocr.classification.evidence[0] ?? ""}`;
  }
  if (/\breason|why|cause|explain|factor|behind/.test(ql)) {
    if (!result.risk.contributions.length) return "No risk factors were flagged for this document.";
    return result.risk.contributions
      .map((c) => `• ${c.label} (+${c.points}): ${c.detail}`)
      .join("\n");
  }
  if (/\brecommend|action|next|proceed|decision|should/.test(ql)) {
    return `Recommendation: ${result.risk.recommendation}\nRisk band: ${result.risk.band.toUpperCase()}.\n\nThe officer always makes the final decision — the system never auto-accepts or auto-rejects.`;
  }
  if (/\bocr|confidence|quality|capture|image/.test(ql)) {
    const r = result.ocr;
    return `OCR confidence: ${r.confidence}%  ·  ${r.wordCount} tokens extracted.${r.repairs.length ? `\nMRZ glyph repairs: ${r.repairs.join(", ")}.` : ""}`;
  }
  return 'I can answer questions about: risk score, face match, tamper analysis, checksums, extracted fields, or recommendations.\n\nTry: "why is risk high", "face match result", "tamper score", "checksum status".';
}

/* ─── Status ticker config ────────────────────────────────────────────────── */
export type TickerCfg = { bg: string; text: string; icon: string; msg: string; spin?: boolean };
export function tickerFor(stage: Stage, band?: string): TickerCfg | null {
  switch (stage) {
    case "working":
      return {
        bg: "bg-primary-container",
        text: "text-on-primary-container",
        icon: "autorenew",
        msg: "STATUS: PROCESSING DOCUMENT",
        spin: true,
      };
    case "extraction":
      return {
        bg: "bg-primary-container",
        text: "text-on-primary-container",
        icon: "document_scanner",
        msg: "STATUS: VALIDATING — REVIEW EXTRACTED DATA",
      };
    case "ai":
      return {
        bg: "bg-primary-container",
        text: "text-on-primary-container",
        icon: "smart_toy",
        msg: "STATUS: AI ASSESSMENT IN PROGRESS",
      };
    case "risk":
      if (band === "escalate")
        return {
          bg: "bg-[rgba(239,68,68,0.15)] border border-status-fail",
          text: "text-status-fail",
          icon: "warning",
          msg: "STATUS: ESCALATE — HIGH RISK DETECTED",
        };
      if (band === "review")
        return {
          bg: "bg-[rgba(245,158,11,0.15)] border border-status-warn",
          text: "text-status-warn",
          icon: "warning",
          msg: "STATUS: REVIEW REQUIRED",
        };
      return {
        bg: "bg-[rgba(16,185,129,0.12)] border border-status-pass",
        text: "text-status-pass",
        icon: "check_circle",
        msg: "STATUS: CLEARANCE VERIFIED — PROCEED",
      };
    case "assistant":
      return {
        bg: "bg-surface-container-high",
        text: "text-on-surface-variant",
        icon: "smart_toy",
        msg: "AI ASSISTANT CONSOLE · OFFLINE MODE",
      };
    case "recorded":
      return {
        bg: "bg-[rgba(16,185,129,0.12)] border border-status-pass",
        text: "text-status-pass",
        icon: "task_alt",
        msg: "STATUS: DECISION RECORDED",
      };
    default:
      return null;
  }
}
