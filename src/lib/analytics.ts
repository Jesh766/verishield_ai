/**
 * Field operational analytics — deterministic, local-only.
 * Computes truthful metrics from the real local session ledger.
 * No fabricated history is ever injected.
 * Privacy: only consumes already-masked fields and derived evidence.
 */

import type { StoredSession } from "./engine/ledger";
import type { RiskBand } from "./engine/risk";

export type SyncState = "pending" | "syncing" | "synced" | "failed" | "undecided";

export type LocalAnalytics = {
  totalScreenings: number;
  decidedCount: number;
  undecidedCount: number;
  acceptedCount: number;
  referredCount: number;
  rejectedCount: number;
  pendingSyncCount: number;
  syncedCount: number;
  failedSyncCount: number;
  riskBandDistribution: Record<RiskBand, number>;
  documentTypeDistribution: Record<string, number>;
  acceptanceRate: number | null;
  rejectionRate: number | null;
  reviewRate: number | null;
  averageRiskScore: number | null;
  evidenceSignals: {
    verhoeffFailures: number;
    mrzFailures: number;
    dlFormatFailures: number;
    consistencyFailures: number;
    elaHotspots: number;
    faceMismatches: number;
  };
};

/** Derive the operational sync state of a stored session. */
export function syncStateOf(s: StoredSession): SyncState {
  if (!s.decision) return "undecided";
  if (s.synced) return "synced";
  if (s.syncStatus === "syncing") return "syncing";
  if (s.syncStatus === "failed") return "failed";
  return "pending";
}

/** Count sessions in each operational sync state. */
export function syncStateCounts(sessions: StoredSession[]): Record<SyncState, number> {
  const counts: Record<SyncState, number> = {
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    undecided: 0,
  };
  for (const s of sessions) counts[syncStateOf(s)]++;
  return counts;
}

/**
 * Compute truthful operational analytics from the local session ledger.
 * Rates are null when there is no decided data — never 0, which would
 * falsely imply a 0% rate rather than "no data yet".
 */
export function computeLocalAnalytics(sessions: StoredSession[]): LocalAnalytics {
  const total = sessions.length;
  const decided = sessions.filter((s) => s.decision);
  const accepted = decided.filter((s) => s.decision === "cleared").length;
  const referred = decided.filter((s) => s.decision === "referred").length;
  const rejected = decided.filter((s) => s.decision === "rejected").length;

  const syncCounts = syncStateCounts(sessions);

  const bandDist: Record<RiskBand, number> = { clear: 0, review: 0, escalate: 0 };
  const docDist: Record<string, number> = {};
  let totalRisk = 0;
  let riskCount = 0;

  const signals = {
    verhoeffFailures: 0,
    mrzFailures: 0,
    dlFormatFailures: 0,
    consistencyFailures: 0,
    elaHotspots: 0,
    faceMismatches: 0,
  };

  for (const s of sessions) {
    bandDist[s.risk.band] = (bandDist[s.risk.band] || 0) + 1;
    docDist[s.documentType] = (docDist[s.documentType] || 0) + 1;

    if (typeof s.risk.score === "number") {
      totalRisk += s.risk.score;
      riskCount++;
    }

    for (const c of s.checks) {
      if (c.passed === false) {
        if (/verhoeff/.test(c.check)) signals.verhoeffFailures++;
        else if (/mrz|passport/.test(c.check)) signals.mrzFailures++;
        else if (/dl_/.test(c.check)) signals.dlFormatFailures++;
        else if (/consistency/.test(c.check)) signals.consistencyFailures++;
      }
    }

    if ((s.tamperScore ?? 0) >= 45) signals.elaHotspots++;
    if (s.faceVerdict === "mismatch") signals.faceMismatches++;
  }

  const rate = (n: number) =>
    decided.length > 0 ? Math.round((n / decided.length) * 1000) / 10 : null;

  return {
    totalScreenings: total,
    decidedCount: decided.length,
    undecidedCount: total - decided.length,
    acceptedCount: accepted,
    referredCount: referred,
    rejectedCount: rejected,
    pendingSyncCount: syncCounts.pending,
    syncedCount: syncCounts.synced,
    failedSyncCount: syncCounts.failed,
    riskBandDistribution: bandDist,
    documentTypeDistribution: docDist,
    acceptanceRate: rate(accepted),
    rejectionRate: rate(rejected),
    reviewRate: rate(referred),
    averageRiskScore: riskCount > 0 ? Math.round((totalRisk / riskCount) * 10) / 10 : null,
    evidenceSignals: signals,
  };
}

/** Filter sessions by operational sync state. */
export function filterBySyncState(
  sessions: StoredSession[],
  state: SyncState | "all",
): StoredSession[] {
  if (state === "all") return sessions;
  return sessions.filter((s) => syncStateOf(s) === state);
}
