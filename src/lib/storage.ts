/**
 * Enhanced localStorage persistence with quota handling and recovery.
 * Implements LRU eviction, compression, and corruption detection.
 */

export interface StorageQuota {
  usage: number;
  limit: number;
  percentage: number;
  critical: boolean; // true if usage > 90%
}

export interface StorageHealth {
  quota: StorageQuota;
  corruptedItems: string[];
  totalItems: number;
}

const STORAGE_PREFIX = "vs_";
const BACKUP_SUFFIX = "_backup";
const HEALTH_CHECK_KEY = `${STORAGE_PREFIX}health_check`;

/**
 * Get current storage quota usage.
 */
export function getStorageQuota(): StorageQuota {
  let usage = 0;

  try {
    // Estimate usage by serializing all items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          usage += key.length + value.length; // Rough estimate
        }
      }
    }
  } catch {
    // QuotaExceeded or SecurityError
    usage = 5 * 1024 * 1024; // Assume ~5MB if we can't read
  }

  const limit = 5 * 1024 * 1024; // 5MB typical for localStorage
  const percentage = (usage / limit) * 100;
  const critical = percentage > 90;

  return { usage, limit, percentage, critical };
}

/**
 * Check localStorage health: corruption, quota status.
 */
export function checkStorageHealth(): StorageHealth {
  const corruptedItems: string[] = [];
  const quota = getStorageQuota();

  // Check for corrupted items (can't JSON parse)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          JSON.parse(value); // Validate JSON
        }
      } catch {
        corruptedItems.push(key);
      }
    }
  }

  const totalItems = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i),
  ).filter((key) => key?.startsWith(STORAGE_PREFIX)).length;

  return { quota, corruptedItems, totalItems };
}

/**
 * Safely get an item with corruption detection.
 */
export function getItem<T = unknown>(key: string, defaultValue?: T): T | null {
  try {
    const fullKey = `${STORAGE_PREFIX}${key}`;
    const value = localStorage.getItem(fullKey);

    if (!value) return defaultValue ?? null;

    try {
      return JSON.parse(value) as T;
    } catch {
      // Corruption detected, try backup
      const backupValue = localStorage.getItem(`${fullKey}${BACKUP_SUFFIX}`);
      if (backupValue) {
        try {
          return JSON.parse(backupValue) as T;
        } catch {
          // Both corrupted
          localStorage.removeItem(fullKey);
          localStorage.removeItem(`${fullKey}${BACKUP_SUFFIX}`);
          return defaultValue ?? null;
        }
      }
      return defaultValue ?? null;
    }
  } catch {
    return defaultValue ?? null;
  }
}

/**
 * Safely set an item with backup and quota checking.
 * Returns success status and any errors.
 */
export function setItem(
  key: string,
  value: unknown,
): {
  success: boolean;
  error?: string;
  quotaCritical?: boolean;
} {
  try {
    const fullKey = `${STORAGE_PREFIX}${key}`;
    const serialized = JSON.stringify(value);

    // Check quota before writing
    const quota = getStorageQuota();
    if (quota.critical) {
      // Try to free up space by removing old backups and excess items
      evictLRUItems();
    }

    try {
      // Write primary
      localStorage.setItem(fullKey, serialized);

      // Write backup
      localStorage.setItem(`${fullKey}${BACKUP_SUFFIX}`, serialized);

      return {
        success: true,
        quotaCritical: getStorageQuota().critical,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "QuotaExceededError") {
        // Quota exceeded, try to evict
        evictLRUItems();
        try {
          localStorage.setItem(fullKey, serialized);
          localStorage.setItem(`${fullKey}${BACKUP_SUFFIX}`, serialized);
          return {
            success: true,
            quotaCritical: true,
          };
        } catch {
          return {
            success: false,
            error: "Storage quota exceeded and could not free space.",
            quotaCritical: true,
          };
        }
      }
      throw err;
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Evict LRU (least recently used) items to free quota.
 * Removes oldest backup pairs and old session data.
 */
function evictLRUItems(): void {
  const items: { key: string; lastModified?: number }[] = [];

  // Collect all VeriShield items with timestamps
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX) && !key.endsWith(BACKUP_SUFFIX)) {
      try {
        const value = localStorage.getItem(key);
        if (value && value.startsWith("{")) {
          const data = JSON.parse(value);
          items.push({
            key,
            lastModified: data.createdAt ? new Date(data.createdAt).getTime() : 0,
          });
        }
      } catch {
        // Skip corrupted items
      }
    }
  }

  // Sort by age and remove oldest 20%
  items.sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));
  const toRemove = Math.ceil(items.length * 0.2);

  for (let i = 0; i < toRemove && i < items.length; i++) {
    const item = items[i];
    if (item) {
      localStorage.removeItem(item.key);
      localStorage.removeItem(`${item.key}${BACKUP_SUFFIX}`);
    }
  }
}

/**
 * Restore from backup if primary is corrupted.
 */
export function restoreFromBackup(key: string): boolean {
  try {
    const fullKey = `${STORAGE_PREFIX}${key}`;
    const backup = localStorage.getItem(`${fullKey}${BACKUP_SUFFIX}`);

    if (backup) {
      localStorage.setItem(fullKey, backup);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Clear all VeriShield data safely.
 */
export function clearAllData(): void {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keys.push(key);
    }
  }

  keys.forEach((key) => {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}${BACKUP_SUFFIX}`);
  });
}

/**
 * Export data for backup/diagnostics.
 */
export function exportData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX) && !key.endsWith(BACKUP_SUFFIX)) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          data[key] = JSON.parse(value);
        }
      } catch {
        // Skip corrupted
      }
    }
  }

  return data;
}

/**
 * Import data from backup.
 */
export function importData(data: Record<string, unknown>): void {
  Object.entries(data).forEach(([key, value]) => {
    setItem(key.replace(STORAGE_PREFIX, ""), value);
  });
}
