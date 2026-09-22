# VeriShield AI — Production Gaps

> Phase 3 Evidence Document — Honest Assessment of Prototype vs. Production Requirements

## Purpose

This document provides a transparent accounting of what VeriShield currently implements versus what a production government deployment would require. No capability is claimed that is not demonstrated by an executable test.

## Gap Matrix

| #   | Category                 | What We Have                    | What Production Needs                 | Gap Severity |
| --- | ------------------------ | ------------------------------- | ------------------------------------- | ------------ |
| 1   | Database                 | SQLite (single-writer)          | PostgreSQL with replication           | **HIGH**     |
| 2   | Rate limiting            | Process-local in-memory dict    | Redis-backed distributed limiter      | **HIGH**     |
| 3   | Nonce replay prevention  | Process-local in-memory set     | Redis with TTL expiry                 | **HIGH**     |
| 4   | TLS/mTLS                 | Not enforced (dev mode)         | Government-issued TLS + mTLS          | **HIGH**     |
| 5   | Secret management        | `.env` file (excluded from ZIP) | HashiCorp Vault / AWS Secrets Manager | **HIGH**     |
| 6   | PKI                      | Raw SPKI public keys            | X.509 certificate hierarchy           | **MEDIUM**   |
| 7   | Key rotation             | Not implemented                 | Automated with grace period           | **MEDIUM**   |
| 8   | Monitoring               | Structured stdout logs          | ELK/Loki + Prometheus + Grafana       | **MEDIUM**   |
| 9   | Alerting                 | None                            | PagerDuty/OpsGenie                    | **MEDIUM**   |
| 10  | CI/CD                    | Manual pytest                   | Automated pipeline with SAST/DAST     | **MEDIUM**   |
| 11  | Container                | Bare uvicorn                    | Docker + Kubernetes                   | **MEDIUM**   |
| 12  | Load balancer            | None                            | HAProxy / ALB with health checks      | **MEDIUM**   |
| 13  | Geographic redundancy    | Single-site                     | Multi-AZ, cross-region standby        | **MEDIUM**   |
| 14  | Backup automation        | Manual file copy                | Automated pg_dump + WAL + PITR        | **MEDIUM**   |
| 15  | PII lifecycle            | Masked in logs                  | Full DPDP Act compliance              | **MEDIUM**   |
| 16  | Penetration testing      | Automated regression tests      | Annual third-party pentest            | **LOW**      |
| 17  | Compliance certification | Self-assessed                   | STQC / CCA certification              | **LOW**      |
| 18  | Performance testing      | Component benchmarks            | Full load testing infrastructure      | **LOW**      |

## What IS Demonstrated

The following capabilities are implemented and verified by executable tests (90 tests, 0 failures):

| Capability                                  | Evidence                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| ECDSA P-256 device authentication           | `test_security_regression.py` (13 tests)                               |
| Controlled one-time device enrollment       | `test_enrollment.py` (10 tests)                                        |
| Proof-of-possession verification            | `test_enrollment.py::test_real_end_to_end_browser_enrollment_and_sync` |
| Device lifecycle (active/suspended/revoked) | `test_enrollment.py::test_device_revocation_and_suspension_lifecycle`  |
| Exact checkpoint authorization              | `test_security_regression.py::test_checkpoint_prefix_not_accepted`     |
| Tamper-evident audit hash chain             | `test_security_remediation.py::test_audit_hash_chain_*`                |
| Idempotent sync (no duplicates)             | `test_performance.py::test_idempotent_sync_prevents_duplicate_records` |
| Payload size protection                     | `test_performance.py::test_oversized_*`                                |
| Correlation ID propagation                  | `test_performance.py::test_correlation_id_*`                           |
| Performance sanity guards                   | `test_performance.py::test_checksum_performance_sanity`                |
| Attack response verification                | `test_performance.py::test_attack_benchmark_matrix`                    |
| Checksum validation (Verhoeff, MRZ, DL)     | `test_checksum.py` (20 tests)                                          |
| Field extraction & MRZ repair               | `test_extract.py` (7 tests)                                            |
| Admin credential protection                 | `test_security_remediation.py` (6 tests)                               |

## Recommended Production Roadmap

See `docs/government-deployment-path.md` for the phased deployment plan.
