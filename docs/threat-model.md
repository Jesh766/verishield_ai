# VeriShield AI — Threat Model

> Phase 4 Evidence Document — STRIDE-informed threat analysis
> Updated from Phase 2 preliminary model to include Phase 4 architecture.

---

## Assets

| Asset                              | Description                                                       | Sensitivity |
| ---------------------------------- | ----------------------------------------------------------------- | ----------- |
| Device ECDSA private key           | Signs all sync requests; compromise enables impersonation         | Critical    |
| Enrollment codes                   | One-time device provisioning; misuse creates unauthorized devices | Critical    |
| Admin credentials (passcode + JWT) | Full system administration access                                 | Critical    |
| Audit trail                        | Tamper-evident record of all screenings and events                | High        |
| Verification sessions              | Screening outcomes and masked identity data                       | High        |
| Device registry (public keys)      | Authoritative list of authorized devices                          | High        |
| Officer assignments                | Checkpoint → officer → device bindings                            | High        |
| Operational telemetry              | Request logs, latency, correlation IDs                            | Medium      |

---

## Actors

| Actor                    | Description                                          | Trust Level          |
| ------------------------ | ---------------------------------------------------- | -------------------- |
| Authorized field officer | Issued device, enrolled, authorized checkpoint       | Trusted within scope |
| Malicious officer        | Authorized but attempting unauthorized actions       | Untrusted            |
| Stolen/lost device       | Physical device in adversary's hands                 | Untrusted            |
| Network attacker         | Intercepts traffic between device and HQ             | Untrusted            |
| Malicious administrator  | Admin with legitimate credentials acting maliciously | Partially trusted    |
| Compromised backend      | Server compromise (supply chain, vulnerability)      | Worst case           |
| Unauthenticated internet | Anonymous internet attacker                          | Untrusted            |

---

## Trust Boundaries

```
┌─────────────────────────────────┐
│      Browser / Field Device     │  ← Trust boundary: ECDSA signature required to cross
│   (IndexedDB, WebCrypto)        │
└───────────────┬─────────────────┘
                │ HTTPS
┌───────────────▼─────────────────┐
│      HQ API Server              │  ← Trust boundary: Admin JWT required for admin routes
│   (FastAPI, SQLite/PostgreSQL)  │
└───────────────┬─────────────────┘
                │
┌───────────────▼─────────────────┐
│      Database                   │  ← Trust boundary: application credentials
│   (verified_sessions, audit)    │
└─────────────────────────────────┘
```

---

## Threat Analysis

### T1 — Device Impersonation

| Property             | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| **Threat**           | Attacker sends sync request claiming to be a registered device                |
| **STRIDE**           | Spoofing                                                                      |
| **Actor**            | Network attacker, stolen device                                               |
| **Impact**           | Unauthorized session records written to HQ database                           |
| **Likelihood**       | Low — requires valid ECDSA private key                                        |
| **Existing control** | ECDSA P-256 signature required; server verifies against registered public key |
| **Test**             | `test_invalid_signature` → 401                                                |
| **Remaining risk**   | Physical device theft (private key in IndexedDB)                              |
| **Mitigaton**        | Device revocation API; hardware-backed keys (TARGET)                          |

---

### T2 — Replay Attack

| Property             | Value                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| **Threat**           | Attacker captures a valid request and replays it                       |
| **STRIDE**           | Spoofing, Repudiation                                                  |
| **Actor**            | Network attacker                                                       |
| **Impact**           | Duplicate session records; audit chain corruption                      |
| **Likelihood**       | Low — nonce + timestamp protection active                              |
| **Existing control** | Unique nonce required; timestamp freshness window (5 min); nonce cache |
| **Test**             | `test_replay_attack` → 409                                             |
| **Remaining risk**   | Nonce cache is process-local (not durable across restarts)             |
| **Mitigation**       | Redis-backed nonce store with TTL (PLANNED)                            |

---

### T3 — Checkpoint Spoofing

| Property             | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| **Threat**           | Device claims to belong to a different checkpoint                             |
| **STRIDE**           | Elevation of Privilege                                                        |
| **Actor**            | Malicious officer                                                             |
| **Impact**           | Session attributed to wrong checkpoint                                        |
| **Likelihood**       | Low — checkpoint is server-bound to device                                    |
| **Existing control** | Server verifies checkpoint from registered device record; exact equality only |
| **Test**             | `test_checkpoint_substring_attack` (CP-01 vs CP-012) → 403                    |
| **Remaining risk**   | None at application layer                                                     |

---

### T4 — Enrollment Code Theft

| Property             | Value                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Threat**           | Attacker obtains an enrollment code and registers an unauthorized device                |
| **STRIDE**           | Spoofing, Elevation of Privilege                                                        |
| **Actor**            | Insider threat, network attacker                                                        |
| **Impact**           | Unauthorized device enrolled, gains sync access                                         |
| **Likelihood**       | Medium — codes distributed out-of-band                                                  |
| **Existing control** | Proof-of-possession (PoP) required; code binds to specific device_id; one-time use only |
| **Test**             | `test_enrollment.py` — PoP verification                                                 |
| **Remaining risk**   | Code delivery channel security is out-of-scope for prototype                            |
| **Mitigation**       | Secure OOB delivery channel; short expiry; code + device_id binding                     |

---

### T5 — Admin Credential Compromise

| Property             | Value                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Threat**           | Admin passcode obtained by adversary                                                |
| **STRIDE**           | Elevation of Privilege                                                              |
| **Actor**            | Insider threat, credential stuffing                                                 |
| **Impact**           | Full system access: device revocation, audit access, device lifecycle               |
| **Likelihood**       | Medium — passcode is a single shared secret                                         |
| **Existing control** | Rate limited (5 attempts/min); bearer token TTL (8h); no plaintext passcode storage |
| **Test**             | `test_api.py::test_admin_login_*`                                                   |
| **Remaining risk**   | Single shared passcode is not MFA; prototype limitation                             |
| **Mitigation**       | Central IAM + MFA for Ministry Pilot (PLANNED)                                      |

---

### T6 — Audit Trail Tampering

| Property             | Value                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| **Threat**           | Attacker modifies historical audit records                                  |
| **STRIDE**           | Tampering, Repudiation                                                      |
| **Actor**            | Compromised backend, malicious admin                                        |
| **Impact**           | Evidentiary record corrupted; accountability lost                           |
| **Likelihood**       | Low — requires direct database access                                       |
| **Existing control** | SHA-256 tamper-evident hash chain; chain verified by `verify_audit_chain()` |
| **Test**             | `test_security_regression.py::test_audit_chain_tamper_detection`            |
| **Remaining risk**   | Admin with DB write access can still modify if they rebuild the chain       |
| **Mitigation**       | Write-once immutable audit log storage (SIEM integration — TARGET)          |

---

### T7 — Oversized Payload DoS

| Property             | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| **Threat**           | Attacker sends large payloads to degrade service            |
| **STRIDE**           | Denial of Service                                           |
| **Actor**            | Network attacker, unauthenticated internet                  |
| **Impact**           | Server resource exhaustion                                  |
| **Likelihood**       | Medium                                                      |
| **Existing control** | Content-Length check before processing; 413 response        |
| **Test**             | `test_performance.py::test_oversized_sync_payload_rejected` |
| **Remaining risk**   | Chunked transfer encoding bypasses Content-Length check     |
| **Mitigation**       | Streaming body size limit (WAF — PLANNED)                   |

---

### T8 — PII Data Leakage

| Property             | Value                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Threat**           | Raw document images, Aadhaar numbers, or biometric data exposed                                                |
| **STRIDE**           | Information Disclosure                                                                                         |
| **Actor**            | Compromised backend, log aggregator                                                                            |
| **Impact**           | Privacy violation; regulatory exposure                                                                         |
| **Likelihood**       | Low — by design, raw data never stored                                                                         |
| **Existing control** | Images ephemeral (15 min upload TTL, purge on session close); only masked identity in DB; privacy-safe logging |
| **Test**             | Code review + architecture                                                                                     |
| **Remaining risk**   | Client-side (browser storage) retains masked data in IndexedDB                                                 |
| **Mitigation**       | Browser storage encryption; minimal retention policy                                                           |

---

## Threat Summary Matrix

| ID  | Threat                      | Likelihood | Impact   | Control Status              |
| --- | --------------------------- | ---------- | -------- | --------------------------- |
| T1  | Device impersonation        | Low        | Critical | ✅ ECDSA signature          |
| T2  | Replay attack               | Low        | High     | ✅ Nonce + timestamp        |
| T3  | Checkpoint spoofing         | Low        | Medium   | ✅ Exact equality check     |
| T4  | Enrollment code theft       | Medium     | High     | ✅ PoP + one-time use       |
| T5  | Admin credential compromise | Medium     | Critical | ⚠️ Passcode (single factor) |
| T6  | Audit tampering             | Low        | High     | ✅ Hash chain               |
| T7  | Oversized payload DoS       | Medium     | Medium   | ✅ Size limits              |
| T8  | PII data leakage            | Low        | High     | ✅ Ephemeral + masked       |
