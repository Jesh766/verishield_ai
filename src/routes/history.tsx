/**
 * Field Officer Operations — local session history & device analytics.
 *
 * Shows the officer every screening performed on this device with its
 * operational sync state (pending / syncing / synced / failed / undecided),
 * allows per-session retry for failed/pending sessions, and displays
 * truthful analytics derived only from real stored sessions.
 *
 * Privacy: only masked fields and derived evidence are shown. Raw document
 * images, face crops and heatmaps are never stored or displayed.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, ArrowLeft } from "lucide-react";
import { listSessions, type StoredSession } from "@/lib/engine/ledger";
import { retrySessionSync } from "@/lib/sync";
import {
  computeLocalAnalytics,
  filterBySyncState,
  syncStateCounts,
  syncStateOf,
  type SyncState,
} from "@/lib/analytics";
import { DOC_LABEL } from "@/lib/engine/extract";
import { LanguageSelector } from "@/lib/i18n";
import { OperationsShell } from "@/components/verishield/OperationsShell";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "VeriShield AI — Field Operations History" },
      {
        name: "description",
        content:
          "Local screening history and operational analytics for the field officer. Masked evidence only — no raw identity documents.",
      },
    ],
  }),
  component: HistoryPage,
});

const SYNC_STATE_META: Record<
  SyncState,
  { label: string; cls: string; icon: "check" | "clock" | "alert" | "refresh" | "minus" }
> = {
  synced: {
    label: "Synced",
    cls: "text-status-pass border-status-pass/40 bg-[rgba(16,185,129,0.1)]",
    icon: "check",
  },
  pending: {
    label: "Pending Sync",
    cls: "text-status-warn border-status-warn/40 bg-[rgba(245,158,11,0.1)]",
    icon: "clock",
  },
  syncing: {
    label: "Syncing…",
    cls: "text-primary border-primary/40 bg-[rgba(245,158,11,0.1)]",
    icon: "refresh",
  },
  failed: {
    label: "Sync Failed",
    cls: "text-status-fail border-status-fail/40 bg-[rgba(239,68,68,0.1)]",
    icon: "alert",
  },
  undecided: {
    label: "No Decision",
    cls: "text-on-surface-variant border-outline-variant bg-surface-container",
    icon: "minus",
  },
};

const BAND_CLS: Record<string, string> = {
  clear: "text-status-pass border-status-pass/40 bg-[rgba(16,185,129,0.1)]",
  review: "text-status-warn border-status-warn/40 bg-[rgba(245,158,11,0.1)]",
  escalate: "text-status-fail border-status-fail/40 bg-[rgba(239,68,68,0.1)]",
};

const DECISION_CLS: Record<string, string> = {
  cleared: "text-status-pass",
  referred: "text-status-warn",
  rejected: "text-status-fail",
};

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border font-mono text-[10px] font-bold uppercase tracking-widest ${cls}`}
    >
      {children}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg p-4">
      <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
      {sub && <p className="font-mono text-[10px] text-on-surface-variant/70 mt-0.5">{sub}</p>}
    </div>
  );
}

function HistoryPage() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [filter, setFilter] = useState<SyncState | "all">("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ id: string; text: string; isError?: boolean } | null>(
    null,
  );
  const [officer, setOfficer] = useState<{ badge: string; checkpoint: string } | null>(null);

  const refresh = useCallback(() => {
    setSessions(listSessions());
    const badge = localStorage.getItem("vs_badge");
    const cp = localStorage.getItem("vs_cp");
    if (badge && cp) setOfficer({ badge, checkpoint: cp });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const analytics = useMemo(() => computeLocalAnalytics(sessions), [sessions]);
  const counts = useMemo(() => syncStateCounts(sessions), [sessions]);
  const filtered = useMemo(() => filterBySyncState(sessions, filter), [sessions, filter]);

  const handleRetry = useCallback(
    async (id: string) => {
      if (!officer) return;
      setRetryingId(id);
      setRetryMsg(null);
      const result = await retrySessionSync(id, officer.checkpoint, officer.badge);
      setRetryingId(null);
      if (result.ok) {
        setRetryMsg({ id, text: "Session synced to HQ." });
      } else {
        setRetryMsg({
          id,
          text: result.status
            ? `Sync failed (HTTP ${result.status}). Check connectivity and retry.`
            : "Sync failed — no connectivity or backend unavailable.",
          isError: true,
        });
      }
      refresh();
    },
    [officer, refresh],
  );

  const filterTabs: { key: SyncState | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: sessions.length },
    { key: "undecided", label: "No Decision", count: counts.undecided },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "syncing", label: "Syncing", count: counts.syncing },
    { key: "synced", label: "Synced", count: counts.synced },
    { key: "failed", label: "Failed", count: counts.failed },
  ];

  return (
    <OperationsShell
      active="Audit"
      title="Audit & Screening History"
      eyebrow="Derived evidence ledger"
      officer={officer}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* Officer context */}
        {officer && (
          <div className="flex items-center gap-2 text-xs font-mono text-on-surface-variant">
            <ShieldCheck className="h-4 w-4 text-primary" />
            OFFICER: {officer.badge} · {officer.checkpoint}
          </div>
        )}

        {/* Operational key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Screenings" value={analytics.totalScreenings} />
          <StatCard
            label="Decisions"
            value={analytics.decidedCount}
            sub={`${analytics.undecidedCount} undecided`}
          />
          <StatCard
            label="Pending Sync"
            value={analytics.pendingSyncCount + analytics.failedSyncCount}
            sub={`${analytics.failedSyncCount} failed`}
          />
          <StatCard
            label="Avg Risk Score"
            value={analytics.averageRiskScore === null ? "—" : analytics.averageRiskScore}
            sub={analytics.averageRiskScore === null ? "No scored sessions yet" : "/ 100"}
          />
        </div>

        {/* Decision & risk distribution */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-surface-container border border-outline-variant rounded-lg p-4">
            <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
              Decisions
            </p>
            {analytics.decidedCount === 0 ? (
              <p className="text-xs text-on-surface-variant/70">
                No decisions recorded yet. Screen a document and record a decision to see
                distribution here.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {[
                  ["Accepted", analytics.acceptedCount, "text-status-pass"],
                  ["Referred", analytics.referredCount, "text-status-warn"],
                  ["Rejected", analytics.rejectedCount, "text-status-fail"],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">{label}</span>
                    <span className={`font-mono font-bold ${cls}`}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-lg p-4">
            <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
              Risk Bands
            </p>
            {analytics.totalScreenings === 0 ? (
              <p className="text-xs text-on-surface-variant/70">
                No screenings yet. Risk distribution appears once sessions are recorded.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {Object.entries(analytics.riskBandDistribution).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-on-surface-variant capitalize">{k}</span>
                    <span className="font-mono text-on-surface">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface-container border border-outline-variant rounded-lg p-4">
            <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
              Document Types
            </p>
            {analytics.totalScreenings === 0 ? (
              <p className="text-xs text-on-surface-variant/70">
                No screenings yet. Document distribution appears once sessions are recorded.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {Object.entries(analytics.documentTypeDistribution).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-on-surface-variant capitalize">{k}</span>
                    <span className="font-mono text-on-surface">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Evidence signals */}
        {analytics.totalScreenings > 0 && (
          <div className="bg-surface-container border border-outline-variant rounded-lg p-4">
            <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
              Observed Evidence Signals
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Verhoeff Failures:</span>
                <span className="font-bold">{analytics.evidenceSignals.verhoeffFailures}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">MRZ Failures:</span>
                <span className="font-bold">{analytics.evidenceSignals.mrzFailures}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">DL Format Anomalies:</span>
                <span className="font-bold">{analytics.evidenceSignals.dlFormatFailures}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Consistency Failures:</span>
                <span className="font-bold">{analytics.evidenceSignals.consistencyFailures}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">ELA Hotspots (&ge;45):</span>
                <span className="font-bold text-status-warn">
                  {analytics.evidenceSignals.elaHotspots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Face Mismatches:</span>
                <span className="font-bold text-status-fail">
                  {analytics.evidenceSignals.faceMismatches}
                </span>
              </div>
            </div>
            <p className="font-mono text-[9px] text-on-surface-variant/60 mt-3">
              * Derived from local verification metrics. Not authoritative fraud claims.
            </p>
          </div>
        )}

        {/* Sync state filter tabs */}
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded border font-mono text-xs font-bold transition-colors ${
                filter === tab.key
                  ? "bg-primary-container text-on-primary-container border-primary-container"
                  : "bg-surface-container border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Sessions list */}
        <div className="border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
          {sessions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-mono text-sm text-on-surface-variant">
                No screenings recorded on this device yet.
              </p>
              <p className="text-xs text-on-surface-variant/70 mt-1">
                Screen a document from the officer workstation to begin.
              </p>
              <Link
                to="/"
                className="inline-block mt-4 px-4 py-2 bg-primary-container text-on-primary-container rounded font-mono text-xs font-bold"
              >
                ← Back to Screening
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-mono text-sm text-on-surface-variant">
                No sessions match the current filter.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                  <th className="p-3">Session</th>
                  <th className="p-3">Doc</th>
                  <th className="p-3">Risk</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Sync State</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const meta = SYNC_STATE_META[syncStateOf(s)];
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-outline-variant/50 hover:bg-surface-container transition-colors"
                    >
                      <td className="p-3 font-mono font-bold text-xs">{s.id}</td>
                      <td className="p-3 capitalize text-xs">
                        {DOC_LABEL[s.documentType] ?? s.documentType}
                      </td>
                      <td className="p-3">
                        <Pill cls={BAND_CLS[s.risk.band] ?? ""}>{s.risk.band}</Pill>
                      </td>
                      <td className="p-3 text-xs font-bold capitalize">
                        {s.decision ? (
                          <span className={DECISION_CLS[s.decision] ?? ""}>{s.decision}</span>
                        ) : (
                          <span className="text-on-surface-variant font-normal">Pending</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Pill cls={meta.cls}>{meta.label}</Pill>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-on-surface-variant">
                        {new Date(s.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/session/$id"
                            params={{ id: s.id }}
                            className="text-xs font-mono text-primary hover:underline"
                          >
                            Receipt
                          </Link>
                          {!s.synced && s.decision && (
                            <button
                              onClick={() => void handleRetry(s.id)}
                              disabled={retryingId === s.id}
                              className="flex items-center gap-1 text-xs font-mono text-on-surface-variant hover:text-primary disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${retryingId === s.id ? "animate-spin" : ""}`}
                              />
                              {retryingId === s.id ? "Syncing…" : "Retry"}
                            </button>
                          )}
                        </div>
                        {retryMsg?.id === s.id && (
                          <p
                            className={`mt-1 text-[10px] font-mono ${
                              retryMsg.isError ? "text-status-fail" : "text-status-pass"
                            }`}
                          >
                            {retryMsg.text}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Privacy note */}
        <p className="text-center text-[10px] leading-relaxed text-on-surface-variant/60 font-mono">
          Raw images, face crops and heatmaps are never stored. This view shows only masked fields
          and derived evidence from the local ledger.
        </p>
      </main>
    </OperationsShell>
  );
}
