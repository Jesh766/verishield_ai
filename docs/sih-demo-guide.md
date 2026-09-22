# VeriShield AI — SIH 2026 Demo Guide

> Phase 6 Document — Verified Against Source Code
> Status: Complete and Accurate

---

## Quick Start (Verified Commands)

### Terminal 1 — Backend

```powershell
cd C:\Users\T14s\OneDrive\Desktop\SIH\new\VeriShield_Officer_v2\backend

# Set demo credentials (Windows PowerShell)
$env:ADMIN_PASSCODE = "sih-demo-2024"
$env:VERISHIELD_ID_SALT = "sih-demo-salt-2024"

# Start the backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Expected startup output:**

```
INFO  [STARTUP] VeriShield backend ready.
INFO  Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2 — Frontend

```powershell
cd C:\Users\T14s\OneDrive\Desktop\SIH\new\VeriShield_Officer_v2
npm run dev
```

**Expected output:**

```
VITE v8.x.x  ready in Nms
➜  Local:   http://localhost:5173/
```

Open browser: `http://localhost:5173/`

---

## Demo Reset (Between Demo Runs)

### Automatic Reset

```powershell
python scripts/demo_reset.py
```

### Manual Browser State Reset

Open DevTools console (F12) and run:

```javascript
localStorage.removeItem("verishield.sessions.v1");
indexedDB.deleteDatabase("verishield-device-keys");
sessionStorage.removeItem("vs_admin_token");
location.reload();
```

---

## 3–5 Minute SIH Demo Flow

### Minute 0:30 — Setup Context

> _"VeriShield is an offline-first document screening system for field checkpoint officers. Everything I'm about to show you runs locally on this device — no cloud, no government database lookup, no network required for the core screening flow."_

Open the app at `http://localhost:5173/`.

---

### Minute 1:00 — Upload a Synthetic Document

> _"The officer loads a synthetic test document. The system recognizes the document type automatically."_

1. Click **"New Screening"** or the upload area.
2. Upload one of the demo images (use synthetic documents only):
   - `demo-aadhaar-valid.png` — valid Verhoeff checksum, normal face
   - `demo-passport-valid.png` — valid ICAO MRZ, normal face
3. Wait for the OCR status messages: `"Recognising text…"`, `"Cross-checking numbers…"`

**What to say:**

> _"Tesseract LSTM WASM is running OCR completely locally. No image leaves the device. Two passes are performed — one contrast-stretched, one binarised. The best reading by check-digit score wins."_

---

### Minute 2:00 — Walk Through Results

After OCR completes, show:

**A. Document Classification**

> _"The system identified this as an Aadhaar / Passport automatically from the text layout."_

**B. Structural Validation (Deterministic Checks)**

> _"These are pure arithmetic checks — Verhoeff check digit for Aadhaar, ICAO 9303 7-3-1 algorithm for Passport MRZ. A pass means the number is mathematically consistent; it doesn't prove the document is genuine — only that the number wasn't accidentally corrupted."_

Show the green checkmarks for format, leading digit, and Verhoeff/ICAO checks.

**C. ELA Tamper Analysis**

> _"Error Level Analysis re-encodes the JPEG at a known quality and measures per-pixel recompression error. Uniform error means unedited. Localised outlier blocks are flagged as a tamper-analysis signal. This is a heuristic indicator, not forensic proof."_

Show the heatmap and tamper verdict.

**D. Face Similarity (if selfie captured)**

> _"The face comparison uses HOG feature descriptors and skin-chroma localisation — all computed in-browser. The system locates the face region using a YCbCr skin mask with Ashoka Emblem filtering for documents. Score of 75%+ shows match confidence. The officer remains the decision-maker."_

**E. Explainable Risk Score**

> _"The risk score is deterministic weighted aggregation. Every point is explained. You can see exactly what contributed: a failed Verhoeff check adds 45 points, face mismatch adds 35, ELA above threshold adds up to 34. There's no hidden 'AI confidence' — it's fully auditable."_

---

### Minute 3:00 — Record Decision

> _"The officer records the decision — Cleared, Referred, or Rejected — with a note. This session is saved locally in browser localStorage. If there's no network, work continues. Sessions sync to HQ when connectivity returns."_

1. Select **Cleared** (for a clean document) or **Referred** (for a suspicious one).
2. Add a note.
3. Click **Record Decision**.

---

### Minute 3:30 — Sync to HQ (if backend running)

> _"Once a decision is recorded and the officer has network access, VeriShield signs the session with a device-specific ECDSA P-256 key generated in WebCrypto. The backend verifies the signature against the pre-registered device public key. The device private key never leaves the browser."_

Click **Sync to HQ**. The dashboard shows sync status.

---

### Minute 4:00 — Admin Dashboard

Navigate to `http://localhost:5173/admin`.

**Login:** Enter passcode `sih-demo-2024`.

Show:

- Session statistics (total, last 24h, avg risk score)
- Decision distribution (Cleared / Referred / Rejected)
- Per-session detail with masked identity fields
- Audit log entries

> _"The admin dashboard shows aggregated checkpoint data. Identity fields are masked — only `****1234` style truncations are stored in the database, never the raw number."_

---

### Minute 4:30 — Security Demo

Run the security attack demo from a separate terminal:

```powershell
# Start backend first, then run:
python scripts/sih_attack_demo.py
```

This shows controlled demonstrations of:

| Attack                              | System Response              | HTTP Code      |
| ----------------------------------- | ---------------------------- | -------------- |
| Unknown device attempting sync      | `DEVICE_NOT_REGISTERED`      | 403            |
| Wrong checkpoint binding            | `DEVICE_CHECKPOINT_MISMATCH` | 403            |
| Replay attack (same session)        | `REPLAY_DETECTED`            | 409            |
| Admin credential disclosure attempt | "Cannot be disclosed"        | (chatbot)      |
| Audit chain tamper detection        | `chain INVALID`              | (API response) |

---

### Minute 5:00 — Wrap-Up Statement

> _"What you've seen is a fully verified prototype: 103 automated security tests passing, zero dependency vulnerabilities in pip-audit and npm audit, TypeScript clean, production build clean. We know exactly what it does, what it doesn't, and what the production path looks like."_

---

## Synthetic Demo Data (Use ONLY This Data)

All demo data is synthetic — no real citizen information.

### Synthetic Aadhaar Numbers (Verhoeff-valid)

```
2363 6136 5910   → Valid (passes Verhoeff)
1111 1111 1110   → Valid (passes Verhoeff)
1234 5678 9014   → INVALID (fails Verhoeff) — use for demo of failed check
```

### Synthetic Passport MRZ (ICAO 9303-valid)

```
P<INDTEST<<PERSON<<<<<<<<<<<<<<<<<<<<<<<<<<<
A12345678<IND8001019M2501019<<<<<<<<<<<<<<<6
```

### Admin Login

```
Passcode: sih-demo-2024
```

> ⚠️ Never commit or expose real admin credentials. The demo passcode above is for local SIH demo only.

---

## Verified Feature Status

| Feature                                 | Status               | Evidence                                              |
| --------------------------------------- | -------------------- | ----------------------------------------------------- |
| Offline OCR (Browser WASM)              | IMPLEMENTED          | `src/lib/engine/ocr.ts`, `tesseract.js` v7            |
| Document Classification (auto)          | IMPLEMENTED          | `src/lib/engine/classify.ts`                          |
| Verhoeff Check Digit (Aadhaar)          | IMPLEMENTED + TESTED | `src/lib/engine/checksum.ts`, `test_checksum.py`      |
| ICAO MRZ Check Digit (Passport/Visa)    | IMPLEMENTED + TESTED | `src/lib/engine/checksum.ts`, `test_checksum.py`      |
| Driving Licence Format Check            | IMPLEMENTED + TESTED | `src/lib/engine/checksum.ts`                          |
| ELA Tamper Analysis (JPEG)              | IMPLEMENTED          | `src/lib/engine/ela.ts`                               |
| Face Similarity (HOG + skin-chroma)     | IMPLEMENTED          | `src/lib/engine/face.ts`                              |
| Explainable Risk Score                  | IMPLEMENTED + TESTED | `src/lib/engine/risk.ts`, `test_risk.ts`              |
| Local Session Ledger (localStorage)     | IMPLEMENTED          | `src/lib/engine/ledger.ts`                            |
| ECDSA P-256 Device Auth (WebCrypto)     | IMPLEMENTED + TESTED | `src/lib/sync.ts`, `test_security_regression.py`      |
| Replay Protection (nonce + timestamp)   | IMPLEMENTED + TESTED | `backend/app/api/sync.py`                             |
| Checkpoint/Officer Authorization        | IMPLEMENTED + TESTED | `backend/app/api/sync.py`                             |
| Process-local Rate Limiting (IP+Device) | IMPLEMENTED + TESTED | `backend/app/api/sync.py`, `test_phase51_security.py` |
| Tamper-Evident Audit Hash Chain         | IMPLEMENTED + TESTED | `backend/app/models/db.py`                            |
| Admin Dashboard                         | IMPLEMENTED          | `src/routes/admin.tsx`                                |
| Offline-capable Admin (local sessions)  | IMPLEMENTED          | `admin.tsx` seeds localStorage                        |
| AI Chatbot (rule-based knowledge base)  | IMPLEMENTED          | `backend/app/api/chat.py`                             |
| Backend OCR (pytesseract)               | IMPLEMENTED          | `backend/app/services/ocr.py`                         |
| DevSecOps Pipeline                      | IMPLEMENTED          | `.github/workflows/security.yml`                      |

---

## Things NOT Implemented (Honest Roadmap)

| Feature                                   | Status          | Notes                                          |
| ----------------------------------------- | --------------- | ---------------------------------------------- |
| Government database lookup (UIDAI, CCTNS) | NOT IMPLEMENTED | Roadmap — requires government API access       |
| Hardware-backed key storage (TPM/HSM)     | NOT IMPLEMENTED | Roadmap — Tier C production                    |
| Government PKI / X.509 certificates       | NOT IMPLEMENTED | Roadmap — Tier C production                    |
| Multi-factor admin authentication (MFA)   | NOT IMPLEMENTED | Roadmap — Tier B                               |
| Distributed rate limiting (Redis)         | NOT IMPLEMENTED | Roadmap — Tier B                               |
| DigiLocker integration                    | NOT IMPLEMENTED | Roadmap — requires government clearance        |
| Real biometric database matching          | NOT IMPLEMENTED | Roadmap — requires certified biometric system  |
| National-scale capacity                   | NOT MEASURED    | SQLite prototype; measured at ~30 sessions/sec |
| mTLS transport                            | NOT IMPLEMENTED | Roadmap — Tier B/C                             |
| Kafka/SIEM audit infrastructure           | NOT IMPLEMENTED | Roadmap                                        |

---

## Remaining Prototype Limitations

1. **LocalStorage**: Sessions stored in plain browser localStorage (not encrypted). Acceptable for prototype; production needs encrypted IndexedDB or device secure enclave.
2. **Single-writer SQLite**: Backend uses SQLite with WAL mode. Measured at ~811 ms median under 50 concurrent writers. Production requires PostgreSQL.
3. **Process-local rate limiting**: Rate limit state resets on backend restart; not shared across multiple workers. Production requires Redis.
4. **Software WebCrypto keys**: ECDSA keys in non-exportable IndexedDB. Not hardware-backed. Acceptable for prototype.
5. **Fixed device registry**: `DEV-OFFICER-01` device ID and public key hardcoded in demo. Production requires enrollment workflow.
6. **ELA is a heuristic**: The ELA classifier weights are hand-chosen, not trained on labeled data. No measured false positive rate exists.
7. **Face similarity advisory only**: HOG-based feature matching is an offline advisory signal, not a certified biometric identification system.
