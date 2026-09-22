# VeriShield AI — Build Progress

SIH26188 · AI-Based Fake Identity & Document Screening System

## Where the judge questions are answered

| Judge question              | Answer this build gives                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "How without hardware?"     | Everything runs on the officer's existing phone plus a laptop/mini-PC at the checkpoint. Field Mode is a FastAPI service on SQLite with local Tesseract OCR — no scanner, no reader, no cloud call. Verified running offline in this sandbox. |
| "Will officers use phones?" | The capture surface is a browser PWA on the phone they already carry. The backend accepts a plain photo upload and does the deskew/upscale work itself, so a handheld photo is enough.                                                        |
| "What AI?"                  | Labelled per check, in the API response. OCR is a real learned model (Tesseract 5 LSTM, `is_ai: true`). Checksums are deterministic arithmetic and are explicitly marked `is_ai: false` — we never dress up maths as AI.                      |

## Phase 1 — Complete

Offline document intake, OCR and structural validation.

- FastAPI service, SQLite store, no outbound network calls.
- Full schema: officers, checkpoints, sessions, audit log.
- OCR: Tesseract 5 LSTM with a dual-variant preprocessing chain (upscaled
  greyscale and binarised) — the higher-confidence read wins.
- Aadhaar: format, issued leading-digit range, Verhoeff checksum.
- Passport: TD3 MRZ parse with ICAO 9303 check digits for document number,
  date of birth, expiry and composite.
- Driving licence: state code, RTO code and structural format.
- Privacy: images live in volatile storage with a hard TTL and are never
  written to the database; identity numbers are masked before persistence
  (`XXXXXXXX6617`).
- 43 tests passing, including end-to-end API round trips against synthetic
  fixtures with genuinely valid checksums.

### MRZ glyph repair (worth demoing)

A phone photo regularly misreads `9` as `O` in the MRZ. Rather than accept a
false FAIL on a genuine passport, the reader tries look-alike substitutions
only (`O -> 0/9`, `B -> 8`, `I -> 1`, …) and accepts one only when the ICAO
check digit then validates. Every repair is reported to the officer:

```
"mrz_ocr_repairs": ["date of birth: 'O' read as '9'"]
```

This cannot rescue a forged number — an attacker would have to supply digits
whose real check digit already matches. There is a test asserting exactly that.

## Phase 2 — Next

- Officer PWA: camera capture, offline queue, decision-support screen.
- Face match against the document portrait (real model, on-device).
- Tamper detection: ELA features plus a small classifier.
- Composite risk score with per-signal contribution shown to the officer.

## Running it

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python fixtures/generate.py          # synthetic test IDs
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --port 8099
```

Try a real photo without starting the server:

```bash
.venv/bin/python fixtures/try_sample.py /path/to/photo.jpg passport
```

## Flow

```text
phone photo -> POST /documents/upload      (volatile, TTL'd)
            -> POST /documents/{id}/ocr    (Tesseract LSTM, local)
            -> POST /documents/{id}/validate  (deterministic checks)
            -> session row with masked fields + audit entry
```
