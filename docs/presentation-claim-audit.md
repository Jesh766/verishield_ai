# VeriShield AI — Presentation Claim Audit ("Can I Say This?")

> Phase 5.2 Document
> Governance document for SIH presentation slides and demonstrator script.
> Categorizes all potential presentation claims into strict policy bands to prevent misleading statements.

---

## 1. SAFE TO CLAIM — IMPLEMENTED

The following claims are 100% backed by working code in the repository:

- ✅ **"Offline-First Screening"**: Field screening (OCR, checksums, document classification) runs 100% locally in browser WebAssembly (`tesseract.js`) without sending raw document images to the backend.
- ✅ **"ECDSA P-256 Device Identity"**: Every field device is authenticated using cryptographic ECDSA P-256 keypairs generated via WebCrypto API.
- ✅ **"Tamper-Evident Audit Trail"**: System audit events are linked using a SHA-256 cryptographic hash chain that detects historical record tampering.
- ✅ **"Server-Controlled Authorization Matrix"**: The HQ backend enforces exact device-to-checkpoint and device-to-officer authorization bindings.
- ✅ **"Idempotent Synchronization & Replay Defense"**: Synchronization requests use nonces, timestamp freshness windows, and session idempotency to reject replayed requests.
- ✅ **"Atomic Transactional Persistence"**: Verification session records and their corresponding audit events land in the database in a single atomic commit.
- ✅ **"DevSecOps CI Security Pipeline"**: Automated 9-stage pipeline enforcing zero-vulnerability gates for secrets, dependency CVEs, TypeScript errors, and container vulnerabilities.

---

## 2. SAFE TO CLAIM — MEASURED

The following quantitative claims are backed by reproducible execution scripts in the repository:

- 📊 **"Deterministic Verification Latency"**: Aadhaar Verhoeff checksum execution time measured at **0.005 ms** median (`benchmark_baseline.py`).
- 📊 **"Passport Check Digit Latency"**: Passport MRZ check digit verification measured at **0.012 ms** median (`benchmark_baseline.py`).
- 📊 **"Python OCR Crop Microbenchmark"**: Server-side Tesseract OCR text recognition measured at **3.42 ms** median per document crop (`benchmark_baseline.py`).
- 📊 **"Offline Backlog Burst Throughput"**: 10 concurrent field devices burst 100 queued sessions in **3.49 seconds** (**28.7 sessions/sec** throughput, `load_test_sim.py`).
- 📊 **"SQLite Concurrency Latency"**: Measured single-writer SQLite database latency of **811 ms** median under 50 concurrent writers (`load_test.py`).

---

## 3. SAFE TO CLAIM — TESTED

The following security properties are verified by automated `pytest` test cases in `backend/tests/`:

- 🧪 **"Sync Rate Limiter Enforcement & Thread Safety"**: Verified that production rate limiting is active under tests without pytest bypass (`test_pytest_does_not_disable_rate_limiter`). Verified thread safety under parallel requests (`test_rate_limiter_concurrency_thread_safety`).
- 🧪 **"Device Impersonation Defense"**: Verified that unknown devices, wrong keys, or tampered signatures return 401/403 errors (`test_security_regression.py`).
- 🧪 **"Checkpoint Spoofing Defense"**: Verified that prefix/substring checkpoint variations return 403 Forbidden (`test_security_regression.py`).
- 🧪 **"Cross-Device Replay Defense"**: Verified that session payloads signed by unauthorized devices return 401/403/409 errors (`test_adversarial_phase5.py`).

---

## 4. PROTOTYPE LIMITATIONS (Tier A Bounds)

These known weaknesses must be presented honestly as bounds of the SIH prototype:

- ⚠️ **"Process-Local Rate Limiter Keyed by Client IP + Device ID"**: Rate-limit slots (`f"{client_ip}:{x_verishield_device or 'none'}"`, 300 req/60s) reside in single-process memory, protected by `threading.Lock`, and reset on server restart.
- ⚠️ **"Single-Factor Admin Passcode"**: Admin login relies on a pre-shared passcode with rate limiting rather than multi-factor authentication (MFA).
- ⚠️ **"Software-Based Browser Storage"**: Device ECDSA keys reside in non-exportable WebCrypto IndexedDB storage rather than hardware TPM tokens.
- ⚠️ **"Single-Writer SQLite Database"**: The prototype uses SQLite WAL mode rather than a distributed PostgreSQL cluster.

---

## 5. PRODUCTION TARGETS (Tier B/C Architecture)

These architectural concepts are documented designs for future scale, NOT currently implemented code:

- 🎯 **"PostgreSQL Primary / Replica Database"** (PLANNED for Tier B Ministry Pilot).
- 🎯 **"Shared Redis Cluster for Distributed Rate Limiting & Nonces"** (PLANNED for Tier B Ministry Pilot).
- 🎯 **"Government PKI / X.509 Device Certificates"** (TARGET for Tier C National Production).
- 🎯 **"Hardware Security Module (HSM) Key Storage"** (TARGET for Tier C National Production).
- 🎯 **"Dedicated API Gateway & WAF"** (PLANNED for Tier B Ministry Pilot).

---

## 6. DO NOT CLAIM (STRICTLY PROHIBITED)

The following statements are false or unsupported and MUST NOT be made in any presentation or document:

- ❌ **"CERT-In Certified" or "MeitY Certified"** (No government body has audited or certified this prototype).
- ❌ **"Government PKI Infrastructure Deployed"** (The system uses application-layer ECDSA keypairs, not X.509 government CA certificates).
- ❌ **"Hardware-Backed HSM Browser Security"** (Keys are stored in browser WebCrypto IndexedDB).
- ❌ **"National-Scale Multi-Million Daily Throughput"** (Current single-writer SQLite baseline is measured at 28.7 sessions/sec).
- ❌ **"100% Forgery Detection / Zero False Positives"** (VeriShield is a decision-support tool; final triage remains with the human checkpoint officer).
- ❌ **"Distributed Rate Limiting"** (Rate limiting is process-local keyed by client IP + device ID).
