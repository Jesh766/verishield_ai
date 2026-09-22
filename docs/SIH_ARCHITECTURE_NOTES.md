# VeriShield AI: SIH Architecture Notes

## 1. Architecture Explanation

VeriShield AI is a multi-signal identity verification platform prototype. A verification case combines document signals, person signals, authority status, and device-security context into one evidence record. The system then compares available signals, produces an explainable advisory assessment, requires an officer decision, and preserves the resulting record through a tamper-evident audit chain. The differentiator is **multi-signal trust**: the product does not reduce identity verification to OCR and a green tick.

## 2. Main Data Flow

```text
Capture
  -> Extract
  -> Verification Case
  -> Document / Person / Authority / Device Signals
  -> Consistency
  -> Advisory Risk Assessment
  -> Explainable Decision
  -> Case Record
  -> HQ Operations
  -> Tamper-Evident Audit Chain
```

The current browser path performs OCR, document classification, field extraction, structural checks, Document Integrity Analysis, optional Advisory Face Similarity, and deterministic Advisory Risk Assessment locally. Derived evidence is stored in the local receipt ledger. When connected, the client signs and synchronizes the derived session to the FastAPI HQ service.

## 3. Security Flow

1. A device is enrolled with a one-time enrollment code and an ECDSA P-256 proof of possession.
2. The device signs the canonical synchronization request with its browser-held key.
3. HQ verifies the registered device, officer, checkpoint, timestamp, nonce, signature, allowed values, and idempotency rules.
4. The backend persists the accepted session and audit events atomically.
5. Audit events are linked with a SHA-256 hash chain and can be verified from the HQ admin surface.

Current prototype limitations: nonce and rate-limit state are process-local, the browser key is stored in IndexedDB rather than hardware-bound, and the ledger is SQLite.

## 4. Offline Capability

Offline capability is a resilience feature, not the primary presentation claim. The browser can run the local verification engine without a network connection, store a derived receipt locally, and mark it pending sync. Raw images, face crops, and heatmaps are not persisted in the session record. When connectivity returns, signed derived results can be pushed to HQ.

## 5. Connected Verification Flow

When connected, the field device synchronizes a signed verification session to `/sync/session`. HQ validates the device-security envelope and stores the derived evidence for admin statistics, case review, intelligence aggregation, export, and audit verification. The current backend receives completed client-derived signals; it does not yet orchestrate every signal as one server-side connected pipeline.

The Authoritative Verification Gateway is the integration boundary for future authorized providers. Its current state is **NOT CONFIGURED**. No UIDAI, Passport Seva, Parivahan, or other government database call is implemented.

## 6. Current Limitations

- Authoritative government verification is not configured.
- The backend does not yet orchestrate all verification signals as one connected pipeline.
- The current risk result is advisory and deterministic; it is not an official risk score.
- Document Integrity Analysis is an uncalibrated ELA/recompression heuristic.
- Advisory Face Similarity is not biometric authentication.
- CASE-001 through CASE-006 deterministic demo fixtures are not currently seeded.
- SQLite, process-local nonce/rate-limit state, and IndexedDB keys are prototype deployment choices.
- There is no blockchain, HSM, TPM production binding, or production PKI integration.

## 7. Future Integrations

Future work may add authorized provider adapters behind the Authoritative Verification Gateway, a shared versioned verification-session service, PostgreSQL and distributed replay/rate-limit state, WebAuthn or hardware-backed key binding, calibrated integrity/face models, and deterministic presentation fixtures. These are architectural extension points, not current capabilities.

## 8. Exact Safe Claims for PPT

Use these claims:

- **Real-time identity verification platform prototype with multi-signal trust analysis.**
- **On-device OCR, document classification, field extraction, and structural validation.**
- **Document Integrity Analysis using an advisory ELA/recompression heuristic.**
- **Advisory Face Similarity for decision support, not face authentication.**
- **Advisory Risk Assessment with explainable deterministic contributions, not an official risk score.**
- **ECDSA P-256 device identity, signed synchronization, timestamp and nonce replay checks.**
- **Tamper-Evident Audit Chain using SHA-256 hash linking, not blockchain.**
- **Authoritative Verification Gateway designed for future authorized integrations; currently NOT CONFIGURED.**
- **Derived evidence and masked identity fields are synchronized; raw document images are not stored in the session ledger.**

Do not claim live UIDAI, Passport Seva, Parivahan, government database access, blockchain, HSM, TPM production binding, biometric authentication, official fraud scoring, or nationwide deployment.
