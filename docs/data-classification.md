# VeriShield AI — Data Classification

> Phase 4 Evidence Document
> Classifies all data categories handled by the system.
>
> Disclaimer: This classification is designed to support data-minimization
> and controlled-access requirements. It does not constitute legal compliance.
> Production data handling must be reviewed by the competent authority and
> applicable privacy/data-protection policy.

---

## Classification Levels

| Level | Label          | Description                                                       |
| ----- | -------------- | ----------------------------------------------------------------- |
| L1    | **RESTRICTED** | Highly sensitive; minimized; never persisted in identifiable form |
| L2    | **SENSITIVE**  | Sensitive; stored in masked/hashed form only; access controlled   |
| L3    | **INTERNAL**   | Operational; not public; access restricted to authorized staff    |
| L4    | **PUBLIC**     | No sensitivity; freely shareable                                  |

---

## Data Inventory

### RAW DOCUMENT IMAGES

| Property               | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| **Classification**     | L1 — RESTRICTED                                                  |
| **Description**        | Scanned passport, Aadhaar card, driving licence images           |
| **Storage location**   | Browser memory only (during processing)                          |
| **Disk persistence**   | Upload directory: **15-minute TTL, then deleted**                |
| **Database**           | **Never stored**                                                 |
| **Encryption**         | Not applicable (ephemeral)                                       |
| **Access roles**       | Processing pipeline only (no human access)                       |
| **Synchronized to HQ** | No — images are never sent in sync payload                       |
| **Retention**          | Ephemeral — destroyed after processing                           |
| **Notes**              | Privacy-by-design: images are processed locally, not transmitted |

---

### RAW SELFIE / FACE IMAGES

| Property               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Classification**     | L1 — RESTRICTED                                  |
| **Description**        | Selfie images captured for face-match comparison |
| **Storage location**   | Browser memory only                              |
| **Disk persistence**   | Same 15-minute TTL as document images            |
| **Database**           | **Never stored**                                 |
| **Synchronized to HQ** | No                                               |
| **Retention**          | Ephemeral — destroyed after processing           |

---

### EXTRACTED IDENTITY FIELDS (MASKED)

| Property               | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| **Classification**     | L2 — SENSITIVE                                                       |
| **Description**        | Structured fields extracted from document (name, DOB, document type) |
| **Masking applied**    | Identity numbers: last 4 digits only (`****1234`)                    |
| **Storage location**   | `verification_sessions.extracted_fields` (JSON column)               |
| **Database**           | SQLite (prototype); PostgreSQL (production target)                   |
| **Encryption**         | At-rest encryption: **PLANNED** (disk encryption at OS level)        |
| **Access roles**       | Admin, Auditor (read); System (write)                                |
| **Synchronized to HQ** | Yes — masked fields only                                             |
| **Retention**          | Production: per competent authority retention policy                 |

---

### DOCUMENT IDENTITY HASH

| Property               | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **Classification**     | L2 — SENSITIVE                                                                          |
| **Description**        | SHA-256 HMAC of document number (enables cross-session matching without storing number) |
| **Storage location**   | `verification_sessions.identity_hash`                                                   |
| **Reversible**         | No — one-way hash with secret salt                                                      |
| **Access roles**       | System (write), Admin (read)                                                            |
| **Synchronized to HQ** | Yes                                                                                     |

---

### RISK SCORES AND VERDICTS

| Property                    | Value                                                     |
| --------------------------- | --------------------------------------------------------- |
| **Classification**          | L2 — SENSITIVE                                            |
| **Description**             | Risk band, risk score, tamper verdict, face match verdict |
| **Storage location**        | `verification_sessions` columns                           |
| **Contains biometric data** | Score only (not raw biometric)                            |
| **Access roles**            | Admin, Auditor, Supervisor                                |
| **Synchronized to HQ**      | Yes                                                       |

---

### OFFICER DECISIONS

| Property               | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| **Classification**     | L2 — SENSITIVE                                              |
| **Description**        | Cleared / referred / rejected / pending decision by officer |
| **Storage location**   | `verification_sessions.decision`                            |
| **Access roles**       | Admin, Auditor, Supervisor                                  |
| **Synchronized to HQ** | Yes                                                         |

---

### AUDIT EVENTS

| Property               | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| **Classification**     | L2 — SENSITIVE                                               |
| **Description**        | Tamper-evident chain of system and officer actions           |
| **Storage location**   | `audit_log` table                                            |
| **Contains PII**       | Session IDs, officer badge IDs, action categories only       |
| **Retention**          | Production: longer retention (subject to evidentiary policy) |
| **Access roles**       | Auditor (read-only), System (write)                          |
| **Synchronized to HQ** | Written at HQ — not a sync payload field                     |
| **Tamper detection**   | SHA-256 hash chain — verified by `/admin/audit/verify`       |

---

### DEVICE IDENTIFIERS AND PUBLIC KEYS

| Property               | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Classification**     | L3 — INTERNAL                                                                 |
| **Description**        | Device ID, registered checkpoint, officer assignment, ECDSA public key (SPKI) |
| **Storage location**   | `registered_devices` table                                                    |
| **Sensitivity**        | Public key is not secret; device assignment is internal                       |
| **Access roles**       | Admin, System                                                                 |
| **Synchronized to HQ** | Pre-provisioned at HQ; not a sync payload                                     |

---

### DEVICE ECDSA PRIVATE KEYS

| Property             | Value                                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Classification**   | L1 — RESTRICTED                                                                      |
| **Description**      | ECDSA P-256 private key per field device                                             |
| **Storage location** | Browser IndexedDB (non-exportable WebCrypto key)                                     |
| **Disk persistence** | Test fixtures: `backend/tests/fixtures/*_priv.pem` (excluded from ZIP and container) |
| **Never**            | Transmitted, logged, or stored at HQ                                                 |
| **Access roles**     | Device-only (non-exportable)                                                         |

---

### ENROLLMENT CODES

| Property             | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| **Classification**   | L1 — RESTRICTED                                                  |
| **Description**      | One-time device enrollment authorization codes                   |
| **Storage location** | `device_enrollments.code_hash` (SHA-256 hashed, never plaintext) |
| **Access roles**     | Admin (issues), Device (consumes)                                |
| **Retention**        | Single use — consumed on successful enrollment                   |

---

### OPERATIONAL TELEMETRY

| Property             | Value                                                         |
| -------------------- | ------------------------------------------------------------- |
| **Classification**   | L3 — INTERNAL                                                 |
| **Description**      | HTTP method, path, status, latency, correlation ID, device ID |
| **Storage location** | Application log output (stdout)                               |
| **Contains PII**     | No — device ID only (not a personal identifier)               |
| **Retention**        | Short operational (days/weeks in production)                  |
| **Access roles**     | Ops team                                                      |

---

## Data Flow Summary

```
Raw Image       → Browser only → Processing → DELETED (15 min max)
Selfie          → Browser only → Processing → DELETED (15 min max)
Extracted fields → Masked → Sync payload → HQ database (masked)
Risk scores     → Computed → Sync payload → HQ database
Officer decision → Input → Sync payload → HQ database
Audit events    → HQ writes only → audit_log → tamper-evident
Device keys     → Non-exportable → HQ stores public key only
```
