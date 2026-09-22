import { EvidenceChip } from "@/components/verishield/Chips";
import type { TamperResult } from "@/lib/verishield";

const TONE: Record<TamperResult["verdict"], string> = {
  clean: "text-verdict-pass",
  inconclusive: "text-field-ink-dim",
  suspicious: "text-verdict-warn",
  likely_edited: "text-verdict-fail",
};

export function TamperCard({ tamper }: { tamper: TamperResult }) {
  return (
    <section className="shield-panel rounded-lg p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-field-ink">Tamper detection</h3>
          <p className="text-[11px] text-field-ink-dim">
            Error Level Analysis + logistic classifier, run on this device
          </p>
        </div>
        <EvidenceChip ai>AI</EvidenceChip>
      </header>

      <div className="mt-4 flex items-center gap-4" aria-live="polite">
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className={`font-display text-2xl font-bold ${TONE[tamper.verdict]}`}>
              {tamper.score}%
            </span>
            <span className="text-[11px] uppercase tracking-widest text-field-ink-dim">
              tamper likelihood
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-field-line/60">
            <div
              className="h-full rounded-full bg-current transition-[width] duration-700"
              style={{ width: `${Math.max(3, tamper.score)}%` }}
            />
          </div>
          <p className={`mt-2 text-xs font-semibold ${TONE[tamper.verdict]}`}>{tamper.headline}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-field-ink-dim">{tamper.detail}</p>
        </div>
        <figure className="w-24 shrink-0">
          <img
            src={tamper.heatmap}
            alt="Error level analysis heatmap of the captured document"
            className="h-24 w-24 rounded-lg border border-field-line object-cover"
          />
          <figcaption className="mt-1 text-center text-[9px] uppercase tracking-widest text-field-ink-dim">
            ELA map
          </figcaption>
        </figure>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 font-data text-[11px]">
        {[
          ["Hotspots", String(tamper.hotspots)],
          ["Mean error", tamper.meanError.toFixed(2)],
          ["Outlier ratio", tamper.outlierRatio.toFixed(3)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-field-surface/70 px-2 py-1.5">
            <dt className="text-[9px] uppercase tracking-widest text-field-ink-dim">{k}</dt>
            <dd className="text-field-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
