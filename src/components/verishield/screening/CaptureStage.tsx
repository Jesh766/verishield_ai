import type { ScreeningResult } from "@/lib/verishield";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

export function CaptureStage({
  modelReady,
  error,
  recent,
  onCamera,
  onUpload,
}: {
  modelReady: boolean;
  error: string | null;
  recent: { id: string; band: string; type: string }[];
  onCamera: () => void;
  onUpload: () => void;
}) {
  const [docType, setDocType] = useState<string | null>(null);
  const DOCS = [
    { key: "aadhaar", label: "AADHAAR", icon: "badge" },
    { key: "passport", label: "PASSPORT", icon: "book" },
    { key: "dl", label: "DRIVING LICENCE", icon: "directions_car" },
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* ── Left action console ── */}
      <aside className="w-full md:w-[40%] bg-surface-container-low border-b md:border-b-0 md:border-r border-outline-variant flex flex-col p-6 gap-6 overflow-y-auto">
        {/* Status ticker (inline) */}
        <div className="bg-primary-container text-on-primary-container px-4 py-3 rounded flex items-center gap-2 font-mono text-xs font-bold tracking-widest">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            warning
          </span>
          STATUS: AWAITING DOCUMENT
        </div>

        <div>
          <h2 className="text-[18px] font-semibold text-on-surface mb-1">Select Document Type</h2>
          <p className="text-sm text-on-surface-variant">
            Optional — the engine auto-detects. Pre-select to guide extraction.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {DOCS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDocType(d.key === docType ? null : d.key)}
              className={`flex items-center gap-4 px-4 py-4 rounded border transition-all min-h-[48px] ${
                docType === d.key
                  ? "bg-surface-container-high border-primary-container text-primary"
                  : "bg-surface-container border-outline-variant text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {d.icon}
              </span>
              <span className="font-mono text-[12px] font-bold tracking-widest">{d.label}</span>
              {docType === d.key && (
                <span
                  className="material-symbols-outlined ms-fill text-primary ml-auto"
                  style={{ fontSize: 18 }}
                >
                  check_circle
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-on-surface-variant">
          <span
            className={`w-2 h-2 rounded-full ${modelReady ? "bg-status-pass" : "bg-status-warn"}`}
          />
          {modelReady ? "ENGINE READY" : "ENGINE LOADING…"}
        </div>
      </aside>

      {/* ── Right capture area ── */}
      <section className="flex-1 bg-background p-6 flex flex-col items-center justify-center gap-6 relative">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-surface-container border border-outline-variant px-6 py-2 rounded-full shadow-lg z-10">
          <p className="text-sm text-on-surface text-center">
            Place document flat · fill the frame · avoid glare
          </p>
        </div>

        {/* Capture box */}
        <button
          onClick={onCamera}
          className="group relative w-full max-w-sm aspect-[3/4] border-2 border-dashed border-outline-variant rounded-lg flex flex-col items-center justify-center bg-surface-container/30 hover:border-primary-container hover:bg-surface-container/50 transition-all overflow-hidden"
        >
          {/* Corner markers */}
          {[
            "-top-px -left-px border-t-2 border-l-2 rounded-tl-lg",
            "-top-px -right-px border-t-2 border-r-2 rounded-tr-lg",
            "-bottom-px -left-px border-b-2 border-l-2 rounded-bl-lg",
            "-bottom-px -right-px border-b-2 border-r-2 rounded-br-lg",
          ].map((c, i) => (
            <div key={i} className={`absolute w-8 h-8 ${c} border-primary-container`} />
          ))}

          <div
            className="bg-primary-container text-on-primary-container p-4 rounded-full mb-4 group-hover:scale-110 transition-transform"
            style={{ boxShadow: "0 0 20px rgba(245,158,11,0.4)" }}
          >
            <span className="material-symbols-outlined ms-fill" style={{ fontSize: 40 }}>
              photo_camera
            </span>
          </div>
          <h3 className="text-[18px] font-semibold text-on-surface tracking-wide">SCAN DOCUMENT</h3>
          <p className="text-xs text-on-surface-variant mt-1">Tap to open camera</p>

          {/* Scan line animation (shows on hover) */}
          <div className="scan-line opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <button
          onClick={onUpload}
          className="text-sm text-on-surface-variant border border-outline-variant px-5 py-2.5 rounded hover:bg-surface-container transition-colors"
        >
          Upload image instead
        </button>

        {error && (
          <div className="w-full max-w-sm px-4 py-3 rounded border border-status-fail/40 bg-[rgba(239,68,68,0.08)] text-status-fail text-xs font-mono">
            {error}
          </div>
        )}

        {/* Recent sessions */}
        {recent.length > 0 && (
          <div className="w-full max-w-sm mt-2">
            <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant mb-2">
              RECENT ON THIS DEVICE
            </p>
            <div className="flex flex-col gap-1">
              {recent.map((r) => (
                <Link
                  key={r.id}
                  to="/session/$id"
                  params={{ id: r.id }}
                  className="flex items-center justify-between px-3 py-2 rounded border border-outline-variant/60 bg-surface-container/50 hover:bg-surface-container transition-colors"
                >
                  <span className="font-mono text-[11px] text-on-surface-variant">{r.id}</span>
                  <span className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                    {r.type} · {r.band}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
