/**
 * Network state management for offline-first workflow.
 * Tracks online/offline status and sync state.
 */

export type NetworkState = "online" | "offline" | "syncing";

export interface SyncError {
  message: string;
  timestamp: number;
  attempts?: number | undefined;
  retryAfter?: number | undefined;
}

/**
 * Monitor network connectivity with exponential backoff retry logic.
 * Returns observable network state changes.
 */
export function createNetworkMonitor(onStateChange?: (state: NetworkState) => void) {
  let currentState: NetworkState = navigator.onLine ? "online" : "offline";
  let listeners: ((state: NetworkState) => void)[] = [];
  if (onStateChange) {
    listeners.push(onStateChange);
  }

  function setState(newState: NetworkState) {
    if (currentState !== newState) {
      currentState = newState;
      listeners.forEach((l) => l(currentState));
    }
  }

  function handleOnline() {
    setState("online");
  }

  function handleOffline() {
    setState("offline");
  }

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return {
    getState: () => currentState,
    subscribe: (listener: (state: NetworkState) => void) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    destroy: () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      listeners = [];
    },
  };
}

/**
 * Exponential backoff retry logic for failed syncs.
 * Caps at 5 attempts with max 30-second wait.
 */
export function calculateBackoffDelay(attempt: number): number {
  if (attempt < 1) return 0;
  if (attempt > 5) return 30000; // Cap at 30 seconds

  // 1s, 2s, 4s, 8s, 16s max
  const baseDelay = Math.pow(2, attempt - 1) * 1000;
  const maxDelay = 30000;
  const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd

  return Math.min(baseDelay + jitter, maxDelay);
}

/**
 * Retry a promise with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 5,
  onAttempt?: (attempt: number, error: Error) => void,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      onAttempt?.(attempt, lastError);

      if (attempt < maxAttempts) {
        const delay = calculateBackoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Retry limit exceeded");
}

/**
 * Health check with timeout.
 * Pings /health/live endpoint to verify backend availability.
 */
export async function performHealthCheck(timeout: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch("/api/health/live", {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sync status tracker for UI feedback.
 */
export interface SyncStatus {
  state: "idle" | "syncing" | "pending" | "failed";
  pendingCount: number;
  lastError?: SyncError | undefined;
  lastSuccessTime?: number | undefined;
}

export function createSyncTracker(initialStatus?: Partial<SyncStatus>): {
  getStatus: () => SyncStatus;
  startSync: () => void;
  markSuccess: () => void;
  markFailure: (error: string, attempts?: number) => void;
  addPending: (count: number) => void;
  subscribe: (listener: (status: SyncStatus) => void) => () => void;
} {
  let status: SyncStatus = {
    state: "idle",
    pendingCount: 0,
    ...initialStatus,
  };
  let listeners: ((status: SyncStatus) => void)[] = [];

  function setState(newStatus: SyncStatus) {
    status = newStatus;
    listeners.forEach((l) => l(status));
  }

  return {
    getStatus: () => status,
    startSync: () => {
      setState({ ...status, state: "syncing" });
    },
    markSuccess: () => {
      setState({
        ...status,
        state: status.pendingCount > 0 ? "pending" : "idle",
        lastSuccessTime: Date.now(),
        lastError: undefined,
      });
    },
    markFailure: (error: string, attempts?: number) => {
      setState({
        ...status,
        state: "failed",
        lastError: {
          message: error,
          timestamp: Date.now(),
          attempts,
          retryAfter: calculateBackoffDelay(attempts || 1),
        },
      });
    },
    addPending: (count: number) => {
      const newCount = Math.max(0, status.pendingCount + count);
      setState({
        ...status,
        state: newCount > 0 ? "pending" : status.state === "syncing" ? "syncing" : "idle",
        pendingCount: newCount,
      });
    },
    subscribe: (listener: (status: SyncStatus) => void) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
