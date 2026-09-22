# VeriShield AI — Disaster Recovery Plan

> Phase 3 Evidence Document — Target HA & RPO/RTO Design
>
> This document describes the target disaster recovery architecture.
> The current prototype does NOT implement HA or automated failover.

## 1. Recovery Objectives

| Metric                                | Target      | Rationale                           |
| ------------------------------------- | ----------- | ----------------------------------- |
| **RPO** (Recovery Point Objective)    | 5 minutes   | Maximum acceptable data loss window |
| **RTO** (Recovery Time Objective)     | 30 minutes  | Maximum acceptable downtime         |
| **MTBF** (Mean Time Between Failures) | > 720 hours | Target system reliability           |

## 2. Current Prototype Capabilities

| Capability                    | Status             | Notes                                                |
| ----------------------------- | ------------------ | ---------------------------------------------------- |
| Offline-first field operation | ✅ Implemented     | Devices operate independently when HQ is unreachable |
| Local ledger persistence      | ✅ Implemented     | IndexedDB stores all screening sessions locally      |
| Tamper-evident audit chain    | ✅ Implemented     | SHA-256 hash chain detects retroactive modification  |
| Idempotent sync               | ✅ Implemented     | Safe to retry without creating duplicate records     |
| Database backup               | ❌ Manual only     | SQLite file copy; no automated backup                |
| Automated failover            | ❌ Not implemented | Single-process deployment                            |
| Geographic redundancy         | ❌ Not implemented | Single-site deployment                               |

## 3. Target Production Architecture

### 3a. Database Layer

```
Primary PostgreSQL (Region A)
    ├── Streaming replication → Standby (Region A)
    ├── Streaming replication → Standby (Region B)
    └── WAL archival → Object Storage (S3/GCS)
```

- **Synchronous replication** to at least one standby within the same region
- **Asynchronous replication** to cross-region standby
- **Point-in-time recovery** via WAL archival (RPO: ~1 minute)

### 3b. Application Layer

```
Load Balancer (HAProxy / ALB)
    ├── App Server 1 (Region A, AZ-1)
    ├── App Server 2 (Region A, AZ-2)
    └── App Server 3 (Region B, AZ-1) [warm standby]
```

- Active-active within primary region
- Warm standby in secondary region
- Health checks every 10 seconds
- Automatic failover on 3 consecutive health check failures

### 3c. Field Device Resilience

```
Field Device (offline-capable)
    ├── IndexedDB local ledger
    ├── Non-exportable ECDSA key pair
    └── Automatic sync retry with exponential backoff
```

- **No data loss on HQ failure**: All screening data remains in local ledger
- **Automatic reconnection**: Devices retry sync when HQ becomes available
- **Idempotent sync**: No duplicate records on retry

## 4. Backup Strategy

| Data               | Method                     | Frequency                       | Retention                   |
| ------------------ | -------------------------- | ------------------------------- | --------------------------- |
| PostgreSQL         | pg_dump + WAL archival     | Continuous WAL, daily full dump | 30 days hot, 1 year archive |
| Enrollment codes   | Encrypted backup           | Daily                           | 90 days                     |
| Device registry    | Database backup (included) | With database                   | With database               |
| Audit trail        | Immutable storage (WORM)   | Continuous                      | 7 years (compliance)        |
| Application config | Version control (Git)      | On change                       | Indefinite                  |

## 5. Recovery Procedures

### Scenario: Single Application Server Failure

1. Load balancer detects health check failure (30 seconds)
2. Traffic routed to remaining servers (automatic)
3. Failed server restarted or replaced
4. **Expected downtime**: 0 (automatic failover)

### Scenario: Primary Database Failure

1. Monitoring detects primary failure (< 1 minute)
2. Promote synchronous standby to primary (< 5 minutes)
3. Application servers reconnect to new primary
4. **Expected downtime**: < 10 minutes
5. **Data loss**: 0 (synchronous replication)

### Scenario: Full Region Failure

1. DNS failover to secondary region (< 5 minutes)
2. Promote cross-region standby to primary (< 10 minutes)
3. Field devices reconnect via DNS
4. **Expected downtime**: < 30 minutes
5. **Data loss**: < 5 minutes of async replication lag

### Scenario: HQ Completely Unreachable (Extended)

1. Field devices continue operating offline (indefinite)
2. All screening data preserved in local ledger
3. Tamper-evident hash chain maintained locally
4. When HQ recovers, all pending sessions sync automatically
5. **Data loss**: 0 (offline-first architecture)

## 6. Current Gaps

> [!CAUTION]
> The following are NOT implemented in the current prototype:
>
> - Automated database backup
> - Streaming replication
> - Load balancer configuration
> - Cross-region failover
> - Monitoring and alerting
> - Runbook automation
>
> These are documented as the target architecture for production deployment.
