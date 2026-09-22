import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  ScanEye,
  ShieldAlert,
} from "lucide-react";
import { EvidenceChip } from "@/components/verishield/Chips";
import type { RiskResult } from "@/lib/verishield";

const TONE: Record<
  RiskResult["band"],
  { text: string; soft: string; border: string; label: string; icon: typeof CheckCircle2 }
> = {
  clear: {
    text: "text-verdict-pass",
    soft: "bg-verdict-pass-soft",
    border: "border-verdict-pass",
    label: "LOW RISK",
    icon: CheckCircle2,
  },
  review: {
    text: "text-verdict-warn",
    soft: "bg-verdict-warn-soft",
    border: "border-verdict-warn",
    label: "MEDIUM RISK",
    icon: AlertTriangle,
  },
  escalate: {
    text: "text-verdict-fail",
    soft: "bg-verdict-fail-soft",
    border: "border-verdict-fail",
    label: "HIGH RISK",
    icon: ShieldAlert,
  },
};

/** Best-effort icon per contribution source, purely visual grouping. */
function iconFor(source: string) {
  if (source === "face_match") return Fingerprint;
  if (source === "ela_tamper") return ScanEye;
  return FileSearch;
}

export function RiskBanner({ risk }: { risk: RiskResult }) {
  const tone = TONE[risk.band];
  const Icon = tone.icon;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference * (1 - risk.score / 100);

  return (
    <section aria-live={risk.band === "escalate" ? "assertive" : "polite"} className="flex flex-col gap-4">
      {/* Status ticker — the single most important line on the screen: it
          names WHY, not just the band, because a generic band label was the
          exact gap that made the itemized evidence below feel invisible. */}
      <div
        className={`flex w-full items-center justify-center gap-2 rounded border ${tone.border} ${tone.soft} px-4 py-3`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${tone.text}`} aria-hidden="true" />
        <span
          className={`text-center font-display text-[11px] font-bold uppercase tracking-widest ${tone.text}`}
        >
          {risk.headline}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Risk gauge panel */}
        <div className="flex flex-col items-center rounded-lg border border-field-line bg-field-surface p-6">
          <div className="w-full border-b border-field-line pb-2 text-center font-data text-[11px] font-bold uppercase tracking-widest text-field-ink-dim">
            Risk Assessment Score
          </div>
          <div
            aria-label={`Risk Assessment Score: ${risk.score} out of 100`}
            className="relative mt-6 flex h-40 w-40 items-center justify-center"
          >
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                strokeWidth="8"
                className="stroke-field-line"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className={`${tone.text} transition-[stroke-dashoffset] duration-700`}
                stroke="currentColor"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-data text-[40px] font-bold leading-none text-field-ink">
                {risk.score}
              </span>
              <span className="font-data text-xs text-field-ink-dim">/ 100</span>
            </div>
          </div>
          <div
            className={`mt-6 flex items-center gap-2 rounded-full border ${tone.border} ${tone.soft} px-4 py-2`}
          >
            <span
              className={`h-2 w-2 rounded-full ${tone.text}`}
              style={{ background: "currentColor" }}
              aria-hidden="true"
            />
            <span className={`font-data text-[11px] font-bold tracking-widest ${tone.text}`}>
              {tone.label}
            </span>
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-field-ink-dim">
            Advisory only — the officer decides. {risk.recommendation}
          </p>
        </div>

        {/* Verification log panel */}
        <div className="flex flex-col rounded-lg border border-field-line bg-field-surface p-5">
          <div className="border-b border-field-line pb-2 font-data text-[11px] font-bold uppercase tracking-widest text-field-ink-dim">
            Verification Log
          </div>
          {risk.contributions.length === 0 ? (
            <ul className="mt-3 flex flex-1 flex-col justify-center gap-2">
              <li className="flex items-start gap-3 rounded border border-field-line bg-field-deep p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verdict-pass" aria-hidden />
                <div>
                  <span className="block font-data text-xs text-field-ink">
                    Every check that ran, passed
                  </span>
                  <span className="text-[10px] text-field-ink-dim">No contributing signals</span>
                </div>
              </li>
            </ul>
          ) : (
            <ul className="mt-3 flex flex-1 flex-col gap-2">
              {risk.contributions.map((c, i) => {
                const RowIcon = iconFor(c.source);
                return (
                  <li
                    key={c.source}
                    className={`flex items-start gap-3 rounded border p-3 ${
                      i === 0 ? `${tone.border}/60 ${tone.soft}` : "border-field-line bg-field-deep"
                    }`}
                  >
                    <RowIcon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${i === 0 ? tone.text : "text-field-ink-dim"}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-data text-xs text-field-ink">
                          {i === 0 && (
                            <span className="mr-1.5 text-[9px] font-bold uppercase tracking-widest text-field-ink-dim">
                              Primary —
                            </span>
                          )}
                          {c.label}
                        </span>
                        <EvidenceChip ai={c.kind === "ai"}>
                          {c.kind === "ai" ? "AI" : "Deterministic"}
                        </EvidenceChip>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-field-ink-dim">
                        {c.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
