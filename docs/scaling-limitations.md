# VeriShield AI — Scaling Limitations

> Phase 3 Evidence Document — Honest Prototype Limitations Audit

## Purpose

This document identifies every component of VeriShield that uses prototype-grade infrastructure. Each limitation is explicitly documented so that evaluators understand what would need to change for production deployment.

## 1. Process-Local State

| Component                | Current Implementation           | Production Requirement                          |
| ------------------------ | -------------------------------- | ----------------------------------------------- |
| Sync rate limiter        | In-memory dict per process       | Redis or API gateway rate limiting              |
| Admin login rate limiter | In-memory dict per process       | Redis or API gateway rate limiting              |
| Enrollment rate limiter  | In-memory dict per process       | Redis or API gateway rate limiting              |
| Nonce replay cache       | In-memory set per process        | Redis with TTL-based expiry                     |
| Device registry cache    | In-memory dict loaded at startup | Database query or Redis cache with invalidation |

**Impact**: If multiple Uvicorn workers are deployed, each worker maintains independent rate-limit and nonce state. An attacker could distribute requests across workers to bypass per-process limits.

**Mitigation path**: Replace all process-local state with Redis. Estimated effort: 2–3 days.

## 2. Database

| Aspect             | Current            | Production                            |
| ------------------ | ------------------ | ------------------------------------- |
| Engine             | SQLite             | PostgreSQL 15+                        |
| Write concurrency  | Single-writer lock | MVCC concurrent writes                |
| Connection pooling | SQLAlchemy default | PgBouncer or equivalent               |
| Backup strategy    | File copy          | pg_dump + WAL archival + PITR         |
| Replication        | None               | Streaming replication + read replicas |
| Encryption at rest | None               | Transparent data encryption (TDE)     |

**Impact**: SQLite cannot support concurrent write transactions. At > 4 workers, write contention degrades throughput.

## 3. Authentication & PKI

| Aspect                   | Current                                      | Production                                            |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Device key storage       | Browser IndexedDB (non-exportable CryptoKey) | Hardware security module (HSM) or TPM-backed          |
| Enrollment code delivery | Pre-seeded in database                       | Secure out-of-band delivery (courier, secure channel) |
| Certificate authority    | None (raw SPKI public keys)                  | Government PKI with X.509 certificates                |
| Key rotation             | Not implemented                              | Automated rotation with grace period                  |
| Revocation checking      | Database status field                        | OCSP or CRL distribution                              |

**Impact**: The prototype uses raw ECDSA public keys without a certificate chain. Production requires a proper PKI hierarchy.

## 4. Network & Transport

| Aspect          | Current                         | Production                              |
| --------------- | ------------------------------- | --------------------------------------- |
| TLS             | Development self-signed or none | Government-issued TLS certificates      |
| mTLS            | Not implemented                 | Required for device-to-HQ communication |
| VPN/Overlay     | None                            | Dedicated government network or VPN     |
| DDoS protection | None                            | WAF + CDN + cloud DDoS mitigation       |

## 5. Observability

| Aspect        | Current                | Production                          |
| ------------- | ---------------------- | ----------------------------------- |
| Logging       | Structured stdout      | ELK/Loki stack with log aggregation |
| Metrics       | None                   | Prometheus + Grafana                |
| Tracing       | Correlation ID headers | OpenTelemetry distributed tracing   |
| Alerting      | None                   | PagerDuty/OpsGenie integration      |
| Log retention | None (stdout)          | 90-day hot, 1-year archive          |

## 6. Deployment

| Aspect            | Current             | Production                                        |
| ----------------- | ------------------- | ------------------------------------------------- |
| Container         | None (bare uvicorn) | Docker + Kubernetes                               |
| CI/CD             | Manual pytest       | GitHub Actions / GitLab CI with security scanning |
| Blue-green deploy | Not implemented     | Required for zero-downtime updates                |
| Health checks     | `/health` endpoint  | Kubernetes liveness + readiness probes            |
| Secret management | `.env` file         | HashiCorp Vault or AWS Secrets Manager            |

## 7. Compliance

| Aspect              | Current                    | Production                                      |
| ------------------- | -------------------------- | ----------------------------------------------- |
| Data classification | Not formally classified    | Must comply with India IT Act, DPDP Act 2023    |
| Audit trail         | Tamper-evident hash chain  | Tamper-evident + immutable audit storage (WORM) |
| Data retention      | Indefinite                 | Policy-defined retention with automated purge   |
| PII handling        | Masked in logs             | Full PII lifecycle management                   |
| Penetration testing | Automated regression tests | Annual third-party pentest                      |
