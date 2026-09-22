import type { ScreeningResult } from "@/lib/verishield";
import { Link } from "@tanstack/react-router";

export function RecordedStage({
  result,
  decision,
  online,
  onNext,
}: {
  result: ScreeningResult;
  decision: string;
  online: boolean;
  onNext: () => void;
}) {
  const LABELS = { cleared: "Accepted", referred: "Flagged for Review", rejected: "Rejected" };
  const COLORS = {
    cleared: "text-status-pass",
    referred: "text-status-warn",
    rejected: "text-status-fail",
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center">
          <span
            className={`material-symbols-outlined ms-fill ${COLORS[decision as keyof typeof COLORS]}`}
            style={{ fontSize: 48 }}
          >
            {decision === "cleared" ? "task_alt" : decision === "referred" ? "flag" : "block"}
          </span>
        </div>
        <div>
          <p className={`text-[28px] font-bold ${COLORS[decision as keyof typeof COLORS]}`}>
            {LABELS[decision as keyof typeof LABELS]}
          </p>
          <p className="font-mono text-sm text-on-surface-variant mt-2">{result.sessionId}</p>
        </div>
        <div className="w-full bg-surface-container border border-outline-variant rounded p-4 text-sm text-on-surface-variant text-left">
          <p>
            Raw capture discarded. Only masked fields, scores and your decision remain on this
            device{online ? " and will sync to HQ." : " until connectivity is restored."}
          </p>
        </div>
        <div className="flex gap-3 w-full">
          <Link
            to="/session/$id"
            params={{ id: result.sessionId }}
            className="flex-1 h-12 border border-outline-variant rounded flex items-center justify-center text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            View receipt
          </Link>
          <button
            onClick={onNext}
            className="flex-1 h-12 bg-primary-container text-on-primary-container font-bold rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              person_add
            </span>
            Next person
          </button>
        </div>
      </div>
    </div>
  );
}
