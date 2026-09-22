import { EvidenceChip } from "@/components/verishield/Chips";
import type { FaceMatchResult } from "@/lib/verishield";

const TONE: Record<FaceMatchResult["verdict"], string> = {
  match: "text-verdict-pass",
  possible: "text-verdict-warn",
  mismatch: "text-verdict-fail",
  no_face: "text-field-ink-dim",
};

export function FaceCard({
  face,
  onCapture,
  busy,
}: {
  face: FaceMatchResult | null;
  onCapture: () => void;
  busy: boolean;
}) {
  return (
    <section className="shield-panel rounded-lg p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-field-ink">Face match</h3>
          <p className="text-[11px] text-field-ink-dim">
            Portrait on the document vs the person standing in front of you
          </p>
        </div>
        <EvidenceChip ai>AI</EvidenceChip>
      </header>

      {!face && (
        <div className="mt-4">
          <p className="text-xs leading-relaxed text-field-ink-dim">
            Optional. Capture the holder's face and the comparison runs on this device — the image
            is never stored or uploaded.
          </p>
          <button
            type="button"
            onClick={onCapture}
            disabled={busy}
            aria-label="Capture holder's face for biometric verification"
            className="mt-3 w-full rounded border border-field-accent/50 bg-field-accent-soft/50 px-4 py-3 font-display text-sm font-semibold text-field-accent disabled:opacity-50"
          >
            {busy ? "Comparing…" : "Capture holder's face"}
          </button>
        </div>
      )}

      {face && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-center gap-3">
            {face.documentThumb && face.selfieThumb ? (
              <div className="flex items-center gap-2">
                <img
                  src={face.documentThumb}
                  alt="Normalised portrait from the document"
                  className="h-16 w-16 rounded-lg border border-field-line object-cover"
                />
                <span className="font-data text-xs text-field-ink-dim">vs</span>
                <img
                  src={face.selfieThumb}
                  alt="Normalised live capture of the holder"
                  className="h-16 w-16 rounded-lg border border-field-line object-cover"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <span className={`font-display text-2xl font-bold ${TONE[face.verdict]}`}>
                {face.verdict === "no_face" ? "—" : `${face.score}%`}
              </span>
              <p className={`text-xs font-semibold ${TONE[face.verdict]}`}>{face.headline}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-field-ink-dim">{face.detail}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-field-ink-dim/80">{face.method}</p>
          <button
            type="button"
            onClick={onCapture}
            disabled={busy}
            aria-label="Recapture holder's face for biometric verification"
            className="mt-3 w-full rounded-lg border border-field-line px-3 py-2 text-xs font-semibold text-field-ink-dim disabled:opacity-50"
          >
            {busy ? "Comparing…" : "Recapture face"}
          </button>
        </div>
      )}
    </section>
  );
}
