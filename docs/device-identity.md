# VeriShield AI — Device Identity Model

This document describes the device authentication architecture at each deployment tier.
It accurately describes what is **currently implemented** and what remains on the roadmap.

---

## SIH Prototype (Current Implementation)

### Device Identity

Each field device obtains its registered identity via controlled one-time enrollment:

```
Authorized device assignment (HQ)
        │
        ▼
One-time controlled enrollment (Code: VS-ENROLL-...)
        │
        ▼
WebCrypto ECDSA P-256 key pair generated locally
        │
        ├─ Private key: stays in browser as non-exportable CryptoKey in IndexedDB
        │   (never exported, never sent to HQ, never in localStorage)
        │
        └─ Public key + Proof-of-Possession signature over challenge:
            canonical challenge: ENROLL\n{device_id}\n{enrollment_code}\n{public_key}
            │
            ▼
POST /device/enroll
            │
            ├─ Verify proof-of-possession signature
            ├─ Bind public key to pre-authorized device record
            └─ Mark enrollment code as consumed (one-time use)
        │
        ▼
Normal signed synchronization (POST /sync/session)
        │
        ├─ Canonical request signature signed with local private key
        └─ HQ verifies signature against registered public key
```

### HQ Backend Verification

```
Receive sync request
    │
    ├─ Look up device_id in RegisteredDevice table (pre-provisioned, no auto-registration)
    │       unknown → 403 DEVICE_NOT_REGISTERED
    │
    ├─ Verify device ↔ checkpoint authorization
    │       mismatch → 403 DEVICE_CHECKPOINT_MISMATCH
    │
    ├─ Verify officer badge authorization
    │       officer must pre-exist in DB → 403 UNAUTHORIZED_OFFICER
    │
    ├─ Verify checkpoint exists in DB
    │       unknown → 403 UNKNOWN_CHECKPOINT
    │
    ├─ Verify timestamp freshness (≤ 300 s clock skew)
    │       expired → 401
    │
    ├─ Check nonce not previously seen (in-memory replay cache)
    │       reused → 409
    │
    └─ Verify ECDSA signature against registered public key
            invalid → 401 (no HMAC fallback, no alternative auth path)
```

### Device Registry

The `registered_devices` table contains:

| Column                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `device_id`           | Unique device identifier (sent as `X-VeriShield-Device`) |
| `checkpoint_id`       | The checkpoint this device is authorized for             |
| `officer_badge`       | The officer badge this device is authorized for          |
| `public_key_spki_b64` | ECDSA P-256 public key, SPKI DER, base64                 |
| `algorithm`           | `ECDSA-P256-SHA256`                                      |
| `status`              | `active` or `revoked`                                    |
| `created_at`          | Provisioning timestamp                                   |

> [!IMPORTANT]
> Devices are provisioned by an enrollment authority — never auto-registered from sync requests.
> The client cannot supply its own authoritative public key in a sync request.

### Key Persistence

| Storage               | What is stored                                    | Security                                             |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| IndexedDB (CryptoKey) | Non-exportable private key, exportable public key | Private key cannot be extracted — even by JavaScript |
| Not stored            | Raw key bytes, PEM, JWK                           | Never written to disk in extractable form            |
| Not used              | `localStorage`, `sessionStorage`                  | No key material in these stores                      |

### Nonce Replay Protection

**SIH prototype**: In-memory `_USED_NONCES` dictionary with 10-minute TTL.

> [!WARNING]
> The in-memory nonce cache does **not** survive server restarts.
> It does **not** work correctly in multi-instance / load-balanced deployments.
>
> This is acceptable for the SIH single-server prototype. Production requires
> a durable distributed replay cache (Redis, PostgreSQL, etc.).

### Audit Chain

The audit log uses a **tamper-evident hash chain**: each entry includes the SHA-256
hash of its content chained to the previous entry's hash.

> [!NOTE]
> This is a **tamper-evident hash chain** — not a blockchain or immutable ledger.
> A sufficiently privileged database administrator can alter records.
> Production deployment requires stronger immutable storage (append-only DB,
> centralized audit service, or HSM-signed log entries).

---

## Ministry Pilot (Roadmap — Not Implemented)

```
Device certificate issued by Ministry CA
    │
    ├─ X.509 certificate bound to device hardware identifier
    ├─ mTLS client certificate authentication
    ├─ Controlled enrollment through authenticated enrollment station
    └─ Certificate lifecycle management (renewal, revocation via CRL/OCSP)
```

> [!IMPORTANT]
> This tier is **not currently implemented**. Do not claim it is.

---

## Production (Roadmap — Not Implemented)

```
Government PKI
    │
    ├─ Hardware-backed private key (TPM / Secure Enclave)
    ├─ Device certificate issued by NIC / UIDAI CA
    ├─ HSM/KMS for HQ key operations
    ├─ Certificate revocation infrastructure (CRL/OCSP)
    ├─ Audit log written to immutable central store
    └─ Distributed nonce replay protection (Redis Cluster)
```

> [!IMPORTANT]
> This tier is **not currently implemented**. Do not claim it is.

---

## Security Claims — SIH Prototype

The following claims are **provably true** for the current implementation:

| Claim                                                 | Evidence                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Unknown device cannot sync                            | `test_unknown_device_rejected` → 403                                      |
| Unknown officer cannot be created through sync        | `test_unknown_officer_not_created_through_sync`                           |
| Unknown checkpoint cannot be created through sync     | `test_unknown_checkpoint_not_created_through_sync`                        |
| Client cannot supply its own authoritative public key | Backend ignores `X-VeriShield-Public-Key` header; looks up by `device_id` |
| Client cannot change device-checkpoint association    | `test_wrong_checkpoint_rejected` → 403                                    |
| Client cannot change device-officer association       | `test_wrong_officer_rejected` → 403                                       |
| Modified payload fails signature verification         | `test_modified_body_rejected` → 401                                       |
| Replayed request is rejected                          | `test_reused_nonce_rejected` → 409                                        |
| No reusable device secret in source code              | Secret scan: `HMAC_SECRET` — not present in production source             |
| Audit chain tampering is detected                     | `test_audit_chain_tampering_detected`                                     |

---

## What We Do NOT Claim

- That the private key is protected by hardware (it is not — browser software)
- That the audit log is immutable (it is not — SQLite without append-only enforcement)
- That nonce protection survives server restarts (it does not — in-memory)
- That this meets Government of India PKI standards (it does not — prototype only)
