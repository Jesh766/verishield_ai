# VeriShield AI — PKI / mTLS Roadmap

> Phase 4 Evidence Document — Future-state architecture only.
> No Government PKI or HSM is currently deployed. All TARGET components are design-only.

---

## Current State (SIH Prototype — IMPLEMENTED)

```
Device generates ECDSA P-256 key pair via WebCrypto
Private key: non-exportable, stored in browser IndexedDB
Public key: exported and registered with HQ during enrollment

Every sync request:
  Device signs canonical request string with private key (ECDSA-SHA256)
  HQ verifies signature against registered SPKI public key
  No X.509 certificate involved
```

**Limitations:**

- No certificate authority involved
- Key binding to device hardware not enforced (browser software key only)
- No revocation via CRL/OCSP — revocation is database-driven (status field)
- No formal PKI hierarchy

---

## Tier B: Ministry Pilot (PLANNED)

```
Private CA (internal to department)
       │
       ├── Intermediate CA
       │       │
       │       ├── Device Certificate (per field device)
       │       │   ─ Subject: CN=DEV-OFFICER-01
       │       │   ─ Key usage: Digital Signature
       │       │   ─ Private key: software (browser or device TPM)
       │       │
       │       └── Server Certificate (backend API)
       │           ─ Issued by internal CA
       │
       └── Admin Certificate (administrator machines)

mTLS between:
  API Gateway → Backend workers
  Backend → Database (TLS required, not mTLS)
```

**Components:**

- Private CA infrastructure (e.g., Smallstep CA, CFSSL, or HashiCorp Vault PKI)
- Certificate issuance at device enrollment (replaces ECDSA key export model)
- Certificate rotation (90-day validity recommended)
- CRL or OCSP for revocation (replaces database status field for transport layer)

---

## Tier C: Production Government Target (TARGET)

```
Government Root CA (e.g., CCA India / UIDAI-authorized CA)
       │
       ├── Subordinate CA (VeriShield Device Certificates)
       │       │
       │       ├── Device Certificate
       │       │   ─ HSM-backed private key (hardware token or eSIM)
       │       │   ─ Subject: CN=device-id, O=Ministry, C=IN
       │       │   ─ Key usage: Digital Signature
       │       │   ─ Extended key usage: Client Authentication
       │       │
       │       ├── Certificate rotation: automated, < 1 year validity
       │       └── Revocation: OCSP + CRL published by government CA
       │
       ├── Subordinate CA (VeriShield Server Certificates)
       │       └── API server certificate signed by government CA
       │
       └── Admin Identity Certificates
               ─ Issued to administrator hardware tokens
               ─ Used for mTLS admin access
```

**Production requirements:**

- Government-approved HSM for CA private keys
- OCSP responder for real-time revocation
- CRL distribution points
- Certificate lifecycle management (automated rotation before expiry)
- Audit trail of certificate issuance and revocation
- Integration with government identity provider for admin certificates

---

## Transition Steps

| Step | Description                                             | Status          |
| ---- | ------------------------------------------------------- | --------------- |
| 1    | ECDSA non-exportable key + DB-based revocation          | **IMPLEMENTED** |
| 2    | Controlled enrollment with PoP verification             | **IMPLEMENTED** |
| 3    | Private CA for pilot (Smallstep or Vault PKI)           | **PLANNED**     |
| 4    | Replace DB-status revocation with CRL/OCSP at transport | **PLANNED**     |
| 5    | mTLS between gateway and backend                        | **PLANNED**     |
| 6    | Hardware-backed keys (TPM or HSM device tokens)         | **TARGET**      |
| 7    | Government CA integration (CCA India or equivalent)     | **TARGET**      |
| 8    | Full X.509 device certificate lifecycle                 | **TARGET**      |

---

> **Honesty note:** VeriShield does NOT currently integrate with any government PKI, CCA India, UIDAI CA, or any other certificate authority. The current implementation uses application-layer ECDSA key pairs without X.509 certificates. This document describes the design path toward government PKI integration, not a current capability.
