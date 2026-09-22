# VeriShield AI — Government Deployment Path

> Phase 3 Evidence Document — Prototype → Pilot → Production Roadmap

## Overview

This document outlines the phased path from the current SIH prototype to a production government deployment at India's immigration checkpoints.

## Phase Summary

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Current    │    │   Phase A   │    │   Phase B   │    │   Phase C   │
│  Prototype   │───▶│   Hardening │───▶│    Pilot    │───▶│  National   │
│  (SIH Demo)  │    │  (3 months) │    │  (6 months) │    │  (12 months)│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Current State (SIH Prototype)

**What works today**:

- ECDSA P-256 device authentication with proof-of-possession enrollment
- Offline-first field screening with local ledger
- Tamper-evident audit hash chain
- Verhoeff + MRZ + DL checksum validation
- AI-assisted document field extraction
- Idempotent HQ synchronization
- 90 automated tests (security, performance, functional)

**What does NOT work today**:

- See `docs/production-gaps.md` for complete gap matrix

---

## Phase A: Infrastructure Hardening (3 months)

### Objective

Replace all prototype-grade infrastructure with production-grade equivalents.

### Deliverables

| #   | Task                                              | Priority | Estimated Effort |
| --- | ------------------------------------------------- | -------- | ---------------- |
| A1  | Migrate SQLite → PostgreSQL                       | P0       | 1 week           |
| A2  | Deploy Redis for rate limiting + nonce cache      | P0       | 1 week           |
| A3  | Implement TLS with government-issued certificates | P0       | 1 week           |
| A4  | Containerize with Docker + Kubernetes manifests   | P0       | 2 weeks          |
| A5  | Implement secret management (Vault)               | P0       | 1 week           |
| A6  | Set up CI/CD with SAST/DAST scanning              | P1       | 2 weeks          |
| A7  | Implement monitoring (Prometheus + Grafana)       | P1       | 1 week           |
| A8  | Implement alerting (PagerDuty)                    | P1       | 3 days           |
| A9  | Implement automated database backup + PITR        | P1       | 1 week           |
| A10 | Commission third-party penetration test           | P1       | 2 weeks          |

### Exit Criteria

- All P0 tasks complete
- Zero HIGH-severity gaps remaining
- Penetration test report with no critical findings

---

## Phase B: Controlled Pilot (6 months)

### Objective

Deploy to 2–3 immigration checkpoints under controlled conditions.

### Deployment Model

```
Government Data Center
    ├── Primary PostgreSQL (AZ-1)
    ├── Standby PostgreSQL (AZ-2)
    ├── Redis Cluster
    ├── 4× Application Workers (Gunicorn + Uvicorn)
    ├── HAProxy Load Balancer
    └── Monitoring Stack (Prometheus + Grafana + Loki)

Pilot Checkpoints (2–3)
    ├── 5–10 officer devices per checkpoint
    ├── Government-provisioned tablets
    └── Secure VPN to data center
```

### Deliverables

| #   | Task                                  | Priority |
| --- | ------------------------------------- | -------- |
| B1  | Deploy to government data center      | P0       |
| B2  | Provision pilot checkpoint devices    | P0       |
| B3  | Train checkpoint officers             | P0       |
| B4  | Implement mTLS for device-to-HQ       | P0       |
| B5  | Integrate with government PKI (X.509) | P1       |
| B6  | Implement key rotation                | P1       |
| B7  | Run sustained load testing (30 days)  | P1       |
| B8  | Establish SLA monitoring dashboard    | P1       |
| B9  | DPDP Act compliance audit             | P1       |
| B10 | STQC quality certification            | P2       |

### Success Criteria

- 99.5% uptime over 30-day pilot period
- Zero data integrity incidents
- Officer satisfaction survey > 80% positive
- All screening decisions traceable via audit chain
- Penetration test: no critical or high findings

---

## Phase C: National Rollout (12 months)

### Objective

Scale to all immigration checkpoints nationwide.

### Deliverables

| #   | Task                                            |
| --- | ----------------------------------------------- |
| C1  | Multi-region deployment (geographic redundancy) |
| C2  | Automated device provisioning at scale          |
| C3  | Integration with existing immigration systems   |
| C4  | 24/7 operations center                          |
| C5  | Automated compliance reporting                  |
| C6  | Annual penetration testing program              |
| C7  | Disaster recovery drill (semi-annual)           |

### Scale Targets

| Metric              | Target       |
| ------------------- | ------------ |
| Checkpoints         | 100+         |
| Concurrent officers | 500+         |
| Daily screenings    | 10,000+      |
| Uptime SLA          | 99.9%        |
| RPO                 | < 5 minutes  |
| RTO                 | < 30 minutes |

---

## Risk Register

| Risk                                       | Likelihood | Impact   | Mitigation                                              |
| ------------------------------------------ | ---------- | -------- | ------------------------------------------------------- |
| Network connectivity at remote checkpoints | High       | Medium   | Offline-first architecture (already implemented)        |
| Device theft/loss                          | Medium     | High     | Non-exportable keys + remote revocation (implemented)   |
| Key compromise                             | Low        | Critical | Device suspension + re-enrollment (implemented)         |
| Database corruption                        | Low        | Critical | Streaming replication + PITR (Phase A)                  |
| Insider threat                             | Low        | High     | Audit trail + role-based access (partially implemented) |
