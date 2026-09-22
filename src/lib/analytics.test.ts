import { describe, it, expect } from "vitest";
import {
  computeLocalAnalytics,
  filterBySyncState,
  syncStateCounts,
  syncStateOf,
} from "./analytics";
import type { StoredSession } from "./engine/ledger";
import type { RiskResult } from "./engine/risk";

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
  const risk: RiskResult = {
    score: 10,
    band: "clear",
    headline: "No blocking anomalies detected",
    primaryReason: null,
    recommendation: "Every check that could run, passed.",
    contributions: [],
  };
  return {
    id: `VS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    documentType: "aadhaar",
    createdAt: new Date().toISOString(),
    officerId: "VS-0001",
    maskedFields: { name: "TEST USER", aadhaar_number: "••••••••6617" },
    checks: [],
    ocrConfidence: 95,
    tamperScore: 10,
    tamperVerdict: "clean",
    faceScore: null,
    faceVerdict: null,
    risk,
    decision: null,
    note: "",
    synced: false,
    ...overrides,
  };
}

describe("syncStateOf", () => {
  it("returns undecided when no decision is recorded", () => {
    expect(syncStateOf(makeSession())).toBe("undecided");
  });

  it("returns synced when synced is true", () => {
    const s = makeSession({ decision: "cleared", synced: true });
    expect(syncStateOf(s)).toBe("synced");
  });

  it("returns syncing when syncStatus is syncing", () => {
    const s = makeSession({ decision: "cleared", synced: false, syncStatus: "syncing" });
    expect(syncStateOf(s)).toBe("syncing");
  });

  it("returns failed when syncStatus is failed", () => {
    const s = makeSession({ decision: "cleared", synced: false, syncStatus: "failed" });
    expect(syncStateOf(s)).toBe("failed");
  });

  it("returns pending for decided but unsynced sessions", () => {
    const s = makeSession({ decision: "cleared", synced: false });
    expect(syncStateOf(s)).toBe("pending");
  });
});

describe("syncStateCounts", () => {
  it("counts sessions in each state", () => {
    const sessions = [
      makeSession({ decision: "cleared", synced: true }),
      makeSession({ decision: "referred", synced: false }),
      makeSession({ decision: "rejected", synced: false, syncStatus: "failed" }),
      makeSession({ decision: "cleared", synced: false, syncStatus: "syncing" }),
      makeSession(),
    ];
    const counts = syncStateCounts(sessions);
    expect(counts.synced).toBe(1);
    expect(counts.pending).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.syncing).toBe(1);
    expect(counts.undecided).toBe(1);
  });
});

describe("computeLocalAnalytics", () => {
  it("returns zeroed metrics for empty ledger", () => {
    const a = computeLocalAnalytics([]);
    expect(a.totalScreenings).toBe(0);
    expect(a.decidedCount).toBe(0);
    expect(a.acceptanceRate).toBeNull();
    expect(a.rejectionRate).toBeNull();
    expect(a.reviewRate).toBeNull();
    expect(a.averageRiskScore).toBeNull();
  });

  it("computes decision counts and rates from real sessions", () => {
    const sessions = [
      makeSession({ decision: "cleared", synced: true }),
      makeSession({ decision: "cleared", synced: true }),
      makeSession({ decision: "referred", synced: false }),
      makeSession({ decision: "rejected", synced: false, syncStatus: "failed" }),
    ];
    const a = computeLocalAnalytics(sessions);
    expect(a.totalScreenings).toBe(4);
    expect(a.decidedCount).toBe(4);
    expect(a.acceptedCount).toBe(2);
    expect(a.referredCount).toBe(1);
    expect(a.rejectedCount).toBe(1);
    expect(a.acceptanceRate).toBe(50);
    expect(a.reviewRate).toBe(25);
    expect(a.rejectionRate).toBe(25);
    expect(a.pendingSyncCount).toBe(1);
    expect(a.failedSyncCount).toBe(1);
    expect(a.syncedCount).toBe(2);
  });

  it("computes risk band and document type distributions", () => {
    const sessions = [
      makeSession({ risk: { ...makeSession().risk, band: "clear" } }),
      makeSession({
        risk: { ...makeSession().risk, band: "review" },
        documentType: "passport",
      }),
      makeSession({
        risk: { ...makeSession().risk, band: "escalate" },
        documentType: "dl",
      }),
    ];
    const a = computeLocalAnalytics(sessions);
    expect(a.riskBandDistribution.clear).toBe(1);
    expect(a.riskBandDistribution.review).toBe(1);
    expect(a.riskBandDistribution.escalate).toBe(1);
    expect(a.documentTypeDistribution["aadhaar"]).toBe(1);
    expect(a.documentTypeDistribution["passport"]).toBe(1);
    expect(a.documentTypeDistribution["dl"]).toBe(1);
  });

  it("computes average risk score", () => {
    const sessions = [
      makeSession({ risk: { ...makeSession().risk, score: 10 } }),
      makeSession({ risk: { ...makeSession().risk, score: 30 } }),
    ];
    const a = computeLocalAnalytics(sessions);
    expect(a.averageRiskScore).toBe(20);
  });

  it("counts evidence signals from real check failures", () => {
    const sessions = [
      makeSession({
        checks: [
          {
            check: "verhoeff",
            label: "Verhoeff",
            passed: false,
            detail: "fail",
            kind: "deterministic",
          },
          { check: "mrz", label: "MRZ", passed: false, detail: "fail", kind: "deterministic" },
        ],
        tamperScore: 60,
        faceVerdict: "mismatch",
      }),
      makeSession({
        checks: [
          {
            check: "dl_format",
            label: "DL Format",
            passed: false,
            detail: "fail",
            kind: "deterministic",
          },
          {
            check: "consistency",
            label: "Consistency",
            passed: false,
            detail: "fail",
            kind: "deterministic",
          },
        ],
      }),
    ];
    const a = computeLocalAnalytics(sessions);
    expect(a.evidenceSignals.verhoeffFailures).toBe(1);
    expect(a.evidenceSignals.mrzFailures).toBe(1);
    expect(a.evidenceSignals.dlFormatFailures).toBe(1);
    expect(a.evidenceSignals.consistencyFailures).toBe(1);
    expect(a.evidenceSignals.elaHotspots).toBe(1);
    expect(a.evidenceSignals.faceMismatches).toBe(1);
  });
});

describe("filterBySyncState", () => {
  it("returns all sessions for 'all'", () => {
    const sessions = [makeSession(), makeSession({ decision: "cleared", synced: true })];
    expect(filterBySyncState(sessions, "all")).toHaveLength(2);
  });

  it("filters by sync state", () => {
    const sessions = [
      makeSession({ decision: "cleared", synced: true }),
      makeSession({ decision: "cleared", synced: false }),
      makeSession({ decision: "cleared", synced: false, syncStatus: "failed" }),
    ];
    expect(filterBySyncState(sessions, "synced")).toHaveLength(1);
    expect(filterBySyncState(sessions, "pending")).toHaveLength(1);
    expect(filterBySyncState(sessions, "failed")).toHaveLength(1);
  });
});
