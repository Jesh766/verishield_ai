/**
 * Local screening ledger.
 *
 * Sessions are kept on the device so a checkpoint works with no connectivity.
 * Only derived evidence is stored — masked identifiers, verdicts and scores.
 * Raw captures, face crops and heatmaps stay in memory and are dropped when the
 * screening closes.
 */

import type { CheckItem } from "./checksum";
import type { DocumentType } from "./extract";
import type { RiskResult } from "./risk";

const KEY = "verishield.sessions.v1";
const LIMIT = 60;

export type StoredSession = {
  id: string;
  documentType: DocumentType;
  createdAt: string;
  officerId: string;
  maskedFields: Record<string, string>;
  checks: CheckItem[];
  ocrConfidence: number;
  tamperScore: number | null;
  tamperVerdict: string | null;
  faceScore: number | null;
  faceVerdict: string | null;
  risk: RiskResult;
  decision: "cleared" | "referred" | "rejected" | null;
  note: string;
  synced: boolean;
  syncStatus?: "pending" | "syncing" | "synced" | "failed";
  retryCount?: number;
  lastAttemptAt?: string;
};

const read = (): StoredSession[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is StoredSession => s !== null && typeof s === "object" && typeof s.id === "string",
    );
  } catch {
    return [];
  }
};

const write = (rows: StoredSession[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, LIMIT)));
};

export const listSessions = () => read();

export const getSession = (id: string) => read().find((s) => s.id === id) ?? null;

export function saveSession(session: StoredSession) {
  const rows = read().filter((s) => s.id !== session.id);
  rows.unshift(session);
  write(rows);
  return session;
}

export function updateSession(id: string, patch: Partial<StoredSession>) {
  const rows = read();
  const idx = rows.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const next = { ...(rows[idx] as StoredSession), ...patch };
  rows[idx] = next;
  write(rows);
  return next;
}

export const newSessionId = () =>
  `VS-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

export const pendingSyncCount = () => read().filter((s) => !s.synced && s.decision).length;

/** Mark decided sessions as pushed to HQ once connectivity returns. */
export function markSynced() {
  const rows = read().map((s) => (s.decision ? { ...s, synced: true } : s));
  write(rows);
  return rows.filter((s) => s.synced).length;
}
