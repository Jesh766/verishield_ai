import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { EvidenceChip, VerdictPill } from "@/components/verishield/Chips";
import { RiskBanner } from "@/components/verishield/RiskBanner";
import { OperationsShell } from "@/components/verishield/OperationsShell";
import {
  DECISION_LABEL,
  DOC_LABEL,
  FIELD_LABEL,
  getSession,
  type StoredSession,
} from "@/lib/verishield";

const TITLE = "Screening receipt — VeriShield AI";
const DESCRIPTION =
  "Audit receipt for a VeriShield field screening: masked fields, deterministic check verdicts, tamper and face-match scores, and the officer's recorded decision.";

export const Route = createFileRoute("/session/$id")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Receipt,
});

function Receipt() {
  const { id } = useParams({ from: "/session/$id" });
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSession(getSession(id));
    setLoaded(true);
  }, [id]);

  return (
    <OperationsShell
      active="Audit"
      title="Verification Evidence"
      eyebrow="Case record / derived evidence"
    >
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/history"
          className="font-mono text-[11px] text-on-surface-variant hover:text-primary"
        >
          ← Back to audit history
        </Link>

        {!loaded && (
          <p className="mt-8 text-xs text-on-surface-variant">Opening the local ledger…</p>
        )}

        {loaded && !session && (
          <p className="mt-8 border border-dashed border-outline-variant bg-surface-container-low p-5 text-xs leading-relaxed text-on-surface-variant">
            No screening with reference {id} exists on this device. Receipts are stored locally on
            the handset that performed the screening.
          </p>
        )}

        {session && (
          <div className="mt-5 space-y-4">
            <header className="ops-panel p-5">
              <p className="ops-label text-primary">Screening receipt</p>
              <h1 className="mt-1 font-mono text-xl font-bold">{session.id}</h1>
              <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-on-surface-variant">
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Document</dt>
                  <dd className="text-on-surface">{DOC_LABEL[session.documentType]}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Officer</dt>
                  <dd className="text-on-surface">{session.officerId}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Time</dt>
                  <dd className="text-on-surface">
                    {new Date(session.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">HQ sync</dt>
                  <dd className="text-on-surface">
                    {session.synced
                      ? "Synced"
                      : session.syncStatus === "failed"
                        ? "Sync Failed (Retryable)"
                        : session.syncStatus === "syncing"
                          ? "Syncing…"
                          : "Pending Sync"}
                  </dd>
                </div>
              </dl>
            </header>

            <RiskBanner risk={session.risk} />

            <section className="ops-panel p-5">
              <h2 className="text-sm font-bold">Recorded decision</h2>
              <p className="mt-1 text-lg font-bold text-primary">
                {session.decision ? DECISION_LABEL[session.decision] : "Not recorded"}
              </p>
              {session.note && (
                <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  {session.note}
                </p>
              )}
            </section>

            <section className="ops-panel p-5">
              <h2 className="text-sm font-bold">Extracted fields (masked)</h2>
              <dl className="mt-3 space-y-1.5">
                {Object.entries(session.maskedFields).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-on-surface-variant">{FIELD_LABEL[k] ?? k}</dt>
                    <dd className="font-mono text-xs text-primary">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="ops-panel p-5">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Structural checks</h2>
                <EvidenceChip ai={false}>Deterministic — not AI</EvidenceChip>
              </header>
              <ul className="mt-3 space-y-2">
                {session.checks.map((c) => (
                  <li key={c.check} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-on-surface-variant">{c.label}</span>
                    <VerdictPill passed={c.passed} />
                  </li>
                ))}
              </ul>
            </section>

            <section className="ops-panel p-5">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Advisory signal evidence</h2>
                <EvidenceChip ai>Advisory</EvidenceChip>
              </header>
              <dl className="mt-3 space-y-1.5 font-data text-xs">
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Read confidence</dt>
                  <dd>{session.ocrConfidence}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Document Integrity Analysis</dt>
                  <dd>
                    {session.tamperScore === null ? "—" : `${session.tamperScore}%`}{" "}
                    <span className="text-on-surface-variant">{session.tamperVerdict ?? ""}</span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Advisory Face Similarity</dt>
                  <dd>
                    {session.faceScore === null ? "not run" : `${session.faceScore}%`}{" "}
                    <span className="text-on-surface-variant">{session.faceVerdict ?? ""}</span>
                  </dd>
                </div>
              </dl>
            </section>

            <p className="text-center text-[10px] leading-relaxed text-on-surface-variant/80">
              Raw images, face crops and heatmaps were never stored. This receipt holds only derived
              evidence and the officer's decision.
            </p>
          </div>
        )}
      </div>
    </OperationsShell>
  );
}
