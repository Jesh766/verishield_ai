/**
 * Request deduplication to prevent duplicate submissions.
 * Uses a sliding window of recent request IDs/hashes.
 */

export interface RequestDeduplicationConfig {
  windowMs: number; // Time window to track requests (default 60s)
  maxRequests: number; // Max requests to track in memory
}

const DEFAULT_CONFIG: RequestDeduplicationConfig = {
  windowMs: 60 * 1000, // 60 second window
  maxRequests: 1000,
};

interface PendingRequest {
  hash: string;
  timestamp: number;
  result?: unknown;
  error?: Error;
}

/**
 * Request deduplicator for sync operations.
 * Returns true if request is unique, false if duplicate in window.
 */
export class RequestDeduplicator {
  private requests: Map<string, PendingRequest> = new Map();
  private config: RequestDeduplicationConfig;

  constructor(config: Partial<RequestDeduplicationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a hash for a request to detect duplicates.
   * Uses device ID + checkpoint + session data.
   */
  private hashRequest(data: {
    deviceId: string;
    checkpointId: string;
    sessionId?: string;
    timestamp?: number;
  }): string {
    const { deviceId, checkpointId, sessionId } = data;
    return `${deviceId}:${checkpointId}:${sessionId || "unknown"}`;
  }

  /**
   * Check if a request is a duplicate.
   * Returns true if unique, false if duplicate within window.
   */
  isUnique(data: { deviceId: string; checkpointId: string; sessionId?: string }): boolean {
    const hash = this.hashRequest(data);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean expired entries
    for (const [key, req] of this.requests.entries()) {
      if (req.timestamp < windowStart) {
        this.requests.delete(key);
      }
    }

    // Check if duplicate
    if (this.requests.has(hash)) {
      const existing = this.requests.get(hash)!;
      // Same request within window = duplicate
      if (existing.timestamp > windowStart) {
        return false;
      }
    }

    // Track this request
    if (this.requests.size >= this.config.maxRequests) {
      // Remove oldest
      let oldest: [string, PendingRequest] | null = null;
      for (const entry of this.requests.entries()) {
        if (!oldest || entry[1].timestamp < oldest[1].timestamp) {
          oldest = entry;
        }
      }
      if (oldest) {
        this.requests.delete(oldest[0]);
      }
    }

    this.requests.set(hash, { hash, timestamp: now });
    return true;
  }

  /**
   * Mark a request as successfully completed.
   */
  markSuccess(
    data: {
      deviceId: string;
      checkpointId: string;
      sessionId?: string;
    },
    result: unknown,
  ): void {
    const hash = this.hashRequest(data);
    const existing = this.requests.get(hash);
    if (existing) {
      existing.result = result;
    }
  }

  /**
   * Mark a request as failed.
   */
  markFailure(
    data: {
      deviceId: string;
      checkpointId: string;
      sessionId?: string;
    },
    error: Error,
  ): void {
    const hash = this.hashRequest(data);
    const existing = this.requests.get(hash);
    if (existing) {
      existing.error = error;
    }
  }

  /**
   * Clear all tracked requests.
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get size of tracking map.
   */
  size(): number {
    return this.requests.size;
  }
}

/**
 * Create a memoized async function that deduplicates concurrent calls.
 * Useful for preventing duplicate API calls in flight.
 */
export function createDedupedAsync<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  keyFn: (...args: T) => string,
): (...args: T) => Promise<R> {
  const inFlight: Map<string, Promise<R>> = new Map();

  return async (...args: T): Promise<R> => {
    const key = keyFn(...args);

    // If request is in flight, return the existing promise
    if (inFlight.has(key)) {
      return inFlight.get(key)!;
    }

    // Create new promise and track it
    const promise = fn(...args);
    inFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      // Clean up after settled
      inFlight.delete(key);
    }
  };
}
