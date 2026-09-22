# VeriShield AI — Production & SIH Deployment Roadmap

## 1. CURRENT SIH IMPLEMENTATION (Phase 1 Remediated)

- **Field Screening**: 100% Browser PWA offline inference (Tesseract.js WASM OCR, deterministic checksums, Canvas ELA tamper analysis, HOG biometric face match, local storage queue).
- **HQ Sync Protection**: Prototype HMAC-SHA256 device authentication signatures (`X-VeriShield-Device`, `Timestamp`, `Nonce`, `Signature`), timestamp clock-skew validation (<=300s), and nonce replay protection.
- **Admin Authentication**: Environment-gated passcode (`VERISHIELD_ADMIN_PASSCODE`), URL-safe 24-character bearer tokens, login sliding-window rate limiting (5 attempts/min), and audit logging.
- **Database Ledger**: SQLite database mapped via SQLAlchemy with indexes on `created_at`, `checkpoint_id`, `risk_band`, and `decision`. Database-level pagination (`limit`/`offset`) and SQL aggregate stats queries.

---

## 2. MINISTRY PILOT ROADMAP

- **Database Architecture**: PostgreSQL High-Availability (HA) cluster with read replicas and database table partitioning.
- **Identity & Access Management**: Integration with Government OIDC / ePramaan IAM, issuing short-lived JWTs with Role-Based Access Control (RBAC) for Field Officers, Checkpoint Supervisors, and HQ Auditors.
- **Device Management**: X.509 client certificates enrolled per mobile device, enforcing mutual TLS (mTLS) over all sync endpoints.
- **SIEM & Central Audit**: Real-time audit log streaming to government SOC/SIEM via Syslog / Elastic.

---

## 3. NATIONAL DEPLOYMENT ROADMAP (Enterprise Scale)

- **Government PKI & HSM**: Hardware Security Module (HSM / KMS) integration for asymmetric digital signing of screening receipts at the physical device layer.
- **Asynchronous Sync**: Apache Kafka distributed event streaming pipeline for processing 100,000+ concurrent checkpoint sync bursts.
- **Government System Integrations**: DigiLocker API integration, UIDAI masking gateway, and CCTNS border watchlist lookup services.
- **National DR & HA**: Multi-region active-active cloud infrastructure with continuous automated WAL backups and zero-data-loss RPO.
