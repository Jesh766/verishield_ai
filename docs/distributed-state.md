# VeriShield AI — Distributed State Audit

> Phase 4 Evidence Document
> Documents all process-local state and production migration path.

---

## Summary

The SIH prototype contains several items of process-local in-memory state. This is a known and documented prototype limitation. Each item below is analyzed for its production upgrade path.

---

## Complete Process-Local State Inventory

### 1. Admin Session Tokens

**Location:** [`backend/app/api/admin.py`](file:///backend/app/api/admin.py)

```python
_ACTIVE_TOKENS: dict[str, datetime]  # token → expiry
```

| Property        | Current (SIH)                                        | Production                            |
| --------------- | ---------------------------------------------------- | ------------------------------------- |
| Storage         | In-process dictionary                                | Shared session store (Redis/database) |
| Durability      | Lost on restart                                      | Persistent                            |
| Scale           | Per-worker (each worker has independent token state) | Cross-worker (shared)                 |
| TTL enforcement | Application-level check                              | Redis TTL or DB expiry                |

**When distributed state becomes necessary:** When 2+ backend workers are deployed. Without shared token state, a token issued by worker 1 will be invalid on worker 2.

---

### 2. Nonce Replay Cache

**Location:** [`backend/app/api/sync.py`](file:///backend/app/api/sync.py)

```python
_USED_NONCES: dict[str, datetime]  # nonce → first-seen timestamp
```

| Property    | Current (SIH)                                               | Production            |
| ----------- | ----------------------------------------------------------- | --------------------- |
| Storage     | In-process dictionary                                       | Redis with TTL expiry |
| Durability  | Lost on restart (replay window opens briefly)               | Durable               |
| Scale       | Per-worker (nonce seen by worker 1 not blocked by worker 2) | Cross-worker (shared) |
| TTL cleanup | In-process `_cleanup_old_nonces()`                          | Redis automatic TTL   |

**When distributed state becomes necessary:** Any multi-worker deployment. Without shared nonce cache, replay attacks can succeed by targeting different workers.

---

### 3. Sync Rate Limiter

**Location:** [`backend/app/api/sync.py`](file:///backend/app/api/sync.py)

```python
_SYNC_RATE_LIMIT_SLOTS: dict[str, list[float]]  # client_id → [timestamps]
```

| Property   | Current (SIH)                                            | Production                       |
| ---------- | -------------------------------------------------------- | -------------------------------- |
| Storage    | In-process dictionary                                    | Redis sliding window counter     |
| Durability | Lost on restart                                          | Durable across restarts          |
| Scale      | Per-worker (each worker allows full quota independently) | Cross-worker shared quota        |
| Algorithm  | Sliding window (in-process)                              | Redis sorted set or token bucket |

**When distributed state becomes necessary:** Any multi-worker deployment. With 4 workers, effective rate limit is 4× the configured value.

---

### 4. Device Registry Cache

**Location:** [`backend/app/api/sync.py`](file:///backend/app/api/sync.py)

```python
_REGISTERED_DEVICES: dict[str, dict]  # device_id → {public_key, checkpoint, ...}
```

| Property     | Current (SIH)                                     | Production                              |
| ------------ | ------------------------------------------------- | --------------------------------------- |
| Storage      | In-process dictionary (loaded from DB at startup) | DB query per-request (with cache layer) |
| Durability   | Lost on restart (re-loaded from DB)               | Authoritative DB                        |
| Scale        | Per-worker (each worker has own copy)             | Controlled refresh on admin changes     |
| Invalidation | None (manual restart needed after DB change)      | Event-driven or TTL-based               |

**Current behavior:** The registry is reloaded from the DB if a device_id is not found in cache (line 167 in sync.py). This provides eventual consistency but is not instantaneous.

**When distributed state becomes necessary:** When devices are enrolled/revoked frequently during operation and immediate propagation is required.

---

### 5. Audit Hash Chain Sequencing

**Location:** [`backend/app/models/db.py`](file:///backend/app/models/db.py)

```python
_AUDIT_LOCK = threading.Lock()  # Serializes audit event writes within a process
```

| Property           | Current (SIH)                             | Production                                    |
| ------------------ | ----------------------------------------- | --------------------------------------------- |
| Ordering guarantee | Per-process sequential via threading.Lock | Distributed: requires DB-level serialization  |
| Scale              | Single worker only                        | Needs DB-level sequence + advisory locks      |
| Correctness        | Correct for single-worker                 | Multi-worker could produce interleaved chains |

**When distributed state becomes necessary:** Any multi-worker deployment writes to the same audit table. The hash chain is only correct if writes are globally serialized — which requires a DB-level advisory lock or dedicated audit-writer service.

---

## State Migration Summary

| State            | Current                         | Pilot (PLANNED)           | Production (TARGET)                   |
| ---------------- | ------------------------------- | ------------------------- | ------------------------------------- |
| Admin tokens     | process-local dict              | Redis with TTL            | Government IAM short-lived tokens     |
| Nonces           | process-local dict              | Redis with TTL            | Redis cluster with persistence        |
| Rate limits      | process-local list              | Redis sliding window      | Redis cluster                         |
| Device registry  | process-local dict              | DB + controlled TTL cache | Authoritative DB + event invalidation |
| Audit sequencing | threading.Lock (single process) | DB advisory locks         | Dedicated audit writer service        |

---

## Production Redis Architecture (PLANNED)

```
Backend Worker 1 ─────┐
Backend Worker 2 ─────┤──► Redis Cluster (Primary + Replica)
Backend Worker 3 ─────┘         │
                                 ├── Nonces (SET with TTL)
                                 ├── Rate limit counters
                                 └── Admin session tokens

Redis Sentinel / Cluster mode for HA
Persistence: AOF + RDB for durability
```

> **Note:** Redis is not deployed in the current SIH prototype. Do not add Redis merely because this table exists. Add it when the first multi-worker deployment is required.
