export function EvidenceChip({ ai, children }: { ai: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest border ${
        ai
          ? "bg-[rgba(183,200,225,0.12)] border-secondary/30 text-secondary"
          : "bg-surface-container-high border-outline-variant text-on-surface-variant"
      }`}
    >
      {ai && (
        <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden="true">
          smart_toy
        </span>
      )}
      {children}
    </span>
  );
}

export function VerdictPill({ passed }: { passed: boolean | null }) {
  const cfg =
    passed === true
      ? {
          cls: "bg-[rgba(16,185,129,0.1)] border-status-pass/40 text-status-pass",
          label: "PASS",
          icon: "check_circle",
        }
      : passed === false
        ? {
            cls: "bg-[rgba(239,68,68,0.1)] border-status-fail/40 text-status-fail",
            label: "FAIL",
            icon: "cancel",
          }
        : {
            cls: "bg-surface-container border-outline-variant text-on-surface-variant",
            label: "N/A",
            icon: "help",
          };
  return (
    <span
      aria-label={`Verdict: ${cfg.label}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[10px] font-bold tracking-widest ${cfg.cls}`}
    >
      <span className="material-symbols-outlined ms-fill" style={{ fontSize: 12 }} aria-hidden="true">
        {cfg.icon}
      </span>
      {cfg.label}
    </span>
  );
}
