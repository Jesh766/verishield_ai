import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  CircleHelp,
  Fingerprint,
  ScanSearch,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";
import { OperationsShell } from "@/components/verishield/OperationsShell";
import { listSessions } from "@/lib/verishield";

export const Route = createFileRoute("/intelligence")({
  head: () => ({ meta: [{ title: "VeriShield — Fraud Intelligence" }] }),
  component: IntelligencePage,
});

type Signal = { label: string; value: number; detail: string; tone: string };

function IntelligencePage() {
  const sessions = useMemo(() => listSessions(), []);
  const signals: Signal[] = [
    {
      label: "Structural failures",
      value: sessions.filter((s) => s.checks.some((check) => check.passed === false)).length,
      detail: "Recorded checksum or format failures",
      tone: "text-status-fail",
    },
    {
      label: "Integrity warnings",
      value: sessions.filter((s) => s.tamperScore !== null && s.tamperScore >= 45).length,
      detail: "ELA results at or above the advisory threshold",
      tone: "text-status-warn",
    },
    {
      label: "Face mismatches",
      value: sessions.filter((s) => s.faceVerdict === "mismatch").length,
      detail: "Advisory similarity results only",
      tone: "text-status-fail",
    },
    {
      label: "Repeated identities",
      value: new Set(sessions.map((s) => Object.values(s.maskedFields).join("|")).filter(Boolean))
        .size,
      detail: "Distinct masked evidence groups in local records",
      tone: "text-primary",
    },
  ];
  const highAttention = sessions
    .filter((s) => s.risk.band === "escalate" || s.risk.band === "review")
    .slice(0, 8);

  return (
    <OperationsShell
      active="Intelligence"
      title="Fraud Intelligence"
      eyebrow="Observed signals / local ledger"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="border border-outline-variant bg-surface-container-low p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Observed signals / local ledger
              </p>
              <h2 className="mt-1 text-2xl font-bold">Patterns worth reviewing</h2>
              <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
                These are rule-based counts over sessions actually stored on this device. They are
                triage signals, not model-based fraud determinations.
              </p>
            </div>
            <div className="flex items-center gap-2 border border-status-warn/40 bg-status-warn/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-status-warn">
              <CircleHelp className="h-4 w-4" aria-hidden="true" /> No anomaly model connected
            </div>
          </div>
          <div className="mt-6 grid gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
            {signals.map((signal) => (
              <div key={signal.label} className="bg-surface-container p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
                    {signal.label}
                  </p>
                  <span className={`text-2xl font-bold ${signal.tone}`}>{signal.value}</span>
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">{signal.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="border border-outline-variant bg-surface-container-low p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-bold">High-attention sessions</h2>
            </div>
            {highAttention.length === 0 ? (
              <p className="mt-5 border border-dashed border-outline-variant p-6 text-sm text-on-surface-variant">
                No review or escalation bands are recorded in the local ledger.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-outline-variant">
                {highAttention.map((session) => (
                  <Link
                    key={session.id}
                    to="/session/$id"
                    params={{ id: session.id }}
                    className="flex items-center justify-between gap-4 py-3 hover:bg-surface-container"
                  >
                    <div>
                      <p className="font-mono text-xs font-bold">{session.id}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {session.risk.primaryReason ?? "Review band"}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-status-warn">
                      {session.risk.band}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <div className="border border-outline-variant bg-surface-container-low p-5">
              <div className="flex items-center gap-2">
                <ScanSearch className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Signal classes
                </p>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-semibold">Rule-based signal</dt>
                  <dd className="mt-1 text-xs text-on-surface-variant">
                    Checksums, formats, stored thresholds, and repeated observed outcomes.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Model-based signal</dt>
                  <dd className="mt-1 text-xs text-on-surface-variant">
                    Not connected. OCR and face/ELA heuristics are disclosed separately.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Future AI signal</dt>
                  <dd className="mt-1 text-xs text-on-surface-variant">
                    Reserved for a validated anomaly model with measured false-positive rates.
                  </dd>
                </div>
              </dl>
            </div>
            <div className="border border-outline-variant bg-surface-container-low p-5">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-status-pass" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-status-pass">
                  Authority boundary
                </p>
              </div>
              <p className="mt-3 text-sm text-on-surface-variant">
                Authoritative Verification Gateway is integration-ready, but no UIDAI, Passport
                Seva, or Parivahan provider is connected.
              </p>
              <Link
                to="/cases"
                className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
              >
                Open investigations <ShieldAlert className="h-3 w-3" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </OperationsShell>
  );
}
