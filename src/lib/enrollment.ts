/**
 * Device Enrollment Client Module — Controlled one-time binding of browser ECDSA public keys.
 *
 * Flow:
 * 1. Generates non-exportable WebCrypto ECDSA P-256 key pair locally (persisted in IndexedDB).
 * 2. Exports public key as DER SPKI base64.
 * 3. Constructs canonical challenge: `ENROLL\n{deviceId}\n{enrollmentCode}\n{publicKeyB64}`.
 * 4. Signs challenge with local private key (proof of possession).
 * 5. Calls POST /device/enroll submitting enrollment_code, device_id, public_key, and challenge_signature.
 * 6. HQ binds the public key to the authorized device record and marks enrollment code as used.
 * 7. Device state saved in localStorage for seamless officer workflow.
 */

import { getOrCreateDeviceKeyPair } from "./sync";

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) || "http://127.0.0.1:8000";

export interface EnrollmentResult {
  success: boolean;
  deviceId?: string;
  checkpointId?: string;
  officerBadge?: string;
  error?: string;
}

export function isDeviceEnrolled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("vs_device_enrolled") === "true";
}

export function getEnrolledDeviceInfo(): {
  deviceId: string;
  checkpointId: string;
  officerBadge: string;
} | null {
  if (typeof window === "undefined") return null;
  const enrolled = localStorage.getItem("vs_device_enrolled");
  if (!enrolled) return null;
  return {
    deviceId: localStorage.getItem("vs_device_id") || "DEV-OFFICER-01",
    checkpointId: localStorage.getItem("vs_cp") || "cp-demo",
    officerBadge: localStorage.getItem("vs_badge") || "VS-0001",
  };
}

export async function enrollDevice(
  deviceId: string,
  enrollmentCode: string,
): Promise<EnrollmentResult> {
  try {
    const keyPair = await getOrCreateDeviceKeyPair();

    // Export public key as DER SPKI base64
    const spkiBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(spkiBuffer)));

    // Proof-of-possession challenge string
    const normalizedCode = enrollmentCode.trim().toUpperCase();
    const normalizedDeviceId = deviceId.trim();
    const challengeText = `ENROLL\n${normalizedDeviceId}\n${normalizedCode}\n${publicKeyB64.trim()}`;

    // Sign challenge with private key
    const sigBuffer = await crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      keyPair.privateKey,
      new TextEncoder().encode(challengeText),
    );
    const challengeSignatureB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const payload = {
      enrollment_code: normalizedCode,
      device_id: normalizedDeviceId,
      public_key: publicKeyB64,
      algorithm: "ECDSA-P256-SHA256",
      challenge_signature: challengeSignatureB64,
    };

    const res = await fetch(`${API_BASE}/device/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({ detail: res.statusText }))) as {
        detail?: string;
      };
      return {
        success: false,
        error: errData.detail || `Enrollment failed with status ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      enrolled: boolean;
      device_id: string;
      checkpoint_id: string;
      officer_badge: string;
    };

    // Store identity in localStorage
    localStorage.setItem("vs_device_enrolled", "true");
    localStorage.setItem("vs_device_id", data.device_id);
    localStorage.setItem("vs_cp", data.checkpoint_id);
    localStorage.setItem("vs_badge", data.officer_badge);

    return {
      success: true,
      deviceId: data.device_id,
      checkpointId: data.checkpoint_id,
      officerBadge: data.officer_badge,
    };
  } catch (ex: unknown) {
    const msg = ex instanceof Error ? ex.message : "Failed to complete device enrollment.";
    return {
      success: false,
      error: msg,
    };
  }
}
