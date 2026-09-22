# VeriShield AI — Officer Field Screening & HQ Verification System

VeriShield AI is an offline-first identity document screening system designed for border, transit, and checkpoint security officers. It performs on-device OCR, structural checksum validation, Error Level Analysis (ELA) tamper heuristics, advisory face similarity, and deterministic risk scoring without requiring continuous internet connectivity.

When connectivity is available, verified screening receipts are signed using WebCrypto ECDSA P-256 keys held in browser IndexedDB and synchronized to the FastAPI HQ ledger with SHA-256 tamper-evident audit logging.

---

## Architecture Overview

```
[ Field Officer Device / Browser ]
  ├── Client OCR Engine (Tesseract 5.x / Canvas Heuristics)
  ├── Structural Rules Engine (Verhoeff Checksum, ICAO 9303, DL Rules)
  ├── ELA Tamper Signal Generator & Advisory HOG Face Similarity
  ├── Local Ledger (localStorage Derived Evidence + Masked PII)
  └── WebCrypto ECDSA P-256 Key Pair (IndexedDB Non-Exportable Key)
             │
   (Signed Sync Payload)
             ▼
[ FastAPI Backend / HQ Ledger ]
  ├── Signed Request Authentication & Nonce Replay Prevention
  ├── Device Registry & Public Key Verification
  ├── SQLite Ledger (VerificationSession & Officers)
  ├── SHA-256 Tamper-Evident Hash Chain Audit Log
  └── Admin HQ Operations & Session Inspection API
```

---

## Prerequisites

- **Python**: Python 3.10+ (Python 3.12 recommended)
- **Node.js**: Node.js 18+ (Node.js 20/22 recommended)
- **Package Manager**: `npm` v9+
- **OS**: Windows, macOS, or Linux

---

## Environment Variables

Copy `.env.example` to `.env` (frontend) and `backend/.env.example` to `backend/.env` (backend).

### Frontend Configuration (`.env`)

```ini
VITE_API_URL=http://127.0.0.1:8000
```

### Backend Configuration (`backend/.env`)

```ini
VERISHIELD_ADMIN_PASSCODE=CHANGE_ME_IN_PRODUCTION
VERISHIELD_ADMIN_TOKEN_TTL=28800
VERISHIELD_DB=verishield.db
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173
```

> **Note**: Do not commit real secret values to source control. `.env` files are excluded by `.gitignore`.

---

## Quick Setup & Startup

### 1. Backend Setup

```bash
# Navigate to backend folder
cd backend

# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Linux/macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup

```bash
# In the root repository folder
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:8080` (or `http://localhost:5173`).

---

## Production Build & Preview Flow

To test PWA offline capabilities and production bundle performance:

```bash
# Build frontend assets & Cloudflare Nitro SSR worker
npm run build

# Preview production build locally
npx vite preview --port 8080
```

---

## Running Tests

### Backend Test Suite

```bash
# Run pytest security, reliability, failure recovery, and unit tests
python -m pytest backend/tests/
```

### Frontend Unit & E2E Tests

```bash
# Run Vitest unit tests
npm test -- --run

# Run TypeScript typecheck
npx tsc --noEmit

# Run ESLint
npm run lint

# Run Playwright E2E browser tests (Chromium)
npx playwright test --project=chromium --reporter=line
```

---

## Evaluator / Demo Workflow

### 1. Complete Officer Happy Path

1. Open the application (`http://localhost:8080`).
2. Click **Quick Sign-In** (provisions checkpoint `CP-ALPHA` and officer badge `VS-OFFICER-01`).
3. Select **Aadhaar** document type and upload the synthetic fixture `backend/fixtures/samples/aadhaar_valid.png`.
4. Observe **OCR Extraction & Validation** (Aadhaar number extracted, Verhoeff checksum passed).
5. Click **Continue to AI Checks** (Error Level Analysis tamper heatmap computed).
6. Click **Proceed to Risk Assessment** (Deterministic risk score & recommendation displayed).
7. Click **Accept** to record the officer decision.
8. Click **View receipt** to verify masked PII (`••••••••6617`), derived evidence, and sync status.

### 2. Offline Demo Flow

1. Load the production build (`npm run build && npx vite preview --port 8080`).
2. Disconnect network connectivity (disable Wi-Fi / set browser to Offline in DevTools).
3. Perform document screening and make decision.
4. Verify local receipt persists and displays `Pending Sync`.
5. Reload page while offline — verify receipt remains accessible offline.
6. Re-enable network connectivity.
7. Click **Sync Pending** — observe WebCrypto ECDSA signature generation and backend acceptance (`Synced`).

### 3. Admin / HQ Workflow

1. Navigate to `http://localhost:8080/admin`.
2. Enter Admin Passcode (`SIH26188`).
3. Search for the session ID (e.g. `VS-260904-XXXXX`).
4. Click session to view masked fields, risk scores, officer decision, and audit log payload.
5. Click **Verify Audit Log Chain** to run sequential SHA-256 hash chain verification.

---

## Resetting Local Demo State

To reset local prototype database and storage state for a fresh demonstration pass:

```bash
# Delete local backend database
rm backend/verishield.db

# Clear browser localStorage & IndexedDB
# In browser DevTools Console:
# localStorage.clear(); indexedDB.deleteDatabase("verishield-device-keys");
```

---

## Troubleshooting Guide

| Problem                          | Cause                                          | Solution                                                                       |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `uvicorn: command not found`     | Virtual environment not active                 | Run `source .venv/bin/activate` or `.venv\Scripts\Activate.ps1`.               |
| Port 8000 already in use         | Previous backend process running               | Kill process on port 8000 or run `python -m uvicorn app.main:app --port 8001`. |
| CORS error in browser console    | Frontend origin missing from `ALLOWED_ORIGINS` | Add frontend URL to `ALLOWED_ORIGINS` in `backend/.env`.                       |
| Admin authentication fails       | Incorrect passcode in `backend/.env`           | Verify `VERISHIELD_ADMIN_PASSCODE` in `backend/.env`.                          |
| Offline reload fails in dev mode | Vite ESM virtual graph limitation              | Run production preview mode: `npm run build && npx vite preview`.              |

---

## Current Prototype Limitations

1. **SQLite Database**: Local file database (`verishield.db`). Production deployment requires PostgreSQL with replication.
2. **Process-Local State**: Nonce replay cache and rate limiters reside in process RAM. Production scaling requires Redis.
3. **Browser Key Storage**: ECDSA key pair stored non-exportable in WebCrypto IndexedDB. Production target uses WebAuthn / TPM hardware binding.

---

## Future Production Roadmap (P3)

- **PostgreSQL & Connection Pooling**: High-concurrency SQL database tier.
- **Centralized Redis Cluster**: Distributed rate limiting and global replay protection.
- **mTLS Gateway Security**: Client certificate authentication at NGINX/Cloudflare gateway level.
- **Hardware Security Module (HSM)**: Dedicated cryptographic logging ledger.
