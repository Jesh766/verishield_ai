# VeriShield AI — Architecture (Phase 3)

> Phase 3 Evidence Document — Field vs Production Architecture Diagrams

## 1. Current Prototype Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIELD DEVICE (Browser)                       │
│                                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Camera / │  │ Tesseract │  │ Checksum │  │   Local       │  │
│  │ Scanner  │──│ OCR       │──│ + Extract│──│   Ledger      │  │
│  └──────────┘  └───────────┘  └──────────┘  │  (IndexedDB)  │  │
│                                              └───────┬───────┘  │
│  ┌──────────────────────────────────────────────────┐│          │
│  │ WebCrypto ECDSA P-256 (non-exportable key pair)  ││          │
│  │ ┌────────────┐  ┌────────────────┐               ││          │
│  │ │ Private Key │  │ Proof of       │               ││          │
│  │ │ (IndexedDB) │  │ Possession     │               ││          │
│  │ └────────────┘  └────────────────┘               ││          │
│  └──────────────────────────────────────────────────┘│          │
│                                                      │          │
│  ┌──────────────────────────────────────────────────┐│          │
│  │            Sync Engine                            ││          │
│  │  POST /sync/session                              ││          │
│  │  Headers:                                        ││          │
│  │    X-VeriShield-Device: DEV-OFFICER-01           ││          │
│  │    X-VeriShield-Timestamp: <epoch>               ││          │
│  │    X-VeriShield-Nonce: <unique>                  ││          │
│  │    X-VeriShield-Signature: <ECDSA(canonical)>    ││          │
│  └──────────────────────────────┬───────────────────┘│          │
└─────────────────────────────────┼────────────────────┘          │
                                  │ HTTPS                         │
                                  ▼                               │
┌─────────────────────────────────────────────────────────────────┐
│                        HQ BACKEND (FastAPI)                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Middleware    │  │ Device Auth  │  │ Sync Endpoint         │  │
│  │ • Correlation │  │ • ECDSA      │  │ • Idempotent upsert   │  │
│  │ • Size limit  │  │ • Timestamp  │  │ • Conflict detection  │  │
│  │ • Logging     │  │ • Nonce      │  │ • Audit chain append  │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Enrollment   │  │ Admin API    │  │ Device Registry       │  │
│  │ POST /enroll │  │ JWT auth     │  │ • Public keys         │  │
│  │ • PoP verify │  │ • Dashboard  │  │ • Checkpoint binding  │  │
│  │ • Code burn  │  │ • Audit view │  │ • Officer assignment  │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SQLite Database                                          │   │
│  │ • verification_sessions (screening results)              │   │
│  │ • audit_log (tamper-evident hash chain)                   │   │
│  │ • registered_devices (device registry + public keys)     │   │
│  │ • device_enrollments (one-time enrollment codes)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Authentication Flow

```
┌──────────┐                                    ┌──────────┐
│  Field   │                                    │    HQ    │
│  Device  │                                    │  Backend │
└────┬─────┘                                    └────┬─────┘
     │                                               │
     │  1. First Run: Generate ECDSA P-256 key pair  │
     │     (non-exportable, IndexedDB)               │
     │                                               │
     │  2. POST /device/enroll                       │
     │     { device_id, enrollment_code,             │
     │       public_key_spki_b64, pop_signature }    │
     │──────────────────────────────────────────────▶│
     │                                               │
     │     Verify: enrollment code valid?            │
     │     Verify: PoP signature correct?            │
     │     Bind: public key → device → checkpoint    │
     │     Burn: enrollment code (one-time use)      │
     │                                               │
     │  3. 200 OK { device_id, checkpoint_id }       │
     │◀──────────────────────────────────────────────│
     │                                               │
     │  4. Normal Operation: POST /sync/session      │
     │     Canonical = POST\n/sync/session\n         │
     │       {timestamp}\n{nonce}\n{body_sha256}\n   │
     │       {device_id}                             │
     │     Signature = ECDSA-SHA256(canonical)       │
     │──────────────────────────────────────────────▶│
     │                                               │
     │     Lookup: registered public key             │
     │     Verify: ECDSA signature                   │
     │     Check: timestamp freshness (5 min)        │
     │     Check: nonce uniqueness                   │
     │     Check: device status == active            │
     │     Check: checkpoint exact match             │
     │     Check: officer authorized                 │
     │                                               │
     │  5. 200 OK / 401 / 403 / 409                  │
     │◀──────────────────────────────────────────────│
     │                                               │
```

## 3. Target Production Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIELD DEVICES (50–500+)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐      │
│  │Device 01│  │Device 02│  │Device 03│  ...  │Device N │      │
│  │(CP-01)  │  │(CP-01)  │  │(CP-02)  │       │(CP-M)  │      │
│  └────┬────┘  └────┬────┘  └────┬────┘       └────┬────┘      │
└───────┼────────────┼────────────┼──────────────────┼───────────┘
        │            │            │                  │
        └────────────┴────────────┴──────────────────┘
                              │
                         mTLS + VPN
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LOAD BALANCER (HAProxy/ALB)                  │
│                     Health checks + SSL termination              │
└──────────────┬──────────────┬──────────────┬────────────────────┘
               │              │              │
               ▼              ▼              ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  App Worker 1    │ │  App Worker 2    │ │  App Worker 3    │
│  (Gunicorn +     │ │  (Gunicorn +     │ │  (Gunicorn +     │
│   Uvicorn)       │ │   Uvicorn)       │ │   Uvicorn)       │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                    │
         └────────────────────┴────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌───────────────────┐
│  PostgreSQL      │ │  Redis       │ │  Monitoring       │
│  Primary +       │ │  Rate limits │ │  Prometheus +     │
│  Streaming       │ │  Nonce cache │ │  Grafana + Loki   │
│  Replication     │ │  Sessions    │ │  + Alerting       │
└──────────────────┘ └──────────────┘ └───────────────────┘
```

## 4. Data Flow Summary

| Stage            | Location                      | Storage                         | Encryption       |
| ---------------- | ----------------------------- | ------------------------------- | ---------------- |
| Document capture | Field device camera           | In-memory (never persisted raw) | N/A              |
| OCR processing   | Field device (Tesseract WASM) | In-memory                       | N/A              |
| Screening result | Field device IndexedDB        | Local ledger                    | Browser sandbox  |
| Audit event      | Field device + HQ             | Hash chain (SHA-256)            | Tamper-evident   |
| Sync transport   | Network                       | HTTPS                           | TLS 1.3 (target) |
| HQ storage       | PostgreSQL (target)           | Encrypted at rest               | TDE              |

## 5. Security Boundaries

| Boundary         | Protection                                |
| ---------------- | ----------------------------------------- |
| Device ↔ HQ      | ECDSA-signed requests, mTLS (target)      |
| Admin ↔ HQ       | JWT + passcode, rate limited              |
| HQ ↔ Database    | Connection pooling, parameterized queries |
| Audit trail      | Tamper-evident SHA-256 hash chain         |
| Device keys      | Non-exportable WebCrypto CryptoKey        |
| Enrollment codes | One-time use, SHA-256 hashed in DB        |
