# VeriShield AI — Privacy Data Flow & Data Minimization Architecture

> Phase 5 Privacy Evidence Document
> Complete trace of citizen-derived identity data from capture to destruction.

---

## Data Flow Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CAPTURE (Field Device Browser)                                          │
│    - Officer captures photo of Document (Passport / Aadhaar / DL)           │
│    - Image held in browser RAM / HTML Canvas                                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. LOCAL PROCESSING (Tesseract WASM in Browser)                            │
│    - OCR extracts text locally inside officer's device                     │
│    - Local JS runs Verhoeff / MRZ checksum validation                       │
│    - Raw image IS NOT SENT to backend during offline screening              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. FIELD MASKING (Client-side)                                              │
│    - Document number masked: "123456789012" → "****9012"                     │
│    - SHA-256 identity hash generated with secret salt                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. LOCAL LEDGER (IndexedDB)                                                 │
│    - Stores masked screening record locally for offline operation           │
│    - ECDSA P-256 key signs sync payload                                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. SECURE SYNC (HQ Backend)                                                 │
│    - Payload sent over HTTPS with ECDSA signature                           │
│    - Payload contains ONLY masked fields, risk scores, and officer decision │
│    - RAW IMAGE IS NEVER TRANSMITTED IN SYNC PAYLOAD                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. PERSISTENCE & AUDIT (HQ Database)                                        │
│    - VerificationSession created with masked fields                         │
│    - AuditLog event chained with SHA-256 hash                               │
│    - Uploaded temp images (if server upload used) deleted by 15-min TTL     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Data Element Privacy Lifecycle

| Data Element         | Captured? | Persisted in DB? | Transmitted to HQ?  | Masked/Hashed?      | Retention Period       |
| -------------------- | --------- | ---------------- | ------------------- | ------------------- | ---------------------- |
| Raw Document Image   | Ephemeral | **NO**           | **NO** (Field Mode) | N/A                 | RAM / 15-min Temp Disk |
| Raw Selfie Image     | Ephemeral | **NO**           | **NO**              | N/A                 | RAM / 15-min Temp Disk |
| Document Number      | Yes       | **NO** (Masked)  | **NO** (Masked)     | Masked (`****1234`) | Ephemeral RAM only     |
| Identity Hash        | Yes       | Yes              | Yes                 | SHA-256 + Salt      | Persistent DB          |
| Full Name            | Yes       | Masked/Partial   | Yes                 | Partial             | Persistent DB          |
| Date of Birth        | Yes       | Yes (Year/Age)   | Yes                 | Optional mask       | Persistent DB          |
| Risk Score / Verdict | Yes       | Yes              | Yes                 | N/A                 | Persistent DB          |
| Officer Badge ID     | Yes       | Yes              | Yes                 | Plaintext           | Persistent DB          |
| Checkpoint ID        | Yes       | Yes              | Yes                 | Plaintext           | Persistent DB          |
| Audit Hash Chain     | Yes       | Yes              | Local to HQ         | SHA-256 chained     | Persistent DB          |

---

## Verification of Raw Image Retention

- **Server Upload Cleanup**: Tested via `storage.py::sweep()`. Uploaded files are assigned creation timestamps and purged automatically after `VERISHIELD_UPLOAD_TTL` (900 seconds / 15 minutes).
- **Database Verification**: SQLAlchemy models in `backend/app/models/db.py` contain NO binary image columns or base64 image strings. `VerificationSession` records store structured metadata only.
