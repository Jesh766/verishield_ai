import { CameraCapture } from "@/components/verishield/CameraCapture";
import { NetworkStatusIndicator } from "@/components/verishield/NetworkStatusIndicator";
import { StorageQuotaWarning } from "@/components/verishield/StorageQuotaWarning";
import { SyncRetryUI } from "@/components/verishield/SyncRetryUI";
import { AiStage } from "@/components/verishield/screening/AiStage";
import { AssistantStage } from "@/components/verishield/screening/AssistantStage";
import { CaptureStage } from "@/components/verishield/screening/CaptureStage";
import { ExtractionStage } from "@/components/verishield/screening/ExtractionStage";
import { LoginStage } from "@/components/verishield/screening/LoginStage";
import { RecordedStage } from "@/components/verishield/screening/RecordedStage";
import { RiskStage } from "@/components/verishield/screening/RiskStage";
import { WorkingStage } from "@/components/verishield/screening/WorkingStage";
import {
  LS_BADGE,
  LS_CP,
  tickerFor,
  type Stage,
} from "@/components/verishield/screening/screeningUtils";
import { scoreRisk } from "@/lib/engine/risk";
import { validateUploadFile } from "@/lib/file-validation";
import { LanguageSelector } from "@/lib/i18n";
import {
  createNetworkMonitor,
  createSyncTracker,
  type NetworkState,
  type SyncStatus,
} from "@/lib/network";
import { pushPendingSessions } from "@/lib/sync";
import {
  DOC_LABEL,
  listSessions,
  matchFaces,
  pendingSyncCount,
  recordDecision,
  screen,
  updateSession,
  warmOcr,
  type FaceMatchResult,
  type ScreeningResult,
} from "@/lib/verishield";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VeriShield AI — Officer Field Screening" },
      { name: "description", content: "On-device identity screening." },
    ],
  }),
  component: OfficerScreen,
});

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
function OfficerScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("login");
  const [prevStage, setPrevStage] = useState<Stage>("risk");
  const [officer, setOfficer] = useState<{ badge: string; checkpoint: string } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [face, setFace] = useState<FaceMatchResult | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [decision, setDecision] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [recent, setRecent] = useState<{ id: string; band: string; type: string }[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [camera, setCamera] = useState<null | "document" | "face">(null);
  const [now, setNow] = useState(new Date());

  // Network and sync state
  const [networkState, setNetworkState] = useState<NetworkState>("online");
  const [backendOk, setBackendOk] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    pendingCount: 0,
  });
  const [showSyncRetry, setShowSyncRetry] = useState(false);

  const capture = useRef<Blob | null>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const faceInput = useRef<HTMLInputElement>(null);

  const refreshLedger = useCallback(() => {
    setPending(pendingSyncCount());
    setRecent(
      listSessions()
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          band: s.risk.band,
          type: DOC_LABEL[s.documentType] ?? s.documentType,
        })),
    );
  }, []);

  useEffect(() => {
    // Cache the local receipt route while online so a decided case remains
    // viewable after the device loses connectivity.
    void router
      .preloadRoute({ to: "/session/$id", params: { id: "offline-receipt" } })
      .catch(() => undefined);

    // Restore officer session
    const badge = localStorage.getItem(LS_BADGE);
    const cp = localStorage.getItem(LS_CP);
    if (badge && cp) {
      setOfficer({ badge, checkpoint: cp });
      setStage("capture");
    }

    // Clock
    const tick = setInterval(() => setNow(new Date()), 1000);

    // Initialize network monitoring
    const networkMonitor = createNetworkMonitor((state) => {
      setNetworkState(state);
      setOnline(state === "online"); // Backward compatibility

      // Auto-sync when coming back online
      if (state === "online") {
        const badge = localStorage.getItem(LS_BADGE);
        const cp = localStorage.getItem(LS_CP);

        if (badge && cp) {
          void pushPendingSessions(cp, badge).then(refreshLedger);
        }
      }
    });

    // Initialize sync tracker
    const syncTracker = createSyncTracker();
    const unsubscribeSync = syncTracker.subscribe((status) => {
      setSyncStatus(status);
      setPending(status.pendingCount);

      // Show retry UI if sync failed
      if (status.state === "failed") {
        setShowSyncRetry(true);
      }
    });

    refreshLedger();
    void warmOcr(setStatus).then((ok) => {
      setModelReady(ok);
      setStatus("");
    });

    return () => {
      clearInterval(tick);
      networkMonitor.destroy();
      unsubscribeSync();
    };
  }, [refreshLedger, router]);

  const handleLogin = useCallback((badge: string, cp: string) => {
    localStorage.setItem(LS_BADGE, badge);
    localStorage.setItem(LS_CP, cp);
    setOfficer({ badge, checkpoint: cp });
    setStage("capture");
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(LS_BADGE);
    localStorage.removeItem(LS_CP);
    setOfficer(null);
    capture.current = null;
    setResult(null);
    setFace(null);
    setDecision(null);
    setStage("login");
  }, []);

  const runScreening = useCallback(
    async (file: Blob) => {
      setError(null);
      setFace(null);
      setDecision(null);
      setNote("");
      setStage("working");
      capture.current = file;
      try {
        // Validate file before processing
        const validation = await validateUploadFile(file);
        if (!validation.valid) {
          setError(validation.error || "File validation failed.");
          setStage("capture");
          return;
        }

        const outcome = await screen(file, null, setStatus, null, officer?.badge);
        setResult(outcome);
        setStage("extraction");
        refreshLedger();
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message} — recapture with the document flat and filling the frame.`
            : "Capture could not be processed.",
        );
        setStage("capture");
      } finally {
        setStatus("");
      }
    },
    [refreshLedger, officer],
  );

  const runFaceMatch = useCallback(
    async (file: Blob) => {
      if (!capture.current || !result) return;
      setFaceBusy(true);
      try {
        const match = await matchFaces(capture.current, file);
        setFace(match);
        const risk = scoreRisk({
          checks: result.checks,
          ocrConfidence: result.ocr.confidence,
          tamper: result.tamper,
          face: match,
        });
        const updated = { ...result, face: match, risk };
        setResult(updated);
        updateSession(result.sessionId, {
          risk,
          faceScore: match.verdict === "no_face" ? null : match.score,
          faceVerdict: match.verdict,
        });
        refreshLedger();
      } catch {
        setError("Face comparison could not run on this capture.");
      } finally {
        setFaceBusy(false);
      }
    },
    [result, refreshLedger],
  );

  const commit = useCallback(
    (key: "cleared" | "referred" | "rejected") => {
      if (!result) return;

      recordDecision(result.sessionId, key, note);
      capture.current = null;
      setDecision(key);
      setStage("recorded");
      refreshLedger();

      if (online && officer) {
        void pushPendingSessions(officer.checkpoint, officer.badge).then(refreshLedger);
      }
    },
    [note, result, refreshLedger, online, officer],
  );

  const reset = () => {
    capture.current = null;
    setResult(null);
    setFace(null);
    setDecision(null);
    setNote("");
    setError(null);
    setStage("capture");
  };

  const openAssistant = (from: Stage) => {
    setPrevStage(from);
    setStage("assistant");
  };

  // Ticker
  const ticker =
    stage !== "login" && stage !== "capture" && stage !== "working"
      ? tickerFor(stage, result?.risk.band)
      : stage === "working"
        ? tickerFor("working")
        : null;

  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Nav items
  const NAV_ITEMS = [
    {
      icon: "document_scanner",
      label: "SCAN",
      action: () => {
        if (stage !== "capture") reset();
      },
    },
    {
      icon: "history",
      label: "HISTORY",
      action: () => {
        void router.navigate({ to: "/history" });
      },
    },
    { icon: "smart_toy", label: "ASSIST", action: () => openAssistant(stage as Stage) },
    { icon: "account_circle", label: "PROFILE", action: handleLogout },
  ];

  return (
    <div className="min-h-dvh bg-background text-on-surface font-sans flex flex-col">
      {/* ─ TOP APP BAR ─ */}
      {stage !== "login" && (
        <header className="bg-background border-b border-outline-variant flex items-center justify-between px-6 h-12 shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined ms-fill text-primary"
              style={{ fontSize: 20 }}
            >
              security
            </span>
            <span className="font-mono text-[11px] font-bold tracking-widest text-primary">
              {networkState === "offline"
                ? "FIELD MODE — OFFLINE"
                : !backendOk
                  ? "FIELD MODE — BACKEND UNAVAILABLE"
                  : syncStatus.state === "syncing"
                    ? "FIELD MODE — SYNCING"
                    : "FIELD MODE — ONLINE"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <NetworkStatusIndicator />
            <span
              className={`w-2 h-2 rounded-full ${modelReady ? "bg-status-pass" : "bg-status-warn"}`}
              title={modelReady ? "Engine ready" : "Engine loading"}
            />
            <Link
              to="/admin"
              title="HQ Admin"
              className="h-8 px-2 flex items-center text-on-surface-variant hover:bg-surface-container-highest transition-colors rounded"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                admin_panel_settings
              </span>
            </Link>
            <Link
              to="/cases"
              title="Case investigations"
              className="h-8 px-2 flex items-center text-on-surface-variant hover:bg-surface-container-highest transition-colors rounded"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                folder_open
              </span>
            </Link>
            <Link
              to="/intelligence"
              title="Fraud intelligence"
              className="h-8 px-2 flex items-center text-on-surface-variant hover:bg-surface-container-highest transition-colors rounded"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                query_stats
              </span>
            </Link>

            <button
              onClick={handleLogout}
              className="h-8 px-2 text-on-surface-variant hover:bg-surface-container-highest transition-colors rounded"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                settings
              </span>
            </button>
          </div>
        </header>
      )}

      {/* ─ STATUS TICKER ─ */}
      {ticker && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-2.5 font-mono text-[11px] font-bold tracking-widest shrink-0 ${ticker.bg} ${ticker.text}`}
        >
          <span
            className={`material-symbols-outlined ${ticker.spin ? "spin" : ""}`}
            style={{ fontSize: 16 }}
          >
            {ticker.icon}
          </span>
          {ticker.msg}
        </div>
      )}

      {/* ─ WARNING PANELS ─ */}
      {stage !== "login" && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-surface-container-low border-b border-outline-variant/50 shrink-0">
          {officer && showSyncRetry && (
            <SyncRetryUI
              checkpoint={officer.checkpoint}
              badge={officer.badge}
              onRetryComplete={() => setShowSyncRetry(false)}
            />
          )}
          <StorageQuotaWarning />
        </div>
      )}

      {/* ─ MAIN ─ */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ paddingBottom: stage !== "login" ? "64px" : 0 }}
      >
        {stage === "login" && <LoginStage onLogin={handleLogin} />}
        {stage === "capture" && (
          <CaptureStage
            modelReady={modelReady}
            error={error}
            recent={recent}
            onCamera={() => setCamera("document")}
            onUpload={() => docInput.current?.click()}
          />
        )}
        {stage === "working" && <WorkingStage status={status} />}
        {stage === "extraction" && result && (
          <ExtractionStage result={result} onContinue={() => setStage("ai")} onReset={reset} />
        )}
        {stage === "ai" && result && (
          <AiStage
            result={result}
            face={face}
            faceBusy={faceBusy}
            onCaptureface={() => setCamera("face")}
            onFaceUpload={() => faceInput.current?.click()}
            onContinue={() => setStage("risk")}
          />
        )}
        {stage === "risk" && result && (
          <RiskStage
            result={result}
            face={face}
            note={note}
            onNote={setNote}
            onCommit={commit}
            onReset={reset}
          />
        )}
        {stage === "assistant" && (
          <AssistantStage
            result={result}
            face={face}
            officer={officer}
            onBack={() => setStage(prevStage)}
          />
        )}
        {stage === "recorded" && result && decision && (
          <RecordedStage result={result} decision={decision} online={online} onNext={reset} />
        )}
      </main>

      {/* ─ BOTTOM NAV (mobile) ─ */}
      {stage !== "login" && (
        <nav className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-low border-t border-outline-variant flex justify-around items-center px-2 py-2 md:hidden">
          {NAV_ITEMS.map((item, i) => {
            const isActive =
              (item.label === "ASSIST" && stage === "assistant") ||
              (item.label === "SCAN" && (stage === "capture" || stage === "working"));
            return (
              <button
                key={i}
                onClick={item.action}
                className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] px-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                <span
                  className={`material-symbols-outlined ${isActive ? "ms-fill" : ""}`}
                  style={{ fontSize: 22 }}
                >
                  {item.icon}
                </span>
                <span className="font-mono text-[9px] font-bold tracking-widest mt-0.5">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ─ DESKTOP FOOTER ─ */}
      {stage !== "login" && officer && (
        <div className="hidden md:flex fixed bottom-0 left-0 w-full px-6 py-1.5 bg-surface-container-lowest border-t border-outline-variant justify-between items-center z-40">
          <span className="font-mono text-[10px] text-on-surface-variant/50">
            OFFICER: {officer.badge} · {officer.checkpoint}
          </span>
          <span className="font-mono text-[10px] text-on-surface-variant/50">
            SYS_TIME: {timeStr} UTC · {online ? "ONLINE" : "OFFLINE · " + pending + " PENDING"}
          </span>
        </div>
      )}

      {/* ─ CAMERA MODAL ─ */}
      {camera && (
        <CameraCapture
          facing={camera === "document" ? "environment" : "user"}
          title={camera === "document" ? "Frame the document" : "Frame the holder's face"}
          hint={
            camera === "document"
              ? "Fill the guide, keep it flat, avoid glare on the number."
              : "Eyes level, even light, no sunglasses."
          }
          onCapture={(blob) => {
            setCamera(null);
            if (camera === "document") void runScreening(blob);
            else void runFaceMatch(blob);
          }}
          onClose={() => setCamera(null)}
        />
      )}

      {/* ─ HIDDEN FILE INPUTS ─ */}
      <input
        ref={docInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void runScreening(f);
        }}
      />
      <input
        ref={faceInput}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void runFaceMatch(f);
        }}
      />
    </div>
  );
}
