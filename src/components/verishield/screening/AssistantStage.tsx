import { DOC_LABEL, type FaceMatchResult, type ScreeningResult } from "@/lib/verishield";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchQuery } from "./screeningUtils";

export function AssistantStage({
  result,
  face,
  officer,
  onBack,
}: {
  result: ScreeningResult | null;
  face: FaceMatchResult | null;
  officer: { badge: string; checkpoint: string } | null;
  onBack: () => void;
}) {
  const [msgs, setMsgs] = useState<{ role: "ai" | "user"; text: string }[]>([
    {
      role: "ai" as const,
      text: result
        ? `System initialized. Case ${result.sessionId} loaded. Risk band: ${result.risk.band.toUpperCase()}. How can I assist?`
        : "System initialized. No active session — capture a document to begin.",
    },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(
    (q: string) => {
      if (!q.trim()) return;
      setMsgs((prev) => [
        ...prev,
        { role: "user" as const, text: q },
        { role: "ai" as const, text: matchQuery(q, result, face) },
      ]);
      setInput("");
    },
    [result, face],
  );

  const CHIPS = [
    { label: "Identity Only", q: "What fields were extracted?" },
    { label: "Tamper Check", q: "tamper score and verdict" },
    { label: "Face Match", q: "face match result" },
    { label: "Full Report", q: "recommendation and next action" },
  ];

  const r = result?.risk;
  const gaugeColor = !r
    ? "#a08e7a"
    : r.band === "clear"
      ? "#10b981"
      : r.band === "review"
        ? "#f59e0b"
        : "#ef4444";
  const circ = 2 * Math.PI * 45;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Left sidebar (desktop only) */}
      <aside className="hidden md:flex w-[360px] shrink-0 flex-col border-r border-outline-variant bg-surface-container-low overflow-y-auto p-6 gap-6">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant mb-3">
            CASE DETAILS
          </p>
          <div className="bg-background border border-outline-variant rounded p-4 flex flex-col gap-2">
            {[
              ["Case ID", result?.sessionId ?? "—"],
              ["Doc type", result ? DOC_LABEL[result.documentType] : "—"],
              ["Officer", officer?.badge ?? "—"],
              ["Checkpoint", officer?.checkpoint ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center">
                <span className="font-mono text-sm text-on-surface-variant">{k}</span>
                <span className="font-mono text-sm font-bold text-on-surface">{v}</span>
              </div>
            ))}
            {result && (
              <div className="flex justify-between items-center pt-1 border-t border-outline-variant mt-1">
                <span className="font-mono text-sm text-on-surface-variant">Status</span>
                <span
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border uppercase ${
                    r?.band === "clear"
                      ? "text-status-pass border-status-pass/40 bg-[rgba(16,185,129,0.1)]"
                      : r?.band === "review"
                        ? "text-status-warn border-status-warn/40 bg-[rgba(245,158,11,0.1)]"
                        : "text-status-fail border-status-fail/40 bg-[rgba(239,68,68,0.1)]"
                  }`}
                >
                  [{r?.band?.toUpperCase() ?? "—"}]
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Mini gauge */}
        {result && (
          <div>
            <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant mb-3">
              RISK GAUGE
            </p>
            <div className="bg-background border border-outline-variant rounded p-6 flex flex-col items-center gap-3">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke={`${gaugeColor}22`}
                    strokeWidth="10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke={gaugeColor}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - (r?.score ?? 0) / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono font-bold text-on-surface" style={{ fontSize: 22 }}>
                    {r?.score ?? 0}
                  </span>
                </div>
              </div>
              <span
                className="font-mono text-[12px] font-bold tracking-widest"
                style={{ color: gaugeColor }}
              >
                {r?.band === "clear" ? "LOW RISK" : r?.band === "review" ? "REVIEW" : "HIGH RISK"}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={onBack}
          className="h-12 w-full border border-outline-variant rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_back
          </span>
          Return to screening
        </button>
      </aside>

      {/* Chat */}
      <section className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Quick filters */}
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container shrink-0">
          <p className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant mb-3">
            AI ASSISTANT CONSOLE · OFFLINE TF-IDF MODE
          </p>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                onClick={() => send(c.q)}
                className="px-4 py-2 bg-surface-container-high border border-outline-variant rounded-full text-sm text-on-surface hover:border-primary-container hover:bg-surface-container-highest transition-all font-mono"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 fade-in ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className="w-9 h-9 rounded shrink-0 bg-surface-container-high border border-outline-variant flex items-center justify-center">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>
                  {m.role === "ai" ? "smart_toy" : "person"}
                </span>
              </div>
              <div
                className={`max-w-[78%] px-4 py-3 rounded text-sm leading-relaxed whitespace-pre-line border ${
                  m.role === "ai"
                    ? "bg-surface-container border-outline-variant text-on-surface rounded-tl-none"
                    : "bg-surface-container-high border-outline-variant/80 text-on-surface rounded-tr-none"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Type your query about this case…"
              className="flex-1 h-12 bg-background border border-outline-variant rounded px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary-container focus:border-2 focus:outline-none transition-all font-mono"
            />
            <button
              onClick={() => send(input)}
              className="w-12 h-12 bg-primary-container text-on-primary-container rounded flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                send
              </span>
            </button>
          </div>
          <p className="font-mono text-[10px] text-on-surface-variant/40 mt-2 tracking-widest">
            FULLY OFFLINE · NO QUERIES LEAVE THIS DEVICE · INTENT MATCHING ONLY
          </p>
        </div>

        {/* Mobile back button */}
        <div className="md:hidden border-t border-outline-variant px-6 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-on-surface-variant"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_back
            </span>
            Return to screening
          </button>
        </div>
      </section>
    </div>
  );
}
