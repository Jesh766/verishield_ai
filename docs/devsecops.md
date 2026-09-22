# VeriShield AI — DevSecOps Security Pipeline & Security Policies

> Phase 5.2 Evidence Document — Reconciled Baseline
>
> **Terminology note:** This pipeline implements automated security controls.
> It does NOT provide CERT-In certification, government certification, or any
> regulatory compliance certification. Correct description:
> "DevSecOps controls aligned with security-testing practices expected in a
> controlled government deployment."

---

## Pipeline Overview

All stages are defined in [`.github/workflows/security.yml`](file:///.github/workflows/security.yml).

**Trigger:** Every push and pull request to `main` or `develop`.

**Least-privilege permissions:** `contents: read`, `security-events: write` (SARIF upload only), `actions: read`.

---

## Stage Inventory

| #   | Stage                   | Tool                | Implemented | Runs in CI | Blocks Build                | Artifact                |
| --- | ----------------------- | ------------------- | ----------- | ---------- | --------------------------- | ----------------------- |
| 1   | Secret scanning         | Gitleaks v2         | ✅          | ✅         | ✅ Yes                      | No                      |
| 2   | Python dependency scan  | pip-audit           | ✅          | ✅         | ✅ Yes                      | `pip-audit-report.json` |
| 3   | Node.js dependency scan | npm audit           | ✅          | ✅         | ✅ Yes                      | `npm-audit-report.json` |
| 4a  | SAST — Python           | CodeQL              | ✅          | ✅         | ⚠️ Partial (see §CodeQL)    | SARIF → Security tab    |
| 4b  | SAST — Python           | Semgrep             | ✅          | ✅         | ✅ Yes (ERROR findings)     | No                      |
| 5   | Backend unit tests      | pytest              | ✅          | ✅         | ✅ Yes                      | `test-results.xml`      |
| 6   | Frontend build          | tsc + ESLint + Vite | ✅          | ✅         | ✅ Yes                      | No                      |
| 7   | Container scan          | Trivy               | ✅          | ✅         | ✅ Yes (CRITICAL)           | SARIF → Security tab    |
| 8   | SBOM generation         | Syft (CycloneDX)    | ✅          | ✅         | ✅ Yes (generation failure) | `*.cyclonedx.json`      |
| 9   | DAST                    | OWASP ZAP           | ✅          | ✅         | ✅ Yes (HIGH+)              | `report_json.json`      |

---

## Detailed Failure Policies

### Stage 1 — Secret Scanning (Gitleaks)

| Condition                  | Action                                 |
| -------------------------- | -------------------------------------- |
| Any secret pattern matched | **FAIL** — pipeline aborts immediately |
| Tool installation failure  | **FAIL**                               |
| No secrets found           | PASS                                   |

---

### Stage 2 — Backend Dependency Scan (pip-audit)

| Condition                                      | Action                                 |
| ---------------------------------------------- | -------------------------------------- |
| Vulnerability with available fix version found | **FAIL** (pip-audit exits 1)           |
| Vulnerability with NO available fix found      | Reported in artifact; **non-blocking** |
| Tool execution failure                         | **FAIL** (no `                         |     | true` bypass) |
| No vulnerabilities found                       | PASS                                   |

**Baseline (2026-08-31):** `pip-audit` reports **No known vulnerabilities found**.

---

### Stage 3 — Frontend Dependency Scan (npm audit)

| Condition                            | Action                                  |
| ------------------------------------ | --------------------------------------- |
| HIGH or CRITICAL vulnerability found | **FAIL** (`--audit-level=high` exits 1) |
| Tool execution failure               | **FAIL**                                |
| No high/critical vulnerabilities     | PASS                                    |

**Baseline (2026-08-31):** `npm audit --audit-level=high` reports **0 vulnerabilities**.

---

### Sync Rate Limiter Policy & Architecture

- **Implementation**: Process-local sliding-window rate limiter keyed by client IP + device ID (`f"{client_ip}:{x_verishield_device or 'none'}"`).
- **Quota**: 300 requests / 60 seconds per key.
- **Thread Safety**: Protected by `threading.Lock` within a single process. Verified by `test_rate_limiter_concurrency_thread_safety`.
- **Classification**: `PROTOTYPE LIMITATION / ACCEPTED RISK` (Production target uses a shared Redis cluster across multi-worker deployments).
- **Test Enforcement**: Production rate limiting is active unconditionally in all environments. No `pytest` detection or environment variable security bypass exists in code.
