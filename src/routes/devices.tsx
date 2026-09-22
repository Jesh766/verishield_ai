import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, KeyRound, ShieldAlert, Smartphone } from "lucide-react";
import { useMemo } from "react";
import { OperationsShell } from "@/components/verishield/OperationsShell";
import { listSessions } from "@/lib/verishield";

export const Route = createFileRoute("/devices")({
  head: () => ({ meta: [{ title: "VeriShield — Device Trust" }] }),
  component: DevicesPage,
});

function DevicesPage() {
  const sessions = useMemo(() => listSessions(), []);
  const badge = typeof window === "undefined" ? null : localStorage.getItem("vs_badge");
  const checkpoint = typeof window === "undefined" ? null : localStorage.getItem("vs_cp");
  const latestSync = sessions.find((session) => session.synced);
  const pendingCount = sessions.filter((session) => !session.synced).length;

  return (
    <OperationsShell active="Devices" title="Device Trust" eyebrow="Field device security context">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="ops-panel p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="ops-label text-primary">Current prototype</p>
              <h2 className="mt-2 text-2xl font-bold">One enrolled field context</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                This view shows only device and sync facts available in the browser session. It does
                not imply hardware binding, TPM, HSM, or production PKI.
              </p>
            </div>
            <div className="flex items-center gap-2 border border-status-pass/40 bg-status-pass/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-status-pass">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Local identity active
            </div>
          </div>
        </section>

        <section className="grid gap-px border border-outline-variant bg-outline-variant md:grid-cols-2 lg:grid-cols-4">
          <div className="bg-surface-container p-5">
            <p className="ops-label">Device identity</p>
            <p className="mt-3 font-mono text-sm text-primary">Browser key context</p>
            <p className="mt-1 text-xs text-on-surface-variant">ECDSA P-256 signing path</p>
          </div>
          <div className="bg-surface-container p-5">
            <p className="ops-label">Officer</p>
            <p className="mt-3 font-mono text-sm">{badge ?? "Not signed in"}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Current local session</p>
          </div>
          <div className="bg-surface-container p-5">
            <p className="ops-label">Checkpoint</p>
            <p className="mt-3 font-mono text-sm">{checkpoint ?? "No local context"}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Not independently verified here</p>
          </div>
          <div className="bg-surface-container p-5">
            <p className="ops-label">Pending sync</p>
            <p className="mt-3 font-mono text-2xl font-bold text-status-warn">{pendingCount}</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Derived sessions awaiting secure sync
            </p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="ops-panel p-5">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-bold">Security posture</h2>
            </div>
            <dl className="mt-5 divide-y divide-outline-variant">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4 text-status-pass" aria-hidden="true" />
                  Request signing
                </dt>
                <dd className="font-mono text-[10px] uppercase tracking-widest text-status-pass">
                  Available
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm">
                  <ShieldAlert className="h-4 w-4 text-status-warn" aria-hidden="true" />
                  Nonce / replay protection
                </dt>
                <dd className="font-mono text-[10px] uppercase tracking-widest text-status-warn">
                  Prototype
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-sm">
                  <Clock3 className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
                  Last observed sync
                </dt>
                <dd className="font-mono text-[10px] text-on-surface-variant">
                  {latestSync
                    ? new Date(latestSync.createdAt).toLocaleString()
                    : "No synced session"}
                </dd>
              </div>
            </dl>
          </section>
          <aside className="border border-status-warn/40 bg-status-warn/10 p-5">
            <p className="ops-label text-status-warn">Future production hardening</p>
            <h2 className="mt-2 text-lg font-bold">Explicitly not enabled</h2>
            <ul className="mt-4 space-y-2 text-sm text-on-surface-variant">
              <li>Hardware-bound WebAuthn / TPM keys</li>
              <li>HSM-backed signing service</li>
              <li>Distributed nonce and rate-limit state</li>
              <li>Production PKI lifecycle management</li>
            </ul>
          </aside>
        </div>
      </div>
    </OperationsShell>
  );
}
