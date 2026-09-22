# VeriShield AI — Security Scorecard

> Phase 5.2 Document
> Status: Reconciled against Phase 5.2 test baseline & automated security scans
> Evidentiary basis for each score included below.

---

## Overall Security Rating Matrix

| Area                | Status    | Key Evidence / Basis                                                                                                                                                   |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication      | **GREEN** | ECDSA P-256 signatures required on all sync requests (`test_security_regression.py`). Key export prevented in WebCrypto.                                               |
| Authorization       | **GREEN** | Server enforces exact device ↔ checkpoint and device ↔ officer bindings. Substring and prefix spoofing blocked.                                                        |
| Cryptography        | **GREEN** | Standard `secp256r1` curve + SHA-256. Canonical string signing. Zero hardcoded secrets/HMAC fallbacks.                                                                 |
| Input Validation    | **GREEN** | Pydantic strict schemas, request-size limits (413), SQL parameterization verified against injection payloads.                                                          |
| File Handling       | **GREEN** | Ephemeral file upload handling with automated 15-minute TTL sweep. Path traversal blocked.                                                                             |
| Privacy             | **GREEN** | Raw document images never saved to DB. Identity numbers masked (`****1234`). Salted identity hashes.                                                                   |
| Audit Integrity     | **GREEN** | Tamper-evident SHA-256 hash chain verified by `verify_audit_chain()`. Session + audit written in atomic transaction.                                                   |
| Offline Security    | **GREEN** | Field mode processes OCR and checksums locally inside browser WASM. IndexedDB offline session storage.                                                                 |
| Sync Security       | **GREEN** | Process-local sliding-window rate limiter keyed by client IP + device ID (300 req/60s). Signed payload with nonce replay protection. Thread-safe via `threading.Lock`. |
| Admin Security      | **AMBER** | Admin passcode rate limited (5 attempts/min) with JWT bearer tokens. **AMBER** due to single-factor passcode (MFA is PRODUCTION TARGET).                               |
| Dependency Security | **GREEN** | `pip-audit` reports 0 vulnerabilities; `npm audit` reports 0 vulnerabilities.                                                                                          |
| CI/CD Security      | **GREEN** | 9-stage DevSecOps pipeline with strict non-bypassed gates for secrets, dependencies, SAST, containers, DAST, SBOM.                                                     |
| Container Security  | **GREEN** | Production Dockerfile runs as non-root user (UID 1000) with Trivy CRITICAL hard-gate scanner.                                                                          |
| DR / Resilience     | **AMBER** | Atomic DB transactions implemented. **AMBER** due to single-writer SQLite limitation (PostgreSQL is PRODUCTION TARGET).                                                |

---

## Summary Counts

- **GREEN Categories**: 12 / 14
- **AMBER Categories**: 2 / 14 (Admin Passcode MFA & SQLite single-writer scale — both explicitly documented as PROTOTYPE LIMITATIONS)
- **RED Categories**: 0 / 14
