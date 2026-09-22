import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldCheck, Lock } from "lucide-react";
import { listSessions, type StoredSession } from "@/lib/engine/ledger";
import { LanguageSelector, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "VeriShield AI — HQ Admin Ledger" }] }),
  component: AdminPage,
});

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) || "http://127.0.0.1:8000";
const LS_TOKEN = "vs_admin_token";

type RiskReason = { label: string; points: number; kind: string; detail: string };
type AdminSession = {
  id: string;
  officer_badge: string | null;
  officer_name: string | null;
  checkpoint: string | null;
  document_type: string;
  extracted_fields: Record<string, string>;
  ocr_confidence: number | null;
  face_match_score: number | null;
  face_verdict: string | null;
  tamper_score: number | null;
  tamper_verdict: string | null;
  risk_score: number | null;
  risk_band: string | null;
  risk_reasons: RiskReason[];
  decision: string | null;
  note: string | null;
  review_status?: string;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  received_at: string | null;
  synced: boolean;
};
type AuditEntry = { action: string; actor: string; detail: string | null; timestamp: string };
type Stats = {
  total_sessions: number;
  by_decision: Record<string, number>;
  by_band: Record<string, number>;
  by_checkpoint: Record<string, number>;
  by_document_type: Record<string, number>;
  avg_risk_score: number | null;
  pending_review: number;
  last_24h: number;
};

const BAND_COLOR: Record<string, string> = {
  clear: "text-status-pass border-status-pass/40 bg-[rgba(16,185,129,0.1)]",
  review: "text-status-warn border-status-warn/40 bg-[rgba(245,158,11,0.1)]",
  escalate: "text-status-fail border-status-fail/40 bg-[rgba(239,68,68,0.1)]",
};
const DECISION_COLOR: Record<string, string> = {
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

function getLocalSessions(): StoredSession[] {
  return listSessions();
}

function computeLocalStats(localSessions: StoredSession[]): {
  stats: Stats;
  mappedSessions: AdminSession[];
} {
  const by_decision: Record<string, number> = { cleared: 0, referred: 0, rejected: 0, pending: 0 };
  const by_band: Record<string, number> = { clear: 0, review: 0, escalate: 0 };
  const by_checkpoint: Record<string, number> = {};
  const by_document_type: Record<string, number> = {};

  let totalScore = 0;
  let scoreCount = 0;
  let pendingCount = 0;
  let last24hCount = 0;

  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;

  const mappedSessions: AdminSession[] = localSessions.map((s) => {
    const dec = s.decision || "pending";
    by_decision[dec] = (by_decision[dec] || 0) + 1;
    if (!s.decision) pendingCount++;

    const band = s.risk.band;
    by_band[band] = (by_band[band] || 0) + 1;

    const cp = "Local device context";
    by_checkpoint[cp] = (by_checkpoint[cp] || 0) + 1;

    const dt = s.documentType;
    by_document_type[dt] = (by_document_type[dt] || 0) + 1;

    if (s.risk.score !== null) {
      totalScore += s.risk.score;
      scoreCount++;
    }

    const createdTime = new Date(s.createdAt).getTime();
    if (createdTime >= dayAgo) last24hCount++;

    return {
      id: s.id,
      officer_badge: s.officerId,
      officer_name: `Officer ${s.officerId}`,
      checkpoint: cp,
      document_type: s.documentType,
      extracted_fields: s.maskedFields,
      ocr_confidence: s.ocrConfidence,
      face_match_score: s.faceScore,
      face_verdict: s.faceVerdict,
      tamper_score: s.tamperScore,
      tamper_verdict: s.tamperVerdict,
      risk_score: s.risk.score,
      risk_band: s.risk.band,
      risk_reasons: (s.risk.contributions || []).map((c) => ({
        label: c.label,
        points: c.points,
        kind: c.kind,
        detail: c.detail,
      })),
      decision: s.decision,
      note: s.note,
      created_at: s.createdAt,
      received_at: s.createdAt,
      synced: s.synced,
    };
  });

  const stats: Stats = {
    total_sessions: localSessions.length,
    by_decision,
    by_band,
    by_checkpoint,
    by_document_type,
    avg_risk_score: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    pending_review: pendingCount,
    last_24h: last24hCount,
  };

  return { stats, mappedSessions };
}

type OperationalAnalytics = {
  total_screenings: number;
  accepted_count: number;
  rejected_count: number;
  review_count: number;
  pending_sync_count: number;
  synced_count: number;
  sync_failed_count: number;
  risk_band_distribution: Record<string, number>;
  document_type_distribution: Record<string, number>;
  acceptance_rate: number;
  rejection_rate: number;
  review_rate: number;
  average_risk_score: number;
  screenings_over_time: { date: string; count: number }[];
  checkpoint_activity: { checkpoint: string; count: number }[];
  officer_activity: { officer: string; count: number }[];
  evidence_signals: {
    verhoeff_failures: number;
    mrz_failures: number;
    dl_format_failures: number;
    consistency_failures: number;
    ela_hotspots: number;
    face_mismatches: number;
  };
};

function TimeSeriesChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center font-mono text-xs text-on-surface-variant">
        No screening activity recorded over this period.
      </div>
    );
  }
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const width = 600;
  const height = 140;
  const padding = 25;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (d.count / maxCount) * (height - padding * 2);
    return { x, y, ...d };
  });

  const pathD = points.reduce(
    (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    "",
  );

  return (
    <div className="w-full flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
        {/* Grid lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = height - padding - ratio * (height - padding * 2);
          return (
            <line
              key={ratio}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
            />
          );
        })}
        {/* Line */}
        <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" />
        {/* Points */}
        {points.map((p, i) => (
          <g key={i} className="group cursor-pointer">
            <circle cx={p.x} cy={p.y} r="4" fill="#10b981" />
            <title>{`${p.date}: ${p.count} screenings`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[9px] text-on-surface-variant px-2">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function AdminPage() {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(LS_TOKEN) : null,
  );
  const [passcode, setPasscode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<OperationalAnalytics | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [filters, setFilters] = useState({
    checkpoint: "",
    decision: "",
    band: "",
    document_type: "",
    review_status: "",
    q: "",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [selected, setSelected] = useState<AdminSession | null>(null);
  const [reviewStatusInput, setReviewStatusInput] = useState<string>("OPEN");
  const [reviewNoteInput, setReviewNoteInput] = useState<string>("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditIntegrity, setAuditIntegrity] = useState<{ status: string; detail: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const authed = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      }),
    [token],
  );

  const verifyAuditChain = useCallback(async () => {
    try {
      const res = await authed("/admin/audit/verify");
      if (res.ok) {
        const data = await res.json();
        setAuditIntegrity({ status: data.status, detail: data.detail || `Chain ${data.status}` });
      }
    } catch {
      setAuditIntegrity({
        status: "UNAVAILABLE",
        detail: "Audit verification service unreachable.",
      });
    }
  }, [authed]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr("");

    const localSess = getLocalSessions();
    const { stats: lStats, mappedSessions: lMapped } = computeLocalStats(localSess);

    try {
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      if (filters.checkpoint) params.set("checkpoint", filters.checkpoint);
      if (filters.decision) params.set("decision", filters.decision);
      if (filters.band) params.set("band", filters.band);
      if (filters.document_type) params.set("document_type", filters.document_type);
      if (filters.review_status) params.set("review_status", filters.review_status);
      if (filters.q) params.set("q", filters.q);

      const [sRes, statRes, analRes] = await Promise.all([
        authed(`/admin/sessions?${params.toString()}`),
        authed("/admin/stats"),
        authed("/admin/analytics"),
      ]);

      if (sRes.ok && statRes.ok) {
        setSessions(await sRes.json());
        setStats(await statRes.json());
        if (analRes.ok) {
          setAnalytics(await analRes.json());
        }
      } else {
        setSessions(lMapped);
        setStats(lStats);
      }
    } catch {
      setSessions(lMapped);
      setStats(lStats);
    } finally {
      setLoading(false);
    }
  }, [token, filters, page, authed]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReport = useCallback(async () => {
    if (!token) return;
    setExporting(true);
    try {
      const res = await authed("/admin/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `VeriShield_HQ_Operational_Report_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Failed to export report.");
    } finally {
      setExporting(false);
    }
  }, [authed, token]);

  const login = useCallback(async () => {
    setLoginErr("");
    const cleanPass = passcode.trim();
    if (!cleanPass) {
      setLoginErr("Please enter the HQ admin passcode.");
      return;
    }

    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          if (typeof window !== "undefined") {
            sessionStorage.setItem(LS_TOKEN, data.token);
          }
          setToken(data.token);
        } else {
          setLoginErr("Authentication failed: invalid token received.");
        }
      } else if (res.status === 401) {
        setLoginErr("Authentication failed: incorrect admin passcode.");
      } else if (res.status === 429) {
        setLoginErr("Authentication rate limited. Please wait 1 minute before retrying.");
      } else {
        setLoginErr(`Authentication failed (HTTP ${res.status}).`);
      }
    } catch {
      setLoginErr("HQ authentication service unavailable. Reconnect to the authorized HQ service.");
    } finally {
      setLoginLoading(false);
    }
  }, [passcode]);

  const openSession = useCallback(
    async (s: AdminSession) => {
      setSelected(s);
      setReviewStatusInput(s.review_status || "OPEN");
      setReviewNoteInput(s.review_notes || "");
      setAuditLog([]);
      try {
        const res = await authed(`/admin/sessions/${s.id}`);
        if (res.ok) {
          const data = await res.json();
          setAuditLog(data.audit_log ?? []);
        }
      } catch {
        /* detail view displays local session info */
      }
    },
    [authed],
  );

  const saveCaseReview = useCallback(async () => {
    if (!selected || !token) return;
    setReviewSaving(true);
    try {
      const res = await authed(`/admin/sessions/${selected.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: reviewStatusInput,
          note: reviewNoteInput,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                review_status: updated.review_status,
                review_notes: updated.review_notes,
                reviewed_by: updated.reviewed_by,
                reviewed_at: updated.reviewed_at,
              }
            : null,
        );
        void load();
      }
    } catch {
      alert("Failed to update case review.");
    } finally {
      setReviewSaving(false);
    }
  }, [selected, token, reviewStatusInput, reviewNoteInput, authed, load]);

  const checkpointOptions = useMemo(() => Object.keys(stats?.by_checkpoint ?? {}), [stats]);

  if (!token) {
    return (
      <div className="min-h-dvh bg-slate-950 flex items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-7 shadow-2xl backdrop-blur-xl flex flex-col gap-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white mt-1">
              VeriShield AI — HQ Admin
            </h1>
            <p className="text-xs text-slate-400">
              Authenticated Ledger over all screening sessions &amp; checkpoint metrics.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Lock className="h-3 w-3 text-emerald-400" /> Security Passcode
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passcode}
                  placeholder="Enter HQ admin passcode"
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full h-12 bg-slate-950 border border-slate-800 rounded-xl px-4 pr-11 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {loginErr && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/50 p-3 text-xs text-rose-300 font-mono">
                {loginErr}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="h-12 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm uppercase tracking-wider rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all duration-200 shadow-lg disabled:opacity-50"
            >
              {loginLoading ? "Authenticating..." : "Enter HQ Ledger"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-on-surface font-sans flex flex-col">
      <header className="border-b border-outline-variant px-6 h-14 flex items-center justify-between shrink-0 bg-surface-container-low">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined ms-fill text-primary" style={{ fontSize: 22 }}>
            admin_panel_settings
          </span>
          <span className="font-bold text-on-surface">VeriShield AI — HQ Admin Ledger</span>
        </div>
        <div className="flex items-center gap-3">
          {auditIntegrity && (
            <span
              className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded border ${
                auditIntegrity.status === "VALID"
                  ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/60 border-rose-500/40 text-rose-300"
              }`}
              title={auditIntegrity.detail}
            >
              AUDIT CHAIN: {auditIntegrity.status}
            </span>
          )}
          <button
            onClick={() => void exportReport()}
            disabled={exporting}
            className="text-xs font-mono font-semibold text-emerald-400 hover:underline px-2.5 py-1 bg-emerald-950/50 rounded border border-emerald-500/30"
          >
            {exporting ? "Exporting..." : "Export Report (JSON)"}
          </button>
          <button
            onClick={() => void verifyAuditChain()}
            className="text-xs font-mono font-semibold text-primary hover:underline px-2.5 py-1 bg-surface-container rounded border border-outline-variant"
          >
            Verify Audit Chain
          </button>
          <LanguageSelector />
          <Link
            to="/"
            className="text-xs font-mono font-semibold text-primary hover:underline px-2 py-1 bg-surface-container rounded border border-outline-variant"
          >
            ← Officer Workstation
          </Link>
          <Link
            to="/cases"
            className="text-xs font-mono font-semibold text-primary hover:underline px-2 py-1 bg-surface-container rounded border border-outline-variant"
          >
            Cases
          </Link>
          <Link
            to="/intelligence"
            className="text-xs font-mono font-semibold text-primary hover:underline px-2 py-1 bg-surface-container rounded border border-outline-variant"
          >
            Intelligence
          </Link>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem(LS_TOKEN);
              }
              setToken(null);
            }}
            className="font-mono text-[11px] text-on-surface-variant hover:text-on-surface"
          >
            LOG OUT
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {err && (
          <div className="px-4 py-3 border border-status-fail/40 bg-[rgba(239,68,68,0.08)] text-status-fail text-sm rounded font-mono">
            {err}
          </div>
        )}

        {/* Operational Key Metrics */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Total Sessions", stats.total_sessions],
              ["Last 24h", stats.last_24h],
              ["Acceptance Rate", analytics ? `${analytics.acceptance_rate}%` : "—"],
              ["Avg Risk Score", stats.avg_risk_score ?? "—"],
              ["Pending Review", stats.pending_review],
            ].map(([label, val]) => (
              <div
                key={label as string}
                className="bg-surface-container border border-outline-variant rounded-lg p-4"
              >
                <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">
                  {label}
                </p>
                <p className="text-2xl font-bold text-on-surface mt-1">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Time-Series Analytics & Observed Evidence Signals */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-surface-container border border-outline-variant rounded-lg p-4">
              <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-3">
                Screening Volume Over Time (Last 14 Days)
              </p>
              <TimeSeriesChart data={analytics.screenings_over_time} />
            </div>

            <div className="bg-surface-container border border-outline-variant rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
                  Observed Evidence Signals
                </p>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Verhoeff Failures:</span>
                    <span className="font-bold">
                      {analytics.evidence_signals.verhoeff_failures}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">MRZ Failures:</span>
                    <span className="font-bold">{analytics.evidence_signals.mrz_failures}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">DL Format Anomalies:</span>
                    <span className="font-bold">
                      {analytics.evidence_signals.dl_format_failures}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Consistency Failures:</span>
                    <span className="font-bold">
                      {analytics.evidence_signals.consistency_failures}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">ELA Hotspots (&ge;45):</span>
                    <span className="font-bold text-status-warn">
                      {analytics.evidence_signals.ela_hotspots}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Face Mismatches:</span>
                    <span className="font-bold text-status-fail">
                      {analytics.evidence_signals.face_mismatches}
                    </span>
                  </div>
                </div>
              </div>
              <p className="font-mono text-[9px] text-on-surface-variant/60 mt-3">
                * Operational screening signals derived from local verification metrics. Not
                authoritative fraud claims.
              </p>
            </div>
          </div>
        )}

        {/* Operational Distributions */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                ["By decision", stats.by_decision],
                ["By risk band", stats.by_band],
                ["By checkpoint", stats.by_checkpoint],
              ] as [string, Record<string, number>][]
            ).map(([title, breakdown]) => (
              <div
                key={title}
                className="bg-surface-container border border-outline-variant rounded-lg p-4"
              >
                <p className="font-mono text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-2">
                  {title}
                </p>
                <div className="flex flex-col gap-1">
                  {Object.entries(breakdown || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-on-surface-variant capitalize">{k}</span>
                      <span className="font-mono text-on-surface">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Operational Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search session ID or officer badge..."
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          />
          <select
            value={filters.checkpoint}
            onChange={(e) => setFilters((f) => ({ ...f, checkpoint: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          >
            <option value="">All Checkpoints</option>
            {checkpointOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filters.document_type}
            onChange={(e) => setFilters((f) => ({ ...f, document_type: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          >
            <option value="">All Document Types</option>
            <option value="aadhaar">Aadhaar</option>
            <option value="passport">Passport</option>
            <option value="dl">Driving Licence</option>
            <option value="visa">Visa</option>
          </select>
          <select
            value={filters.decision}
            onChange={(e) => setFilters((f) => ({ ...f, decision: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          >
            <option value="">All Decisions</option>
            <option value="cleared">Cleared</option>
            <option value="referred">Referred</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={filters.band}
            onChange={(e) => setFilters((f) => ({ ...f, band: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          >
            <option value="">All Risk Bands</option>
            <option value="clear">Clear</option>
            <option value="review">Review</option>
            <option value="escalate">Escalate</option>
          </select>
          <select
            value={filters.review_status}
            onChange={(e) => setFilters((f) => ({ ...f, review_status: e.target.value }))}
            className="h-10 bg-surface-container border border-outline-variant rounded px-3 text-sm text-on-surface focus:outline-none"
          >
            <option value="">All Review Statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CLEARED">Cleared (Ops)</option>
            <option value="ESCALATED">Escalated</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Sessions Table & Case Detail Modal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                  <th className="p-3">Session ID</th>
                  <th className="p-3">Doc</th>
                  <th className="p-3">Checkpoint</th>
                  <th className="p-3">Risk Band</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Review Status</th>
                  <th className="p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-4 text-center text-xs text-on-surface-variant font-mono"
                    >
                      Loading sessions...
                    </td>
                  </tr>
                )}
                {!loading && sessions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-4 text-center text-xs text-on-surface-variant font-mono"
                    >
                      No sessions found matching current operational filters.
                    </td>
                  </tr>
                )}
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => void openSession(s)}
                    className={`border-b border-outline-variant/50 hover:bg-surface-container cursor-pointer transition-colors ${selected?.id === s.id ? "bg-surface-container" : ""}`}
                  >
                    <td className="p-3 font-mono font-bold text-xs">{s.id.slice(0, 14)}...</td>
                    <td className="p-3 capitalize text-xs">{s.document_type}</td>
                    <td className="p-3 text-xs">{s.checkpoint || "—"}</td>
                    <td className="p-3">
                      {s.risk_band && (
                        <Pill cls={BAND_COLOR[s.risk_band] ?? ""}>{s.risk_band}</Pill>
                      )}
                    </td>
                    <td className="p-3 text-xs font-bold capitalize">
                      {s.decision ? (
                        <span className={DECISION_COLOR[s.decision] ?? ""}>{s.decision}</span>
                      ) : (
                        <span className="text-on-surface-variant font-normal">Pending</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[10px] font-bold">
                      <span className="px-2 py-0.5 rounded border border-outline-variant bg-surface-container">
                        {s.review_status || "OPEN"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-on-surface-variant">
                      {new Date(s.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant p-3 border-t border-outline-variant bg-surface-container">
              <span>
                Page {page} (Showing {sessions.length} records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border border-outline-variant bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 font-semibold"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={sessions.length < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded border border-outline-variant bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 font-semibold"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {selected && (
            <div className="border border-outline-variant rounded-lg p-5 bg-surface-container-low flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    Case Review &amp; Detail
                  </p>
                  <h3 className="text-lg font-bold text-on-surface font-mono">{selected.id}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-on-surface-variant hover:text-on-surface font-mono"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-surface-container p-3 rounded">
                <div>
                  <span className="text-on-surface-variant uppercase text-[9px] block">
                    Officer
                  </span>
                  {selected.officer_badge || "—"}
                </div>
                <div>
                  <span className="text-on-surface-variant uppercase text-[9px] block">
                    Checkpoint
                  </span>
                  {selected.checkpoint || "—"}
                </div>
                <div>
                  <span className="text-on-surface-variant uppercase text-[9px] block">
                    OCR Conf.
                  </span>
                  {selected.ocr_confidence ? `${selected.ocr_confidence}%` : "—"}
                </div>
                <div>
                  <span className="text-on-surface-variant uppercase text-[9px] block">
                    Face Score
                  </span>
                  {selected.face_match_score ? `${selected.face_match_score}%` : "—"}
                </div>
              </div>

              {/* Case Review Workflow UI */}
              <div className="border border-outline-variant bg-surface-container p-3.5 rounded-lg space-y-3">
                <p className="font-mono text-[10px] font-bold text-primary uppercase tracking-widest">
                  Manual Review Workflow
                </p>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10px] text-on-surface-variant">
                    Review Status:
                  </label>
                  <select
                    value={reviewStatusInput}
                    onChange={(e) => setReviewStatusInput(e.target.value)}
                    className="h-9 bg-surface-container-high border border-outline-variant rounded px-2 font-mono text-xs text-on-surface"
                  >
                    <option value="OPEN">OPEN (Default Triage)</option>
                    <option value="UNDER_REVIEW">UNDER REVIEW</option>
                    <option value="CLEARED">CLEARED FOR OPERATIONAL PURPOSES</option>
                    <option value="ESCALATED">ESCALATED TO SECONDARY</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10px] text-on-surface-variant">
                    Supervisor Note (Max 1000 chars):
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reviewNoteInput}
                    placeholder="Enter operational case notes..."
                    onChange={(e) => setReviewNoteInput(e.target.value)}
                    className="bg-surface-container-high border border-outline-variant rounded p-2 font-mono text-xs text-on-surface resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void saveCaseReview()}
                  disabled={reviewSaving}
                  className="w-full h-8 bg-primary text-on-primary font-mono text-xs font-bold rounded uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
                >
                  {reviewSaving ? "Saving Review..." : "Update Case Review"}
                </button>
              </div>

              {selected.extracted_fields && Object.keys(selected.extracted_fields).length > 0 && (
                <div>
                  <p className="font-mono text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                    Masked Fields
                  </p>
                  <div className="bg-surface-container p-3 rounded space-y-1 font-mono text-xs">
                    {Object.entries(selected.extracted_fields).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-on-surface-variant">{k}:</span>
                        <span className="font-bold text-on-surface">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {auditLog.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                    Audit Log
                  </p>
                  <div className="space-y-1 text-xs font-mono">
                    {auditLog.map((a, i) => (
                      <div key={i} className="bg-surface-container p-2 rounded">
                        <span className="font-bold text-primary">{a.action}</span> by {a.actor}
                        {a.detail && (
                          <p className="text-[11px] text-on-surface-variant mt-0.5">{a.detail}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
