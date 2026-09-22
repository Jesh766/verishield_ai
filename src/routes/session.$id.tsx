import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { EvidenceChip, VerdictPill } from "@/components/verishield/Chips";
import { RiskBanner } from "@/components/verishield/RiskBanner";
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
    <main className="min-h-dvh bg-field-deep pb-16 font-sans text-field-ink">
      <div className="mx-auto w-full max-w-md px-4 pt-6">
        <Link to="/" className="font-data text-[11px] text-field-ink-dim">
          ← Back to screening
        </Link>

        {!loaded && <p className="mt-8 text-xs text-field-ink-dim">Opening the local ledger…</p>}

        {loaded && !session && (
          <p className="mt-8 rounded-xl border border-field-line bg-field-surface/60 p-5 text-xs leading-relaxed text-field-ink-dim">
            No screening with reference {id} exists on this device. Receipts are stored locally on
            the handset that performed the screening.
          </p>
        )}

        {session && (
          <div className="mt-4 space-y-4">
            <header className="shield-panel rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-[0.22em] text-field-ink-dim">
                Screening receipt
              </p>
              <h1 className="mt-1 font-display text-xl font-extrabold">{session.id}</h1>
              <dl className="mt-3 grid grid-cols-2 gap-2 font-data text-[11px] text-field-ink-dim">
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Document</dt>
                  <dd className="text-field-ink">{DOC_LABEL[session.documentType]}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Officer</dt>
                  <dd className="text-field-ink">{session.officerId}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">Time</dt>
                  <dd className="text-field-ink">{new Date(session.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-widest text-[9px]">HQ sync</dt>
                  <dd className="text-field-ink">
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

            <section className="shield-panel rounded-2xl p-5">
              <h2 className="font-display text-sm font-bold">Recorded decision</h2>
              <p className="mt-1 font-display text-lg font-bold text-field-accent">
                {session.decision ? DECISION_LABEL[session.decision] : "Not recorded"}
              </p>
              {session.note && (
                <p className="mt-2 text-xs leading-relaxed text-field-ink-dim">{session.note}</p>
              )}
            </section>

            <section className="shield-panel rounded-2xl p-5">
              <h2 className="font-display text-sm font-bold">Extracted fields (masked)</h2>
              <dl className="mt-3 space-y-1.5">
                {Object.entries(session.maskedFields).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-field-ink-dim">{FIELD_LABEL[k] ?? k}</dt>
                    <dd className="font-data text-xs">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="shield-panel rounded-2xl p-5">
              <header className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold">Structural checks</h2>
                <EvidenceChip ai={false}>Deterministic — not AI</EvidenceChip>
              </header>
              <ul className="mt-3 space-y-2">
                {session.checks.map((c) => (
                  <li key={c.check} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-field-ink-dim">{c.label}</span>
                    <VerdictPill passed={c.passed} />
                  </li>
                ))}
              </ul>
            </section>

            <section className="shield-panel rounded-2xl p-5">
              <header className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold">AI evidence</h2>
                <EvidenceChip ai>AI</EvidenceChip>
              </header>
              <dl className="mt-3 space-y-1.5 font-data text-xs">
                <div className="flex justify-between">
                  <dt className="text-field-ink-dim">Read confidence</dt>
                  <dd>{session.ocrConfidence}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-field-ink-dim">Tamper likelihood</dt>
                  <dd>
                    {session.tamperScore === null ? "—" : `${session.tamperScore}%`}{" "}
                    <span className="text-field-ink-dim">{session.tamperVerdict ?? ""}</span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-field-ink-dim">Face match</dt>
                  <dd>
                    {session.faceScore === null ? "not run" : `${session.faceScore}%`}{" "}
                    <span className="text-field-ink-dim">{session.faceVerdict ?? ""}</span>
                  </dd>
                </div>
              </dl>
            </section>

            <p className="text-center text-[10px] leading-relaxed text-field-ink-dim/80">
              Raw images, face crops and heatmaps were never stored. This receipt holds only derived
              evidence and the officer's decision.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
