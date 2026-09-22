/**
 * Sync Retry UI
 * Shows sync failures and provides retry action with backoff countdown
 */

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { calculateBackoffDelay, retryWithBackoff } from "@/lib/network";
import { pushPendingSessions } from "@/lib/sync";

export interface SyncRetryUIProps {
  checkpoint: string;
  badge: string;
  onRetryComplete?: () => void;
}

export function SyncRetryUI({ checkpoint, badge, onRetryComplete }: SyncRetryUIProps) {
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorTime, setLastErrorTime] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  // Auto-dismiss error after 10 seconds
  useEffect(() => {
    if (!lastError) return;

    const timer = setTimeout(() => {
      setLastError(null);
      setLastErrorTime(null);
    }, 10000);

    return () => clearTimeout(timer);
  }, [lastError]);

  // Countdown timer for backoff
  useEffect(() => {
    if (countdownSeconds <= 0) return;

    const timer = setTimeout(() => {
      setCountdownSeconds(countdownSeconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdownSeconds]);

  const handleRetry = async () => {
    if (!navigator.onLine) {
      setLastError("Network offline — waiting for connectivity");
      setLastErrorTime(Date.now());
      return;
    }

    setIsRetrying(true);
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    try {
      await retryWithBackoff(
        async () => {
          await pushPendingSessions(checkpoint, badge);
        },
        3, // 3 retry attempts
        (attempt, error) => {
          if (attempt < 3) {
            const delay = calculateBackoffDelay(attempt);
            setCountdownSeconds(Math.ceil(delay / 1000));
          }
        },
      );

      setLastError(null);
      setLastErrorTime(null);
      setAttempts(0);
      setCountdownSeconds(0);
      onRetryComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setLastError(message);
      setLastErrorTime(Date.now());
    } finally {
      setIsRetrying(false);
    }
  };

  if (!lastError) return null;

  return (
    <div aria-live="assertive" className="flex items-start gap-3 px-4 py-3 bg-red-950/40 border border-status-fail/50 rounded">
      <AlertTriangle className="h-5 w-5 text-status-fail shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-status-fail">Sync Failed</p>
        <p className="text-xs text-on-surface-variant mt-1">{lastError}</p>
        {attempts > 0 && (
          <p className="text-xs text-on-surface-variant/70 mt-0.5">
            Attempts: {attempts} · Last:{" "}
            {lastErrorTime ? new Date(lastErrorTime).toLocaleTimeString() : "—"}
          </p>
        )}
      </div>
      <button
        onClick={handleRetry}
        disabled={isRetrying || countdownSeconds > 0}
        aria-label="Retry sync of pending verification sessions"
        className="h-8 px-3 bg-primary-container text-on-primary-container hover:opacity-90 disabled:opacity-50 rounded font-mono text-xs font-bold flex items-center gap-2 shrink-0 transition-opacity"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
        {countdownSeconds > 0 ? `Wait ${countdownSeconds}s` : "Retry"}
      </button>
    </div>
  );
}
