import type { FaceMatchResult, ScreeningResult } from "@/lib/verishield";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { DECISIONS } from "./screeningUtils";

export function RiskStage({
  result,
  face,
  note,
  onNote,
  onCommit,
  onReset,
}: {
  result: ScreeningResult;
  face: FaceMatchResult | null;
  note: string;
  onNote: (n: string) => void;
  onCommit: (d: "cleared" | "referred" | "rejected") => void;
  onReset: () => void;
}) {
  const r = result.risk;
  const circ = 2 * Math.PI * 45; // r=45
  const offset = circ * (1 - r.score / 100);
  const gaugeColor = r.band === "clear" ? "#10b981" : r.band === "review" ? "#f59e0b" : "#ef4444";

  const heroConfig =
    r.band === "clear"
      ? {
          bg: "bg-emerald-950/80 border-emerald-500/80 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.25)]",
          badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          icon: CheckCircle2,
          headlineText: "SAFE — LOW RISK VERDICT",
          bandText: "CLEAR / LOW RISK",
        }
      : r.band === "review"
        ? {
            bg: "bg-amber-950/80 border-amber-500/80 text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.25)]",
            badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
            icon: AlertTriangle,
            headlineText: "FLAGGED — OFFICER REVIEW REQUIRED",
            bandText: "REVIEW REQUIRED",
          }
        : {
            bg: "bg-red-950/90 border-red-500 text-red-400 animate-pulse shadow-[0_0_35px_rgba(239,68,68,0.4)]",
            badgeBg: "bg-red-500/20 text-red-300 border-red-500/40",
            icon: ShieldAlert,
            headlineText: "HIGH RISK — ESCALATE FOR SECONDARY SCREENING",
            bandText: "HIGH RISK / ESCALATE",
          };
  const HeroIcon = heroConfig.icon;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold text-on-surface">Risk Assessment &amp; Decision</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            The system never accepts or rejects. Record your decision below.
          </p>
        </div>
        <span className="font-mono text-xs text-on-surface-variant/80 bg-surface-container px-3 py-1 rounded border border-outline-variant shrink-0">
          Case ID: <strong className="text-on-surface">{result.sessionId}</strong>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 flex flex-col gap-6 max-w-5xl mx-auto w-full transition-all duration-300">
        {/* Dominant Verdict Hero Banner — visually dominant across a room */}
        <div
          className={`w-full rounded-xl border-2 p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 ${heroConfig.bg} transition-all duration-300`}
        >
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <div className="rounded-full p-3 bg-background/60 border border-current shrink-0">
              <HeroIcon className="h-8 w-8 md:h-10 md:w-10" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1">
                <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${heroConfig.badgeBg}`}>
                  {heroConfig.bandText}
                </span>
                <span className="text-xs font-mono opacity-90 font-bold">RISK SCORE: {r.score}/100</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase leading-none">
                {heroConfig.headlineText}
              </h2>
              <p className="text-xs md:text-sm opacity-90 mt-1">{r.headline}</p>
            </div>
          </div>
        </div>

        <div aria-live={r.band === "escalate" ? "assertive" : "polite"} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Risk gauge */}
          <div className="bg-surface-container border border-outline-variant rounded-lg p-6 md:p-8 flex flex-col items-center">
            <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant mb-6">
              RISK ASSESSMENT SCORE
            </p>
            <div
              aria-label={`Risk Assessment Score: ${r.score} out of 100`}
              className="relative w-44 h-44 flex items-center justify-center"
            >
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={`${gaugeColor}22`}
                  strokeWidth="9"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={gaugeColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  className="gauge-fill transition-[stroke-dashoffset] duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="font-mono font-bold text-on-surface"
                  style={{ fontSize: 44, lineHeight: 1 }}
                >
                  {r.score}
                </span>
                <span className="font-mono text-sm text-on-surface-variant mt-1">/ 100</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant bg-surface-container-high">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: gaugeColor, boxShadow: `0 0 8px ${gaugeColor}80` }}
              />
              <span className="font-mono text-[11px] font-bold tracking-widest text-on-surface">
                {r.band === "clear"
                  ? "LOW RISK"
                  : r.band === "review"
                    ? "REVIEW REQUIRED"
                    : "HIGH RISK"}
              </span>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="bg-surface-container border border-outline-variant rounded-lg p-6 flex flex-col gap-4">
            <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
              RISK FACTOR BREAKDOWN
            </p>
            {r.contributions.length === 0 ? (
              <p className="text-sm text-on-surface-variant my-auto">
                No risk factors flagged. Document checks clean.
              </p>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto max-h-60 pr-1">
                {r.contributions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 p-3 bg-surface-container-high border border-outline-variant/60 rounded"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant uppercase">
                          {c.kind}
                        </span>
                        <span className="text-xs font-semibold text-on-surface">{c.label}</span>
                      </div>
                      <p className="text-[12px] text-on-surface-variant mt-1">{c.detail}</p>
                    </div>
                    <span className="font-mono text-xs font-bold text-status-fail shrink-0">
                      +{c.points}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {face && face.verdict !== "no_face" && (
              <div className="mt-auto pt-3 border-t border-outline-variant flex justify-between items-center text-xs font-mono">
                <span className="text-on-surface-variant">Biometric similarity</span>
                <span
                  className={
                    face.verdict === "match"
                      ? "text-status-pass font-bold"
                      : face.verdict === "mismatch"
                        ? "text-status-fail font-bold"
                        : "text-status-warn font-bold"
                  }
                >
                  {face.score}% · {face.verdict.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Officer Action Bar */}
        <div className="bg-surface-container border border-outline-variant rounded-lg p-6 flex flex-col gap-4">
          <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
            OFFICER DECISION RECORD
          </p>

          <input
            type="text"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Add optional operational note (e.g. secondary inspection passed, supervisor notified)…"
            className="h-12 bg-background border border-outline-variant rounded px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary-container focus:outline-none transition-all font-mono"
          />

          <div className="grid grid-cols-3 gap-4">
            {DECISIONS.map((d) => (
              <button
                key={d.key}
                onClick={() => onCommit(d.key)}
                className={`h-14 border rounded flex items-center justify-center gap-2 transition-all ${d.cls}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  {d.icon}
                </span>
                <span className="font-mono text-xs font-bold tracking-widest uppercase">
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={onReset}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ← Discard and start new screening
          </button>
        </div>
      </div>
    </div>
  );
}
