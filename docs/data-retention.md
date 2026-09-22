# VeriShield AI — Data Retention & Privacy Policy

## 1. DATA LIFETIME POLICIES

| Data Category              | Volatility & Lifetime                               | Storage Location                 | Retention & Purge Mechanism                                                                                  |
| :------------------------- | :-------------------------------------------------- | :------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **Raw Document Images**    | **Volatile Memory Only** (0 seconds disk retention) | Client RAM / HTML Canvas         | Dropped immediately upon completing local OCR & ELA analysis. Never written to disk or network.              |
| **Temporary Uploads**      | **Max 60 Minutes**                                  | Server `/tmp` storage            | Purged automatically via background sweep service (`storage.sweep()`) and lifespan cleanup.                  |
| **Local Device Ledger**    | **Configurable (Max 60 sessions)**                  | Browser LocalStorage / IndexedDB | Retained locally for offline screening. Oldest synced records pruned automatically when capacity is reached. |
| **HQ Verification Ledger** | _Requires authority-specific retention policy_      | SQLite / PostgreSQL              | Retains derived scores, masked UIDs (`XXXX-XXXX-1234`), and officer decisions for official audit trails.     |
| **Audit Log Chain**        | _Requires authority-specific retention policy_      | Central Database                 | Immutable SHA-256 tamper-evident hash chain. Append-only retention.                                          |

---

## 2. PRIVACY MANDATES

1. **UIDAI Compliance**: Raw 12-digit Aadhaar UIDs are automatically masked in memory (`XXXX-XXXX-1234`). Full numbers are never stored on client or server.
2. **Zero Image Cloud Streaming**: Document photos are processed locally on the officer's device using Tesseract.js WASM, HTML Canvas ELA, and client-side face embeddings. Zero raw image bytes are sent over the network.
