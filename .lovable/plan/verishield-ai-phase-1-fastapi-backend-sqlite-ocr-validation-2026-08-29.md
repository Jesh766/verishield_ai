# VeriShield AI — Phase 1: FastAPI backend, SQLite, OCR, validation

Goal for this phase: a working offline backend that ingests a document image, extracts fields via real OCR, runs deterministic structural checks for Aadhaar / Passport / DL, persists a session, and is proven end-to-end with curl before any UI work.

## How the two languages coexist here

This workspace previews a React/Vite app; it cannot host a running Python process. That matches your architecture rather than fighting it — FastAPI is meant to run _on the officer's own device_ at localhost, not in a cloud. So:

- `/backend` lives in this repo as real, runnable source. I write it, install deps, run uvicorn, and hit every endpoint with curl inside my sandbox (Python 3.13 + Tesseract 5 confirmed present) so it is verified, not assumed.
- You run the same thing locally with `uvicorn app.main:app --reload`.
- From Phase 2 the React frontend lives in this repo's existing `src/` and previews here, pointed at `http://localhost:8000` with the base URL in one config file.

## What gets built

**Project scaffold**

```text
/backend
  /app
    /api        documents.py, verify.py, health.py
    /services   ocr.py, checksum.py, extract.py
    /models     db.py (SQLAlchemy), schemas.py (Pydantic)
    /ml         .gitkeep (Phase 4)
    config.py, main.py
  /tests        test_checksum.py, test_extract.py, test_api.py
  /fixtures     synthetic sample images + generator script
  requirements.txt, README.md
/docs           PROGRESS.md, ARCHITECTURE.md, CHANGELOG.md
```

**Database (full schema now, as chosen)** — SQLite via SQLAlchemy: `officers`, `checkpoints`, `verification_sessions`, `audit_log`, exactly as specified. Seeded with one demo checkpoint and one demo officer (bcrypt hash). Auth is a stub in Phase 1: endpoints accept an officer id header; real login lands with HQ mode.

Privacy is enforced at the data layer, not by convention: uploaded images go to a temp directory keyed by `document_id` with a TTL, are never written to the DB, and a background sweep deletes them at session close or expiry. Only extracted fields, scores, and outcomes persist. Numbers are stored masked (last 4 visible) with a full-value hash for cross-document matching in Phase 7.

**OCR service (real ML)** — pytesseract over Tesseract 5, with a preprocessing chain (grayscale, deskew, adaptive threshold, upscale). Returns raw text plus per-word confidences. EasyOCR is kept behind a config flag as a fallback if Indian-document accuracy is poor. Clearly commented as a learned model.

**Field extraction** — regex over OCR text: Aadhaar `\b(\d{4})\s?(\d{4})\s?(\d{4})\b`, name/DOB/gender heuristics, passport MRZ TD3 two-line parse, DL `^[A-Z]{2}\d{2}\d{4,11}$`. Commented and surfaced as deterministic, not AI.

**Validation service (deterministic — labelled as such everywhere)**

- Aadhaar: Verhoeff checksum with the standard d[10][10] and p[8][10] tables.
- Passport: ICAO 9303 MRZ check digits — document number, DOB, expiry, and composite — weights 7/3/1.
- DL: structure + state-code whitelist only, returning the explicit message that no public national DL checksum standard exists.

Each check returns `{check, passed, detail, is_ai: false}` so the UI can render a reason, never a bare colour.

**Endpoints (Phase 1 subset)** — `POST /documents/upload`, `POST /documents/{id}/ocr`, `POST /documents/{id}/validate`, `GET /sessions/{id}`, `GET /health`. Face-match, tamper, risk, assistant, admin, sync are declared in the router with explicit 501 "not implemented — Phase N" responses so nothing looks fake.

**Test data (both, as chosen)** — a fixture generator that renders synthetic Aadhaar/passport/DL card images with checksum-valid fake numbers and a real TD3 MRZ, used by the automated tests; plus a documented drop-in folder for your own samples.

**Verification before this phase is called done** — pytest for the checksum tables (known-good and known-bad vectors), extraction, and API round-trip; then a live `curl` walkthrough upload → ocr → validate against a synthetic image, with the output pasted back to you.

**docs/PROGRESS.md** — a real/stubbed/planned table, honest about what is deterministic vs learned. At the end of Phase 1: OCR = real model; checksums = deterministic; face match, tamper, risk, assistant = not built yet.

## Not in this phase

No frontend, no face match, no tamper, no risk model, no assistant, no HQ sync. I stop after the curl walkthrough and confirm with you before Phase 2.
