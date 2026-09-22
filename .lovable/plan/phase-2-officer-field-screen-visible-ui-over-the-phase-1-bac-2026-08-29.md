# Phase 2 — Officer Field Screen (visible UI over the Phase 1 backend)

Phase 1 gave us a working FastAPI + SQLite + OCR + checksum engine, but nothing to look at. Phase 2 builds the officer-facing screen so the whole flow — capture, read, verify, decide — is visible in the preview and demo-ready.

## What the officer sees

Single-screen, phone-first flow at `/` (replaces the template placeholder):

1. **Capture** — camera capture or file pick, document type selector (Aadhaar / Passport / Driving Licence). Big touch targets, works one-handed.
2. **Reading** — progress state while OCR runs, with the "no raw image stored" privacy note visible.
3. **Findings** — extracted fields (name, DOB, masked number) each shown with an evidence chip: what was read, how confident, and whether it is deterministic or AI-derived. Checksum verdicts (Verhoeff / ICAO 9303 / DL structure) rendered as explicit PASS / FAIL rows labelled "Deterministic check — not AI".
4. **Decision support** — a risk banner (Clear / Review / Escalate) that states it is _advisory_, plus the officer's own action buttons: Accept, Refer, Reject. The officer's choice is what gets recorded.
5. **Receipt** — session id, masked identity, timestamp, checkpoint, officer decision. Answers "what did the officer actually do".

Also: an **Offline / Field Mode banner** that shows connection state and queues a capture when the backend is unreachable, so the "no hardware, works on a phone" answer is on screen rather than only in the pitch.

## Judge-feedback hooks built into the UI

- "How without hardware?" — the screen runs in a normal phone browser; capture uses the device camera, no scanner or dongle anywhere in the flow.
- "Will officers use phones?" — the layout is mobile-first with thumb-reachable actions; desktop is the secondary layout.
- "What AI?" — every result carries a provenance label: `Deterministic` (checksums, MRZ structure) vs `AI` (OCR now; face match and tamper detection arrive in Phase 3 and already have placeholder slots marked "Phase 3").

## Technical notes

- New route files under `src/routes/`: rewrite `index.tsx` as the officer screen; add `session.$id.tsx` for the receipt view. Each gets its own `head()` metadata.
- The FastAPI service listens on `localhost:8000` inside the sandbox and is not reachable from the browser preview directly. A TanStack server route at `src/routes/api/public/verishield.$.ts` proxies `upload` / `ocr` / `validate` / `decision` to `VERISHIELD_API_URL` (default `http://127.0.0.1:8000`), so the frontend always calls same-origin.
- Client state via TanStack Query; capture and OCR calls are mutations, session read is a query.
- Offline queue in IndexedDB, drained when the proxy answers again. Browser-only code stays inside `useEffect` / event handlers.
- Design tokens in `src/styles.css`: high-contrast field palette (dark slate + amber alert + verification green), condensed sans for data, no purple-gradient default look. Verdict colours are semantic tokens, never hardcoded.
- No raw image is persisted client-side; the object URL is revoked as soon as upload returns.

## Out of scope for Phase 2

Face match, tamper/ELA detection, officer assistant, HQ sync to Postgres. Their UI slots exist but are labelled as later phases.

## Verification

Run the backend in the sandbox, drive the preview with Playwright end-to-end using the synthetic Aadhaar and DL fixtures, and confirm on screen: fields extracted, checksum verdicts correct, decision recorded to SQLite, and the offline banner appearing when the backend is stopped.
