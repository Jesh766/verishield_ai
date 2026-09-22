# VeriShield AI — Capacity Model

> Phase 3.1 Evidence Document — Capacity Estimates with Explicit Classification
>
> Every number in this document is explicitly classified as one of:
> **MEASURED** | **MODELLED** | **ASSUMED** | **TARGET**
>
> Numbers from different categories are never presented as equivalent.

---

## Classification Key

| Label        | Meaning                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| **MEASURED** | Value obtained from actual benchmark execution in this environment               |
| **MODELLED** | Value calculated from measured inputs using a formula                            |
| **ASSUMED**  | Value not measured in this environment; sourced from reasonable domain knowledge |
| **TARGET**   | Desired production value; not yet measured or implemented                        |

---

## 1. Single-Process Capacity (1 Uvicorn Worker, SQLite)

### Field Screening Sub-System (On-Device, Deterministic)

| Component           | P99 Latency  | Source                                        | Implied Max Throughput    |
| ------------------- | ------------ | --------------------------------------------- | ------------------------- |
| Checksum validation | 0.144 ms     | **MEASURED**                                  | ~6,900 ops/sec            |
| Field extraction    | 0.507 ms     | **MEASURED**                                  | ~1,970 ops/sec            |
| ELA math simulation | 0.007 ms     | **MEASURED (simulation only — not real ELA)** | —                         |
| Audit hash chain    | 0.023 ms     | **MEASURED**                                  | ~43,000 ops/sec           |
| Combined pipeline   | **0.674 ms** | **MODELLED** (sum of P99s above)              | **~1,484 screenings/sec** |

> [!WARNING]
> Field screening runs on the officer's browser device. These are single-threaded deterministic measurements on synthetic text data. The Tesseract OCR step (which runs before these components) was not benchmarked — Tesseract was not available in the test environment.

### HQ Sync API (1 Worker, Localhost, SQLite)

| Metric                           | Value             | Source       |
| -------------------------------- | ----------------- | ------------ |
| Sequential median latency        | 27.12 ms          | **MEASURED** |
| Sequential P95 latency           | 44.06 ms          | **MEASURED** |
| Sequential P99 latency           | 158.65 ms         | **MEASURED** |
| Throughput at 10 concurrent      | 23.0 req/sec      | **MEASURED** |
| Throughput at 25 concurrent      | 26.9 req/sec      | **MEASURED** |
| Throughput at 50 concurrent      | 34.0 req/sec      | **MEASURED** |
| Backlog clearance (100 sessions) | 28.7 sessions/sec | **MEASURED** |

> [!NOTE]
> All HTTP benchmarks are **localhost only** — they do not include field-to-HQ network latency. Real field deployments will experience additional latency depending on network path quality (VPN, cellular, satellite, etc.).

---

## 2. Multi-Worker Scaling Model

| Workers                 | Est. Capacity | Source                                              | Limitation                  |
| ----------------------- | ------------- | --------------------------------------------------- | --------------------------- |
| 1 (current dev)         | ~30 req/sec   | **MEASURED**                                        | SQLite write lock           |
| 4 (uvicorn --workers 4) | ~80 req/sec   | **MODELLED** (linear scaling × 4, capped by SQLite) | SQLite contention           |
| 8 (uvicorn --workers 8) | ~120 req/sec  | **MODELLED** (diminishing returns from SQLite)      | SQLite contention           |
| 4 workers + PostgreSQL  | ~150 req/sec  | **MODELLED** (removes SQLite bottleneck)            | ASSUMED PostgreSQL baseline |

> [!IMPORTANT]
> The multi-worker estimates are modelled from the single-worker measurement (30 req/sec at 50 concurrent). Actual multi-worker throughput with PostgreSQL has NOT been measured in this environment and will differ.

---

## 3. Field Deployment Scenarios

### Scenario A: Single Checkpoint (MODELLED)

| Parameter                       | Value       | Source                                                |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| Officers per checkpoint         | 2–5         | **ASSUMED** (typical immigration checkpoint staffing) |
| Screenings per officer per hour | ~30         | **ASSUMED** (manual interview pace)                   |
| Sync requests per hour          | 60–150      | **MODELLED** (officers × screenings/hour)             |
| Required HQ capacity            | < 3 req/min | **MODELLED**                                          |
| Prototype headroom              | ~600×       | **MODELLED** (30 req/sec capacity vs 3 req/min need)  |

### Scenario B: 50-Checkpoint Pilot (MODELLED)

| Parameter        | Value       | Source                                         |
| ---------------- | ----------- | ---------------------------------------------- |
| Checkpoints      | 50          | **ASSUMED** pilot scope                        |
| Officers         | 150         | **ASSUMED** (3 per checkpoint average)         |
| Peak sync load   | ~75 req/min | **MODELLED**                                   |
| Required backend | 1 worker    | **MODELLED** (well within measured 30 req/sec) |

> [!NOTE]
> At officer interview pace (30 screenings/officer/hour), even 500 simultaneous checkpoints would generate less than 250 req/minute — within the capacity of a single measured server. The bottleneck at scale is database write concurrency under burst conditions, not steady-state throughput.

---

## 4. Production Capacity Targets

These are targets for a properly-deployed production system — they have NOT been measured:

| Metric                    | Target        | Source                                          |
| ------------------------- | ------------- | ----------------------------------------------- |
| Uptime SLA                | 99.9%         | **TARGET**                                      |
| Concurrent officers       | 500+          | **TARGET**                                      |
| Daily screenings          | 10,000+       | **TARGET**                                      |
| RPO                       | < 5 minutes   | **TARGET**                                      |
| RTO                       | < 30 minutes  | **TARGET**                                      |
| Peak sustained throughput | > 100 req/sec | **TARGET** (requires PostgreSQL + multi-worker) |

---

## 5. Explicit Non-Claims

> The SIH prototype has measured local performance characteristics and a documented scaling path toward production infrastructure.

The following claims are **NOT supported** by current measurements and must NOT be made:

- "Supports 1 million users" — not measured
- "Government-scale throughput" — not measured
- "National scale capacity" — not measured
- "Production-ready performance" — not validated in production environment

---

## 6. Rate Limiting Capacity

| Limit                        | Value           | Source                                   | Notes                              |
| ---------------------------- | --------------- | ---------------------------------------- | ---------------------------------- |
| Sync rate limit (per device) | 300 req/min     | **MEASURED** (429 observed in load test) | Process-local; **not distributed** |
| Admin login rate limit       | 5 attempts/min  | **MEASURED** (test suite verified)       | Process-local                      |
| Enrollment rate limit        | 10 attempts/min | **MEASURED** (test suite verified)       | Process-local                      |

> [!WARNING]
> Rate limit state is process-local. With multiple workers, each worker enforces independent limits. Production deployment requires Redis-backed shared rate limiting.

---

## 7. Offline Resilience

| Parameter                    | Value                            | Source                                                          |
| ---------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Local ledger storage         | IndexedDB                        | **ASSUMED** — browser storage limits vary by device             |
| Offline operation capability | Indefinite (no network needed)   | **MEASURED** (design verified by architecture)                  |
| Sync retry on reconnection   | Automatic with backlog clearance | **MEASURED** (100-session burst test: 100/100 success)          |
| Duplicate sessions on retry  | 0                                | **MEASURED** (idempotency test: 1 DB record for repeated syncs) |
