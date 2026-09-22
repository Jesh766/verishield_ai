import { EvidenceChip, VerdictPill } from "@/components/verishield/Chips";
import { DISCLAIMER, DOC_LABEL, FIELD_LABEL, maskFields, type ScreeningResult } from "@/lib/verishield";

export function ExtractionStage({
  result,
  onContinue,
  onReset,
}: {
  result: ScreeningResult;
  onContinue: () => void;
  onReset: () => void;
}) {
  const fields = Object.entries(maskFields(result.ocr.fields));
  const passed = result.checks.filter((c) => c.passed === true).length;
  const failed = result.checks.filter((c) => c.passed === false).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <h1 className="text-[20px] font-bold text-on-surface">
          Extraction &amp; Validation Results
        </h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Recognised as <strong className="text-primary">{DOC_LABEL[result.documentType]}</strong> ·{" "}
          OCR confidence {result.ocr.confidence}%
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Extracted fields */}
        <div className="flex-1 lg:w-7/12 overflow-y-auto border-b lg:border-b-0 lg:border-r border-outline-variant">
          <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-background sticky top-0 z-10">
            <span className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
              EXTRACTED FIELDS
            </span>
            <EvidenceChip ai>AI — Tesseract LSTM</EvidenceChip>
          </div>
          <table className="w-full">
            <tbody>
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-sm text-on-surface-variant text-center">
                    Nothing readable was extracted — recapture with better lighting.
                  </td>
                </tr>
              ) : (
                fields.map(([k, v]) => (
                  <tr
                    key={k}
                    className="border-b border-outline-variant/60 hover:bg-surface-container/40 transition-colors"
                  >
                    <td className="py-4 px-6 text-sm text-on-surface-variant w-1/3">
                      {FIELD_LABEL[k] ?? k}
                    </td>
                    <td className="py-4 px-6 font-mono text-sm text-primary">{v}</td>
                    <td className="py-4 px-4 text-right">
                      <span className="inline-block w-2 h-2 rounded-full bg-status-pass" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {result.ocr.repairs.length > 0 && (
            <div className="mx-6 mb-4 mt-2 px-3 py-2 bg-surface-container rounded text-[11px] font-mono text-on-surface-variant">
              MRZ glyph repairs applied: {result.ocr.repairs.join(", ")}
            </div>
          )}
        </div>

        {/* Right: Validation engine */}
        <div className="lg:w-5/12 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-outline-variant bg-background sticky top-0 z-10">
            <p className="text-[16px] font-semibold text-on-surface">Validation Engine</p>
            <span className="font-mono text-[11px] font-bold tracking-widest text-on-surface-variant">
              AUTOMATED CHECKS — DETERMINISTIC, NOT AI
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            {result.checks.map((c, i) => (
              <div key={c.check}>
                <div className="flex items-start gap-3">
                  <span
                    className={`material-symbols-outlined ms-fill mt-0.5 ${c.passed === true ? "text-status-pass" : c.passed === false ? "text-status-fail" : "text-on-surface-variant"}`}
                    style={{ fontSize: 20 }}
                  >
                    {c.passed === true ? "check_circle" : c.passed === false ? "cancel" : "help"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[15px] font-semibold text-on-surface">{c.label}</span>
                      <VerdictPill passed={c.passed} />
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{c.detail}</p>
                  </div>
                </div>
                {i < result.checks.length - 1 && (
                  <div className="mt-4 border-t border-outline-variant/60" />
                )}
              </div>
            ))}
            <p className="text-[11px] text-on-surface-variant/70 leading-relaxed mt-2 font-mono">
              {DISCLAIMER}
            </p>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="border-t border-outline-variant bg-background px-6 py-4 flex items-center justify-between gap-4">
        <div className="font-mono text-[11px] text-on-surface-variant">
          <span className="text-status-pass">{passed} passed</span>
          {failed > 0 && (
            <>
              {" "}
              · <span className="text-status-fail">{failed} failed</span>
            </>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="h-12 px-4 border border-outline-variant rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onContinue}
            className="h-12 px-8 bg-primary-container text-on-primary-container font-bold text-sm rounded hover:opacity-90 transition-opacity uppercase tracking-wide flex items-center gap-2"
            style={{ boxShadow: "0 0 15px rgba(245,158,11,0.2)" }}
          >
            Continue to AI Checks
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
