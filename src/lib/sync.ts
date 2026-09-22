/**
 * HQ sync — pushes locally-recorded sessions to the backend ledger.
 *
 * Authentication model:
 *   Browser generates a WebCrypto ECDSA P-256 key pair (non-exportable private key).
 *   The key pair is persisted in IndexedDB so device identity survives page refreshes.
 *   Every sync request is signed with the device private key (HMAC is not used).
 *   The backend verifies the signature against the pre-registered device public key.
 *   The public key is NOT sent with every sync request — the backend looks it up
 *   by device ID in its pre-provisioned registry.
 *
 * Key storage:
 *   - Private key: IndexedDB (non-exportable CryptoKey — never leaves the browser)
 *   - Public key: IndexedDB (exportable, registered at enrollment)
 *   - localStorage: NOT used for key material
 *
 * Field screening remains 100% offline. Sync is non-blocking and only runs
 * when connectivity is available and a decision has been recorded.
 */

import { listSessions, updateSession, type StoredSession } from "./engine/ledger";

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) || "http://127.0.0.1:8000";
const DEVICE_ID = "DEV-OFFICER-01";

// ---------------------------------------------------------------------------
// IndexedDB key persistence
// ---------------------------------------------------------------------------
const IDB_DB_NAME = "verishield-device-keys";
const IDB_STORE_NAME = "keys";
const IDB_KEY_NAME = "ecdsa-p256";

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadKeyPairFromIDB(): Promise<CryptoKeyPair | null> {
  try {
    const db = await openKeyStore();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY_NAME);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveKeyPairToIDB(keyPair: CryptoKeyPair): Promise<void> {
  try {
    const db = await openKeyStore();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      const req = tx.objectStore(IDB_STORE_NAME).put(keyPair, IDB_KEY_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-critical: key will be regenerated on next load
  }
}

/**
 * Returns the device ECDSA key pair, persisting it in IndexedDB.
 *
 * On first call: generates a new non-exportable P-256 key pair and stores it.
 * On subsequent calls (including after page refresh): loads the stored key pair.
 * The private key is NEVER exportable and NEVER stored as raw bytes.
 */
export async function getOrCreateDeviceKeyPair(): Promise<CryptoKeyPair> {
  // Try to load existing key pair from IndexedDB
  const stored = await loadKeyPairFromIDB();
  if (stored) return stored;

  // Generate new non-exportable key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false, // private key is non-exportable
    ["sign", "verify"],
  );

  // Persist for reuse across page refreshes
  await saveKeyPairToIDB(keyPair);
  return keyPair;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

async function generateDeviceSignatureHeaders(bodyText: string): Promise<Record<string, string>> {
  const deviceId =
    (typeof window !== "undefined" && localStorage.getItem("vs_device_id")) || DEVICE_ID;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const keyPair = await getOrCreateDeviceKeyPair();

  const encoder = new TextEncoder();
  const bodyBuf = encoder.encode(bodyText);
  const hashBuf = await crypto.subtle.digest("SHA-256", bodyBuf);
  const bodyHash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Canonical string must match backend verification exactly:
  // POST\n/sync/session\nTIMESTAMP\nNONCE\nBODY_SHA256_HEX\nDEVICE_ID
  const canonical = `POST\n/sync/session\n${timestamp}\n${nonce}\n${bodyHash}\n${deviceId}`;

  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    keyPair.privateKey,
    encoder.encode(canonical),
  );

  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // NOTE: X-VeriShield-Public-Key is intentionally NOT sent in sync requests.
  // The backend retrieves the registered public key by device_id from its
  // pre-provisioned registry. The client cannot supply its own authoritative key.
  return {
    "Content-Type": "application/json",
    "X-VeriShield-Device": deviceId,
    "X-VeriShield-Timestamp": timestamp,
    "X-VeriShield-Nonce": nonce,
    "X-VeriShield-Signature": signatureBase64,
  };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function pushOne(s: StoredSession, checkpoint: string, officerBadge: string) {
  const payload = JSON.stringify({
    session_id: s.id,
    officer_badge: officerBadge,
    checkpoint,
    document_type: s.documentType,
    extracted_fields: s.maskedFields,
    checksum_results: s.checks,
    ocr_confidence: s.ocrConfidence,
    face_match_score: s.faceScore,
    face_verdict: s.faceVerdict,
    tamper_score: s.tamperScore,
    tamper_verdict: s.tamperVerdict,
    risk_score: s.risk.score,
    risk_band: s.risk.band,
    risk_reasons: s.risk.contributions,
    decision: s.decision,
    note: s.note,
    client_created_at: s.createdAt,
    events: [],
  });

  const headers = await generateDeviceSignatureHeaders(payload);

  const res = await fetch(`${API_BASE}/sync/session`, {
    method: "POST",
    headers,
    body: payload,
  });

  return { ok: res.ok, status: res.status };
}

export async function pushPendingSessions(checkpoint: string, officerBadge: string) {
  const pending = listSessions().filter((s) => s.decision && !s.synced);
  let ok = 0;
  for (const s of pending) {
    const currentRetries = (s.retryCount || 0) + 1;
    const nowIso = new Date().toISOString();
    updateSession(s.id, {
      syncStatus: "syncing",
      retryCount: currentRetries,
      lastAttemptAt: nowIso,
    });
    try {
      const result = await pushOne(s, checkpoint, officerBadge);
      if (result.ok) {
        updateSession(s.id, { synced: true, syncStatus: "synced" });
        ok++;
      } else {
        updateSession(s.id, { synced: false, syncStatus: "failed" });
      }
    } catch {
      updateSession(s.id, { synced: false, syncStatus: "failed" });
      // Left unsynced — retried gracefully on next reconnect or decision
    }
  }
  return { ok, attempted: pending.length };
}

/**
 * Retry a single unsynced session. Used by the field officer history view so
 * an officer can recover a specific failed/pending session without re-pushing
 * the whole queue.
 */
export async function retrySessionSync(
  sessionId: string,
  checkpoint: string,
  officerBadge: string,
): Promise<{ ok: boolean; status: number | null }> {
  const s = listSessions().find((x) => x.id === sessionId);
  if (!s) return { ok: false, status: null };
  if (!s.decision) return { ok: false, status: null };
  if (s.synced) return { ok: true, status: 200 };

  const currentRetries = (s.retryCount || 0) + 1;
  const nowIso = new Date().toISOString();
  updateSession(s.id, {
    syncStatus: "syncing",
    retryCount: currentRetries,
    lastAttemptAt: nowIso,
  });

  try {
    const result = await pushOne(s, checkpoint, officerBadge);
    if (result.ok) {
      updateSession(s.id, { synced: true, syncStatus: "synced" });
      return { ok: true, status: result.status };
    }
    updateSession(s.id, { synced: false, syncStatus: "failed" });
    return { ok: false, status: result.status };
  } catch {
    updateSession(s.id, { synced: false, syncStatus: "failed" });
    return { ok: false, status: null };
  }
}
