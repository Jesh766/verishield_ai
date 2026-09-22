import { EvidenceChip } from "@/components/verishield/Chips";
import type { FaceMatchResult, ScreeningResult } from "@/lib/verishield";

export function AiStage({
  result,
  face,
  faceBusy,
  onCaptureface,
  onFaceUpload,
  onContinue,
}: {
  result: ScreeningResult;
  face: FaceMatchResult | null;
  faceBusy: boolean;
  onCaptureface: () => void;
  onFaceUpload: () => void;
  onContinue: () => void;
}) {
  const t = result.tamper;
  const verdictColor = {
    match: "text-status-pass",
    possible: "text-status-warn",
    mismatch: "text-status-fail",
    no_face: "text-on-surface-variant",
  }[face?.verdict ?? "no_face"];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-lowest flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-on-surface">
            Automated Verification &amp; Image Forensics
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Computer Vision Evidence &amp; Document Integrity Analysis
          </p>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded font-semibold">
          ADVISORY RISK ASSESSMENT — Officer retains final decision authority
        </span>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Face match */}
        <div className="flex-1 lg:w-7/12 overflow-y-auto border-b lg:border-b-0 lg:border-r border-outline-variant">
          <div className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold tracking-widest text-secondary-fixed">
              BIOMETRIC VERIFICATION
            </span>
            <span className="font-mono text-[11px] bg-background text-secondary-fixed px-2 py-0.5 rounded border border-outline-variant">
              FACE MATCH
            </span>
          </div>
          <div aria-live="polite" className="p-6 flex flex-col gap-4">
            {/* Side-by-side portraits */}
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: "DOC PHOTO",
                  img: face?.documentThumb,
                  icon: "badge",
                  alt: "Normalised portrait from the document",
                },
                {
                  label: "LIVE CAPTURE",
                  img: face?.selfieThumb,
                  icon: "camera_front",
                  alt: "Normalised live capture of the holder",
                  isLive: true,
                },
              ].map((p) => (
                <div key={p.label} className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant text-center">
                    {p.label}
                  </span>
                  <div className="relative aspect-[3/4] border border-outline-variant bg-surface-container rounded overflow-hidden flex items-center justify-center">
                    {p.img ? (
                      <img src={p.img} alt={p.alt} className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="material-symbols-outlined text-on-surface-variant/30"
                        style={{ fontSize: 48 }}
                        aria-hidden="true"
                      >
                        {p.icon}
                      </span>
                    )}
                    {/* Corner brackets on live capture */}
                    {p.isLive && (
                      <>
                        {[
                          "top-0 left-0 border-t-2 border-l-2",
                          "top-0 right-0 border-t-2 border-r-2",
                          "bottom-0 left-0 border-b-2 border-l-2",
                          "bottom-0 right-0 border-b-2 border-r-2",
                        ].map((c, i) => (
                          <div key={i} className={`absolute w-5 h-5 ${c} border-primary/60`} aria-hidden="true" />
                        ))}
                        {p.img && <div className="scan-line" aria-hidden="true" />}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Result block */}
            {face && face.verdict !== "no_face" ? (
              <div className="bg-background border border-outline-variant rounded p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                  <span className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
                    ANALYSIS RESULT
                  </span>
                  <span className={`font-mono text-[20px] font-medium ${verdictColor}`}>
                    Similarity: {face.score}%
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined ms-fill mt-0.5 ${verdictColor}`}
                    style={{ fontSize: 20 }}
                    aria-hidden="true"
                  >
                    {face.verdict === "match"
                      ? "check_circle"
                      : face.verdict === "mismatch"
                        ? "cancel"
                        : "help"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{face.headline}</p>
                    <p className="text-[12px] text-on-surface-variant mt-0.5">{face.detail}</p>
                    <p className="font-mono text-[10px] text-on-surface-variant/60 mt-1">
                      {face.method}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onCaptureface}
                  disabled={faceBusy}
                  aria-label="Recapture holder's face for biometric verification"
                  className="mt-1 h-10 border border-outline-variant rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  {faceBusy ? "Comparing…" : "Recapture face"}
                </button>
              </div>
            ) : (
              <div className="bg-background border border-outline-variant rounded p-4">
                <p className="text-sm text-on-surface-variant mb-3">
                  Optional — capture the holder's live face to compare against the document photo.
                  Runs entirely on this device.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onCaptureface}
                    disabled={faceBusy}
                    aria-label="Capture holder's face for biometric verification"
                    className="flex-1 h-12 border border-primary/50 bg-primary/10 text-primary rounded font-semibold text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {faceBusy ? "Comparing…" : "Capture holder's face"}
                  </button>
                  <button
                    onClick={onFaceUpload}
                    disabled={faceBusy}
                    aria-label="Upload face image file for biometric verification"
                    className="h-12 px-4 border border-outline-variant rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Tamper check */}
        <div className="lg:w-5/12 flex flex-col overflow-hidden">
          <div className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold tracking-widest text-secondary-fixed">
              DOCUMENT INTEGRITY
            </span>
            <span className="font-mono text-[11px] bg-background text-secondary-fixed px-2 py-0.5 rounded border border-outline-variant">
              TAMPER CHECK
            </span>
          </div>
          <div aria-live="polite" className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            {/* ELA heatmap */}
            <div className="relative w-full aspect-video border border-outline-variant bg-surface-container rounded overflow-hidden group cursor-crosshair">
              <img
                src={t.heatmap}
                alt="Error level analysis heatmap of the captured document"
                className="w-full h-full object-cover opacity-70"
              />
              {/* Grid overlay */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(83,68,52,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(83,68,52,0.4) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/40">
                <span
                  className="material-symbols-outlined text-on-surface"
                  style={{ fontSize: 32 }}
                >
                  zoom_in
                </span>
              </div>
              <div className="absolute top-2 left-2 font-mono text-[9px] font-bold tracking-widest text-on-surface-variant/70 bg-background/60 px-2 py-0.5 rounded">
                ELA MAP
              </div>
            </div>

            {/* Result block */}
            <div
              className={`bg-background border rounded p-4 relative overflow-hidden ${
                t.verdict === "clean"
                  ? "border-status-pass/40"
                  : t.verdict === "suspicious" || t.verdict === "likely_edited"
                    ? "border-status-fail/40"
                    : "border-outline-variant"
              }`}
            >
              {/* Left accent bar */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${
                  t.verdict === "clean"
                    ? "bg-status-pass"
                    : t.verdict === "likely_edited"
                      ? "bg-status-fail"
                      : t.verdict === "suspicious"
                        ? "bg-status-warn"
                        : "bg-outline-variant"
                }`}
              />
              <div className="pl-3">
                <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-3">
                  <span className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
                    ANALYSIS RESULT
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      t.verdict === "clean"
                        ? "text-status-pass border-status-pass/40 bg-[rgba(16,185,129,0.1)]"
                        : t.verdict === "likely_edited"
                          ? "text-status-fail border-status-fail/40 bg-[rgba(239,68,68,0.1)]"
                          : t.verdict === "suspicious"
                            ? "text-status-warn border-status-warn/40 bg-[rgba(245,158,11,0.1)]"
                            : "text-on-surface-variant border-outline-variant"
                    }`}
                  >
                    [
                    {t.verdict === "clean"
                      ? "NO TAMPER DETECTED"
                      : t.verdict.replace("_", " ").toUpperCase()}
                    ]
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined ms-fill mt-0.5 ${t.verdict === "clean" ? "text-status-pass" : t.verdict === "likely_edited" ? "text-status-fail" : "text-on-surface-variant"}`}
                    style={{ fontSize: 20 }}
                  >
                    {t.verdict === "clean" ? "verified" : "warning"}
                  </span>
                  <p className="text-sm text-on-surface">{t.detail}</p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    ["Hotspots", String(t.hotspots)],
                    ["Mean error", t.meanError.toFixed(2)],
                    ["Outlier ratio", t.outlierRatio.toFixed(3)],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-surface-container rounded px-2 py-2">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant">
                        {k}
                      </p>
                      <p className="font-mono text-[13px] text-on-surface mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <EvidenceChip ai={false}>Heuristic — ELA, not a trained classifier</EvidenceChip>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-outline-variant bg-background px-6 py-4 flex justify-end">
        <button
          onClick={onContinue}
          className="h-12 px-8 bg-primary-container text-on-primary-container font-bold text-sm rounded hover:opacity-90 transition-opacity uppercase tracking-wide flex items-center gap-2"
          style={{ boxShadow: "0 0 15px rgba(245,158,11,0.2)" }}
        >
          Proceed to Risk Assessment
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}
