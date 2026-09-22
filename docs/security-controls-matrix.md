# VeriShield AI — Security Controls Matrix

> Phase 4 Evidence Document
> Status: **IMPLEMENTED** | **PARTIAL** | **PLANNED**

---

## Device & Authentication Controls

| Threat                                | Control                                        | Test                                                         | Status          |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ | --------------- |
| Device impersonation                  | ECDSA P-256 per-device key pair                | `test_security_regression.py::test_invalid_signature`        | **IMPLEMENTED** |
| Replay attack (same request repeated) | Nonce uniqueness + timestamp freshness (5 min) | `test_security_regression.py::test_replay_attack`            | **IMPLEMENTED** |
| Device compromise                     | Device revocation (admin API)                  | `test_security_regression.py::test_revoked_device`           | **IMPLEMENTED** |
| Device suspension                     | Device suspension (admin API)                  | `test_security_regression.py::test_suspended_device`         | **IMPLEMENTED** |
| Unknown device                        | Registration check on every request            | `test_performance.py::test_attack_benchmark[unknown device]` | **IMPLEMENTED** |
| Modified request body                 | ECDSA signature covers SHA-256 of body         | `test_security_regression.py::test_tampered_body`            | **IMPLEMENTED** |
| Clock skew attack                     | Timestamp freshness window (300 s)             | `test_security_remediation.py::test_expired_timestamp`       | **IMPLEMENTED** |
| Nonce replay across restarts          | Process-local cache (not durable)              | Not tested (prototype limitation)                            | **PARTIAL**     |

## Authorization Controls

| Threat                                | Control                                | Test                                                            | Status          |
| ------------------------------------- | -------------------------------------- | --------------------------------------------------------------- | --------------- |
| Checkpoint spoofing (CP-01 vs CP-012) | Exact normalized checkpoint equality   | `test_security_regression.py::test_checkpoint_substring_attack` | **IMPLEMENTED** |
| Wrong officer badge                   | Device ↔ officer binding in registry   | `test_security_regression.py::test_officer_mismatch`            | **IMPLEMENTED** |
| Unauthorized officer access           | Officer must pre-exist in DB           | `test_security_regression.py::test_unknown_officer`             | **IMPLEMENTED** |
| Field officer accessing admin API     | Admin JWT required for admin endpoints | `test_api.py::test_admin_login_*`                               | **IMPLEMENTED** |
| Admin passcode brute force            | Rate limit 5 attempts/min              | `test_performance.py`                                           | **IMPLEMENTED** |
| RBAC multi-role separation            | Documentation only (conceptual)        | Not yet enforced in code                                        | **PARTIAL**     |

## Data Protection Controls

| Threat                               | Control                                            | Test                                                             | Status          |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------- | --------------- |
| Audit trail tampering                | SHA-256 hash chain + verification                  | `test_security_regression.py::test_audit_chain_tamper_detection` | **IMPLEMENTED** |
| Half-created session (partial write) | Atomic transaction (session + audit in one commit) | `test_api.py::test_sync_session`                                 | **IMPLEMENTED** |
| Duplicate session creation           | Idempotency check on session_id                    | `test_performance.py::test_idempotent_sync`                      | **IMPLEMENTED** |
| Conflicting sync payload             | 409 Conflict on same ID + different payload        | `test_security_regression.py::test_duplicate_session_conflict`   | **IMPLEMENTED** |
| Raw document image persistence       | Images never written to disk/DB                    | Architecture — storage.py ephemeral only                         | **IMPLEMENTED** |
| PII in logs                          | Privacy-safe logging enforced                      | Code review                                                      | **IMPLEMENTED** |

## Network & Transport Controls

| Threat                       | Control                                            | Test                                                              | Status          |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------------- |
| Oversized sync payload (DoS) | 413 Payload Too Large (1 MB sync limit)            | `test_performance.py::test_oversized_sync_payload_rejected`       | **IMPLEMENTED** |
| Oversized enrollment payload | 413 Payload Too Large (64 KB limit)                | `test_performance.py::test_oversized_enrollment_payload_rejected` | **IMPLEMENTED** |
| Sync rate abuse (DoS)        | 300 req/min per device                             | `test_performance.py` (verified via load test)                    | **IMPLEMENTED** |
| Enrollment brute force       | 10 attempts/min                                    | Architecture                                                      | **IMPLEMENTED** |
| Missing security headers     | X-Content-Type-Options, X-Frame-Options, CSP, HSTS | `test_performance.py::test_correlation_id_*`                      | **IMPLEMENTED** |
| Cross-origin request forgery | CORS policy (restricted origins)                   | Architecture                                                      | **IMPLEMENTED** |
| MITM on transport            | HTTPS (dev: HTTP; production: TLS required)        | Not tested (network layer)                                        | **PARTIAL**     |
| mTLS between components      | Not implemented                                    | N/A                                                               | **PLANNED**     |

## Secret Management Controls

| Threat                        | Control                                 | Test                       | Status          |
| ----------------------------- | --------------------------------------- | -------------------------- | --------------- |
| Secret leakage in source      | No hardcoded secrets in code            | Secret scan (CI: Gitleaks) | **IMPLEMENTED** |
| .env in submission ZIP        | Excluded by make_zip.py                 | ZIP validation             | **IMPLEMENTED** |
| Private key in submission ZIP | All `_priv.pem` excluded from ZIP       | ZIP validation             | **IMPLEMENTED** |
| Secret in container image     | Not baked in (env var injection)        | .dockerignore              | **IMPLEMENTED** |
| Enrollment code plaintext     | SHA-256 hashed before storage           | `test_enrollment.py`       | **IMPLEMENTED** |
| Stack traces in API response  | Internal errors → generic 500 + corr_id | Code review                | **IMPLEMENTED** |
| Database credentials in logs  | Not logged                              | Code review                | **IMPLEMENTED** |

## DevSecOps Pipeline Controls

| Control                      | Tool               | Status                        |
| ---------------------------- | ------------------ | ----------------------------- |
| Secret scanning              | Gitleaks           | **IMPLEMENTED** (CI pipeline) |
| Python dependency scan       | pip-audit          | **IMPLEMENTED** (CI pipeline) |
| Node.js dependency scan      | npm audit          | **IMPLEMENTED** (CI pipeline) |
| SAST (Python)                | CodeQL + Semgrep   | **IMPLEMENTED** (CI pipeline) |
| Container vulnerability scan | Trivy              | **IMPLEMENTED** (CI pipeline) |
| SBOM generation              | Syft (CycloneDX)   | **IMPLEMENTED** (CI pipeline) |
| DAST                         | OWASP ZAP baseline | **IMPLEMENTED** (CI pipeline) |
| Unit tests                   | pytest             | **IMPLEMENTED** (90 tests)    |
| TypeScript check             | tsc --noEmit       | **IMPLEMENTED** (CI pipeline) |
| Lint                         | ESLint             | **IMPLEMENTED** (CI pipeline) |

## Severity Policy

| Pipeline Stage  | FAIL Condition                                 |
| --------------- | ---------------------------------------------- |
| Secret scan     | Any detected secret                            |
| SAST            | Critical or high findings (CodeQL policy)      |
| Dependency scan | Vulnerabilities with available fix (pip-audit) |
| Container scan  | CRITICAL vulnerabilities (Trivy)               |
| Unit tests      | Any test failure                               |
| TypeScript      | Any type error                                 |
| Lint            | Any ESLint error                               |
| DAST            | Informational only in prototype (non-blocking) |
