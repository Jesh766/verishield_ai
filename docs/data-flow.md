# VeriShield AI — System Data Flow Architecture

```text
  [DOCUMENT / FACE IMAGE] ◄── RAW DATA (Volatile Memory Only - Dropped instantly)
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   OFFICER FIELD PWA (OFFLINE)                │
│                                                             │
│  1. Tesseract.js WASM OCR ──► Extracted Text                │
│  2. Deterministic Checksums (Verhoeff/MRZ) ──► Validation   │
│  3. Canvas Error Level Analysis ──► Tamper Score            │
│  4. HOG Biometric Matcher ──► Face Similarity Score        │
│  5. UID Masking Gateway ──► Masked Identity (XXXX-1234)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
              DERIVED DATA  │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     LOCAL DEVICE LEDGER                     │
│  • Session ID: VS-20260830-AB123                            │
│  • Status: Pending / Syncing / Synced / Failed              │
│  • Derived Scores: Risk 12.0 (CLEAR), ELA 8.5%, Face 92%    │
└───────────────────────────┬─────────────────────────────────┘
                            │
    SIGNED SYNCHRONIZATION  │ Network Connectivity Restored
    X-VeriShield-Signature  │ Web Crypto ECDSA P-256 / SHA-256
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        HQ FASTAPI API                       │
│  • Web Crypto Signature Verification                        │
│  • Registered Device & Checkpoint Authorization Check      │
│  • Nonce Replay & Clock Skew Validation                     │
│  • Schema & Risk Range Verification                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
               AUDIT DATA   │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 CENTRAL DATABASE & AUDIT CHAIN              │
│  • VerificationSession Table (Indexed Ledger)               │
│  • AuditLog Table (Tamper-Evident SHA-256 Hash Chain)       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     HQ ADMIN DASHBOARD                      │
│  • Real-time Checkpoint Risk Analytics                       │
│  • Decision Distribution Charts                             │
│  • Audit Hash Chain Integrity Status (`verify_audit_chain`)  │
└─────────────────────────────────────────────────────────────┘
```
