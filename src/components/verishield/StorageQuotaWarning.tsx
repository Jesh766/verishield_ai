/**
 * Storage Quota Warning
 * Shows storage usage and warns when approaching limit
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Database } from "lucide-react";
import { getStorageQuota, checkStorageHealth } from "@/lib/storage";

export interface StorageQuotaWarningProps {
  checkInterval?: number;
}

export function StorageQuotaWarning({ checkInterval = 5000 }: StorageQuotaWarningProps) {
  const [quota, setQuota] = useState<{
    usage: number;
    limit: number;
    percentage: number;
    critical: boolean;
  } | null>(null);
  const [health, setHealth] = useState<{ totalItems: number; corruptedItems: string[] } | null>(
    null,
  );

  useEffect(() => {
    const checkQuota = () => {
      const q = getStorageQuota();
      setQuota(q);
      const h = checkStorageHealth();
      setHealth({ totalItems: h.totalItems, corruptedItems: h.corruptedItems });
    };

    checkQuota();
    const interval = setInterval(checkQuota, checkInterval);

    return () => clearInterval(interval);
  }, [checkInterval]);

  if (!quota) return null;

  // Only show warning if critical (>90%) or corrupted items exist
  if (!quota.critical && (!health || health.corruptedItems.length === 0)) {
    return null;
  }

  const usageMB = Math.round((quota.usage / 1024 / 1024) * 100) / 100;
  const limitMB = Math.round((quota.limit / 1024 / 1024) * 100) / 100;

  return (
    <div aria-live="assertive" className="flex items-start gap-3 px-4 py-3 bg-yellow-950/40 border border-status-warn/50 rounded">
      <AlertTriangle className="h-5 w-5 text-status-warn shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-status-warn flex items-center gap-2">
          <Database className="h-4 w-4" aria-hidden="true" />
          Storage Capacity
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          Using {usageMB} MB of {limitMB} MB ({quota.percentage}%)
        </p>
        {quota.critical && (
          <p className="text-xs text-status-warn font-semibold mt-1">
            ⚠️ Storage is over 90% full. Data may be automatically cleaned up.
          </p>
        )}
        {health && health.corruptedItems.length > 0 && (
          <p className="text-xs text-status-fail font-semibold mt-1">
            ⚠️ {health.corruptedItems.length} corrupted item(s) detected.
          </p>
        )}
      </div>
    </div>
  );
}
