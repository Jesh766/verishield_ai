# VeriShield AI — Government Deployment Architecture

> Phase 4 Evidence Document
> All components labeled: **IMPLEMENTED** | **PLANNED** | **TARGET**
>
> Absolute rule: No TARGET component is presented as IMPLEMENTED.

---

## Tier A — Current SIH Implementation

**Status: IMPLEMENTED and tested.**

This is what actually runs today in the VeriShield prototype.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FIELD DEVICE (Officer's Browser)                   │
│                                                                        │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Camera /   │  │ Tesseract    │  │ Field     │  │ Local Ledger │  │
│  │ Image Input│  │ OCR (WASM)   │  │ Extraction│  │ (IndexedDB)  │  │
│  └────────────┘  └──────────────┘  └───────────┘  └──────┬───────┘  │
│                                                            │          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ WebCrypto ECDSA P-256 (non-exportable private key in IndexedDB) │ │
│  └─────────────────────────────────┬───────────────────────────────┘ │
│                                    │ Signed sync request               │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │ HTTPS (dev: HTTP/localhost)
                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      HQ BACKEND (FastAPI / Python)                    │
│                                                                        │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────────┐ │
│  │ Correlation ID │  │ Device Auth     │  │ /health/live           │ │
│  │ Middleware     │  │ ECDSA Verify    │  │ /health/ready          │ │
│  │ Security Hdrs  │  │ No HMAC         │  │ /version               │ │
│  └────────────────┘  └─────────────────┘  └────────────────────────┘ │
│                                                                        │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────────┐ │
│  │ /sync/session  │  │ /device/enroll  │  │ /admin/*               │ │
│  │ Transactional  │  │ PoP verify      │  │ JWT bearer token       │ │
│  │ Idempotent     │  │ One-time code   │  │ Passcode auth          │ │
│  └────────────────┘  └─────────────────┘  └────────────────────────┘ │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ SQLite Database                                                │   │
│  │ Tamper-evident audit hash chain (SHA-256)                      │   │
│  │ Device registry with ECDSA public keys                         │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Tier A Component Status

| Component                                                  | Status          | Notes                                     |
| ---------------------------------------------------------- | --------------- | ----------------------------------------- |
| Browser ECDSA P-256 key generation                         | **IMPLEMENTED** | WebCrypto, non-exportable                 |
| Controlled one-time device enrollment                      | **IMPLEMENTED** | Proof-of-possession                       |
| Signed sync requests                                       | **IMPLEMENTED** | ECDSA-SHA256, canonical string            |
| Device lifecycle (active/revoked/suspended)                | **IMPLEMENTED** | Admin API                                 |
| Exact checkpoint authorization                             | **IMPLEMENTED** | No substring matching                     |
| Idempotent session sync                                    | **IMPLEMENTED** | Same payload → OK; different → 409        |
| Transactional session + audit write                        | **IMPLEMENTED** | Single atomic DB transaction              |
| Tamper-evident audit hash chain                            | **IMPLEMENTED** | SHA-256 chained events                    |
| Rate limiting                                              | **IMPLEMENTED** | Process-local; see distributed-state.md   |
| Request size protection                                    | **IMPLEMENTED** | 413 Payload Too Large                     |
| Correlation IDs                                            | **IMPLEMENTED** | X-Correlation-ID header                   |
| Security headers (CSP, HSTS, X-Content-Type-Options, etc.) | **IMPLEMENTED** | See main.py                               |
| Health endpoints (live + ready)                            | **IMPLEMENTED** | /health/live, /health/ready               |
| Version endpoint                                           | **IMPLEMENTED** | /version (no secrets exposed)             |
| Configuration validation (fail-fast)                       | **IMPLEMENTED** | On startup                                |
| Graceful shutdown                                          | **IMPLEMENTED** | mark_not_ready() before drain             |
| Dockerfile (non-root, multi-stage)                         | **IMPLEMENTED** | Production-oriented                       |
| DevSecOps CI pipeline                                      | **IMPLEMENTED** | .github/workflows/security.yml            |
| SQLite database                                            | **IMPLEMENTED** | Prototype only; see database-migration.md |
| Admin passcode + JWT bearer session                        | **IMPLEMENTED** | SIH prototype only                        |
| Privacy-safe logging                                       | **IMPLEMENTED** | No raw PII/keys in logs                   |

---

## Tier B — Ministry Pilot Architecture

**Status: PLANNED — not yet implemented.**

Appropriate for a controlled departmental pilot with 50–500 field devices across multiple checkpoints.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FIELD DEVICES (50-500+)                            │
│           Enrolled via government-controlled process                  │
│           mTLS client certificates (PLANNED)                         │
└──────────────────────────┬───────────────────────────────────────────┘
                            │ mTLS + VPN (PLANNED)
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    API Gateway / WAF (PLANNED)                        │
│   TLS termination, DDoS basic protection, request routing             │
└──────────────────────────┬───────────────────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
┌─────────────────────┐     ┌─────────────────────┐
│  App Worker 1       │     │  App Worker 2       │
│  (Gunicorn+Uvicorn) │     │  (Gunicorn+Uvicorn) │
│  PLANNED            │     │  PLANNED            │
└──────────┬──────────┘     └──────────┬──────────┘
           └────────────┬──────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Managed PostgreSQL (PLANNED)                         │
│   Primary + read replica + automated backups + point-in-time restore  │
└──────────────────────────────────────────────────────────────────────┘
                        │
               ┌────────┴────────┐
               ▼                 ▼
┌────────────────────┐  ┌────────────────────┐
│  Redis (PLANNED)   │  │  Monitoring        │
│  Rate limits       │  │  Prometheus+Grafana│
│  Nonce cache       │  │  (PLANNED)         │
│  Admin sessions    │  └────────────────────┘
└────────────────────┘
```

### Tier B Components

| Component               | Status      | Prerequisite                  |
| ----------------------- | ----------- | ----------------------------- |
| API Gateway             | **PLANNED** | Select appropriate solution   |
| WAF                     | **PLANNED** | Configure OWASP rule sets     |
| Multiple app workers    | **PLANNED** | Gunicorn + uvicorn workers    |
| PostgreSQL managed DB   | **PLANNED** | See database-migration.md     |
| Redis (shared state)    | **PLANNED** | Rate limits, nonces, sessions |
| mTLS between components | **PLANNED** | Private CA provisioning       |
| Centralized monitoring  | **PLANNED** | Prometheus + Grafana          |
| Central IAM / RBAC      | **PLANNED** | Replace admin passcode        |
| SIEM integration        | **PLANNED** | Centralize audit logs         |

---

## Tier C — Production Government Target Architecture

**Status: TARGET — design only, not implemented.**

Required for large-scale national deployment.

```
                    GOVERNMENT NETWORK PERIMETER
                               │
                    ┌──────────┴──────────┐
                    │   WAF / DDoS Layer   │ TARGET
                    │   (CERT-In compliant)│
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │     API Gateway      │ TARGET
                    │  Auth, rate-limit,   │
                    │  routing, audit      │
                    └──────────┬──────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    ┌───────────────────┐           ┌───────────────────┐
    │  Sync API Cluster │ TARGET    │  Admin API Cluster│ TARGET
    │  (N workers)      │           │  (isolated)       │
    └─────────┬─────────┘           └─────────┬─────────┘
              └──────────────┬────────────────┘
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Government  │ │  SIEM / SOC  │ │  Monitoring  │
    │  PKI / HSM   │ │  (Audit log  │ │  (Observ.)   │
    │  TARGET      │ │  pipeline)   │ │  TARGET      │
    └──────────────┘ └──────────────┘ └──────────────┘
                             │
               ┌─────────────┴─────────────┐
               ▼                           ▼
    ┌──────────────────┐         ┌──────────────────┐
    │  HA PostgreSQL   │  TARGET │  Standby Replica │ TARGET
    │  Primary         │◄───────►│  (Streaming      │
    │  (Zone A)        │         │   Replication)   │
    └──────────┬───────┘         └──────────────────┘
               │
    ┌──────────┴───────┐
    │  Immutable       │ TARGET
    │  Backup Storage  │
    │  + DR Site       │
    └──────────────────┘
```

### Tier C Additional Requirements

| Requirement                                    | Status     | Description                                  |
| ---------------------------------------------- | ---------- | -------------------------------------------- |
| Government PKI (X.509 device certs)            | **TARGET** | Replace ECDSA keypairs with HSM-backed X.509 |
| Hardware Security Modules (HSM)                | **TARGET** | For device certificate private keys          |
| Certificate rotation and revocation (CRL/OCSP) | **TARGET** | Automated cert lifecycle                     |
| CERT-In security audit                         | **TARGET** | Mandatory before government deployment       |
| UIDAI/MeitY compliance review                  | **TARGET** | Regulatory clearance required                |
| Multi-zone HA database                         | **TARGET** | RTO < 30 min target                          |
| SIEM integration                               | **TARGET** | Centralized security event management        |
| Government identity provider + MFA             | **TARGET** | Replace admin passcode                       |
| Immutable audit log storage                    | **TARGET** | Write-once, compliance-grade                 |
| DR environment + restore drills                | **TARGET** | Tested regularly                             |
