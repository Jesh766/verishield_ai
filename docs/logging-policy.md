# VeriShield AI — Logging Policy

> Phase 4 Evidence Document
> Defines what is logged, what is prohibited, and what must be masked.

---

## Principle

Logs are operational artifacts. They must be useful for debugging and monitoring without exposing sensitive personal information, cryptographic material, or security-sensitive data.

Logs are distinct from the tamper-evident **security audit trail** (stored in `audit_log` table). See "Audit Log Security" section below.

---

## Allowed in Application Logs

The following fields may appear in structured application logs:

| Field            | Example                               | Notes                                            |
| ---------------- | ------------------------------------- | ------------------------------------------------ |
| Correlation ID   | `vs_corr_abc123def456`                | Client-supplied or server-generated; safe to log |
| Request ID       | UUID                                  | Per-request server identifier                    |
| Device ID        | `DEV-OFFICER-01`                      | Registered device identifier; not a secret       |
| Checkpoint ID    | `CP-01`                               | Not sensitive                                    |
| HTTP method      | `POST`                                |                                                  |
| URL path         | `/sync/session`                       | No query string if it contains tokens            |
| HTTP status code | `200`, `401`, `403`                   |                                                  |
| Latency (ms)     | `27.12`                               | Performance observation                          |
| Error category   | `DEVICE_REVOKED`, `INVALID_SIGNATURE` | Categorized; no detail                           |
| Timestamp        | ISO 8601 UTC                          |                                                  |
| Log level        | INFO, WARNING, ERROR                  |                                                  |

---

## Prohibited from Application Logs

The following must **never** appear in application logs under any circumstances:

| Item                             | Reason                                       |
| -------------------------------- | -------------------------------------------- |
| Raw document images              | Privacy — contains biometric + identity data |
| Raw selfie/face images           | Privacy — biometric data                     |
| Full Aadhaar number              | Privacy — UIDAI regulations                  |
| Full passport number             | Privacy — identity data                      |
| Full driving licence number      | Privacy                                      |
| Full name of screened individual | Privacy                                      |
| Date of birth                    | Privacy                                      |
| ECDSA private keys               | Security — device compromise                 |
| ECDSA signatures (raw bytes)     | Security — replay risk                       |
| Admin passcode                   | Security — credential                        |
| Admin bearer tokens              | Security — session theft                     |
| Enrollment codes (plaintext)     | Security — enables unauthorized enrollment   |
| Database connection strings      | Security — credential exposure               |
| Internal filesystem paths        | Security — information disclosure            |
| Stack traces (to client)         | Security — implementation disclosure         |

---

## Masked in Application Logs

The following must be masked or truncated before logging:

| Item                              | Masking Rule                                         |
| --------------------------------- | ---------------------------------------------------- |
| Document/identity numbers         | Last 4 digits only: `****1234`                       |
| Officer badge (where appropriate) | May log for authorized operational use               |
| Nonce values                      | Do not log nonce content — log only presence/absence |

---

## Current Implementation (IMPLEMENTED)

The middleware in [`backend/app/main.py`](file:///backend/app/main.py) logs per-request:

```
corr_id=<id> req_id=<uuid> method=<HTTP method> path=<url path>
status=<code> latency_ms=<float> device=<device_id>
```

No raw PII, images, keys, tokens, or document numbers are logged.

---

## Audit Log Security

The `audit_log` database table is a **security/evidentiary audit trail** — distinct from application logs:

| Property         | Application Logs               | Security Audit Trail                                    |
| ---------------- | ------------------------------ | ------------------------------------------------------- |
| Purpose          | Operational debugging          | Evidentiary chain of custody                            |
| Storage          | Log output (stdout/file)       | `audit_log` table in database                           |
| Tamper detection | None                           | SHA-256 hash chain (verified by `verify_audit_chain()`) |
| Retention        | Short operational (days/weeks) | Longer (production: policy-defined)                     |
| Access           | Ops team                       | Restricted; auditor role                                |
| Contains PII     | No                             | Session IDs, officer badges, actions only               |

### Audit Events Captured

| Event                     | Trigger                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `SYNC_ACCEPTED`           | Successful session sync                                     |
| `SYNC_REJECTED`           | Any failed sync attempt (device, auth, checkpoint, officer) |
| `SYNC_REPLAY_REJECTED`    | Nonce replay detected                                       |
| `SYNC_SIGNATURE_FAILURE`  | ECDSA verification failed                                   |
| `SYNC_IDEMPOTENT_SUCCESS` | Duplicate payload accepted idempotently                     |
| `SYNC_CONFLICT_REJECTED`  | Conflicting payload rejected                                |
| `DEVICE_ENROLLED`         | Successful device enrollment                                |
| `DEVICE_REVOKED`          | Admin revokes a device                                      |
| `DEVICE_SUSPENDED`        | Admin suspends a device                                     |
| `ADMIN_LOGIN`             | Admin session created                                       |
| `device:*`                | Field-device events forwarded with sync payload             |

---

## Production Logging Architecture (PLANNED → TARGET)

### Ministry Pilot (PLANNED)

```
Application stdout
      ↓
Log aggregator (e.g., Fluentd, Filebeat)
      ↓
Centralized log store (Elasticsearch or equivalent)
      ↓
Operational dashboards (Kibana / Grafana)
```

### Production (TARGET)

```
Application logs → centralized pipeline → SIEM
Security audit events → tamper-evident storage → SOC
                        (write-once, compliance-grade)
```

---

## Prototype Logging State (CURRENT)

```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
```

Logs go to stdout. In the prototype, this is typically the terminal or captured by the process supervisor. No log aggregation is deployed.
