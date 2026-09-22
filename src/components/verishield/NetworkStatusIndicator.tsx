/**
 * Network Status Indicator
 * Shows actual network and backend availability state
 */

import { useEffect, useState } from "react";
import { Activity, AlertCircle, Check, Wifi, WifiOff } from "lucide-react";
import { createNetworkMonitor, performHealthCheck, createSyncTracker } from "@/lib/network";
import type { NetworkState, SyncStatus } from "@/lib/network";

export interface NetworkStatusIndicatorProps {
  onStateChange?: (state: { network: NetworkState; backend: boolean; sync: SyncStatus }) => void;
}

export function NetworkStatusIndicator({ onStateChange }: NetworkStatusIndicatorProps) {
  const [networkState, setNetworkState] = useState<NetworkState>("online");
  const [backendOk, setBackendOk] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    pendingCount: 0,
  });
  const [healthCheckTime, setHealthCheckTime] = useState(0);

  useEffect(() => {
    // Create network monitor
    const networkMonitor = createNetworkMonitor((state) => {
      setNetworkState(state);
    });

    // Create sync tracker
    const syncTracker = createSyncTracker();

    // Health check interval (30s)
    const healthCheckInterval = setInterval(async () => {
      const isHealthy = await performHealthCheck(5000);
      setBackendOk(isHealthy);
      setHealthCheckTime(Date.now());
    }, 30000);

    // Initial health check
    void performHealthCheck(5000).then(setBackendOk);

    return () => {
      clearInterval(healthCheckInterval);
      networkMonitor.destroy();
    };
  }, []);

  // Sync status tracking
  useEffect(() => {
    const unsubscribe = createSyncTracker().subscribe((status) => {
      setSyncStatus(status);
    });
    return () => unsubscribe();
  }, []);

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.({ network: networkState, backend: backendOk, sync: syncStatus });
  }, [networkState, backendOk, syncStatus, onStateChange]);

  // Determine display state
  const getDisplayState = () => {
    if (networkState === "offline") {
      return {
        icon: WifiOff,
        label: "OFFLINE",
        detail: "No network connectivity",
        color: "text-status-fail",
        bgColor: "bg-red-950/40",
        borderColor: "border-status-fail/50",
      };
    }

    if (!backendOk) {
      return {
        icon: AlertCircle,
        label: "BACKEND UNAVAILABLE",
        detail: "Server not responding",
        color: "text-status-warn",
        bgColor: "bg-yellow-950/40",
        borderColor: "border-status-warn/50",
      };
    }

    if (syncStatus.state === "syncing") {
      return {
        icon: Activity,
        label: "SYNCING",
        detail: `${syncStatus.pendingCount} pending`,
        color: "text-primary",
        bgColor: "bg-blue-950/40",
        borderColor: "border-primary/50",
      };
    }

    if (syncStatus.state === "failed") {
      return {
        icon: AlertCircle,
        label: "SYNC FAILED",
        detail: syncStatus.lastError?.message || "Unknown error",
        color: "text-status-fail",
        bgColor: "bg-red-950/40",
        borderColor: "border-status-fail/50",
      };
    }

    if (syncStatus.state === "pending") {
      return {
        icon: Wifi,
        label: "PENDING SYNC",
        detail: `${syncStatus.pendingCount} ready to sync`,
        color: "text-status-warn",
        bgColor: "bg-yellow-950/40",
        borderColor: "border-status-warn/50",
      };
    }

    return {
      icon: Check,
      label: "ONLINE",
      detail: "Connected",
      color: "text-status-pass",
      bgColor: "bg-green-950/40",
      borderColor: "border-status-pass/50",
    };
  };

  const state = getDisplayState();
  const Icon = state.icon;

  return (
    <div
      aria-live="polite"
      aria-label={`Network status: ${state.label}, ${state.detail}`}
      className={`flex items-center gap-2 px-3 py-2 rounded border ${state.bgColor} ${state.borderColor}`}
    >
      <Icon className={`h-4 w-4 ${state.color}`} aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <span className={`font-mono text-[10px] font-bold tracking-widest ${state.color}`}>
          {state.label}
        </span>
        <span className="font-mono text-[9px] text-on-surface-variant">{state.detail}</span>
      </div>
    </div>
  );
}
