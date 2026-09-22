# VeriShield AI — Database Migration Architecture

> Phase 4 Evidence Document
> All values labeled: **CURRENT** | **PLANNED** | **TARGET**

---

## Current State (SIH Prototype)

**CURRENT — IMPLEMENTED**

| Property           | Value                                      |
| ------------------ | ------------------------------------------ |
| Engine             | SQLite 3.x (via SQLAlchemy)                |
| Location           | `backend/verishield.db` (local file)       |
| Concurrency        | Single-writer (SQLite WAL mode)            |
| Connection pooling | None (single-process, single-file)         |
| Backup             | Manual file copy only                      |
| Replication        | None                                       |
| Migration tooling  | Inline PRAGMA + ALTER TABLE in `init_db()` |

**Known SQLite limitations for production (CURRENT):**

- Single writer → high concurrency latency (measured: 811 ms median at 50 concurrent)
- No horizontal scaling
- No streaming replication
- File-system backup only (not crash-consistent at scale)
- No row-level locking

---

## Schema Compatibility Analysis

The current SQLAlchemy models are written to be largely PostgreSQL-compatible:

| SQLAlchemy Feature                              | SQLite               | PostgreSQL        | Notes                                   |
| ----------------------------------------------- | -------------------- | ----------------- | --------------------------------------- |
| `String`, `Text`, `Integer`, `Float`, `Boolean` | ✅                   | ✅                | Fully compatible                        |
| `JSON` column type                              | ✅ (stores as text)  | ✅ (native JSONB) | Switch to `JSONB` for performance       |
| `DateTime`                                      | ✅                   | ✅                | Ensure UTC timezone handling consistent |
| `ForeignKey`                                    | ✅ (pragma required) | ✅                | No change needed                        |
| `autoincrement=True` (Integer PK)               | ✅                   | ✅                | `SERIAL` in PostgreSQL                  |
| `primary_key=True` (String UUID)                | ✅                   | ✅                | No change                               |
| `unique=True` constraints                       | ✅                   | ✅                | Enforced at DB level                    |
| `index=True`                                    | ✅                   | ✅                | No change                               |
| `check_same_thread=False`                       | SQLite-specific      | Not needed        | Remove from PostgreSQL config           |

### Changes Required for PostgreSQL

1. **`DATABASE_URL`**: Change `sqlite:///...` to `postgresql+psycopg2://...`
2. **`connect_args`**: Remove `{"check_same_thread": False}` (SQLite-only)
3. **JSON columns**: Optionally switch to `JSONB` for query performance
4. **`init_db()` migrations**: Replace `PRAGMA table_info` with proper Alembic migrations
5. **Connection pooling**: Add SQLAlchemy pool settings (pool_size, max_overflow, pool_timeout)

---

## Migration Path

### Stage 1 — SIH Prototype (CURRENT)

```
SQLite
Single file
init_db() creates tables + seeds data
Inline PRAGMA-based migrations
```

### Stage 2 — Ministry Pilot (PLANNED)

```
Managed PostgreSQL (e.g. AWS RDS, GCP Cloud SQL, or equivalent)
  ↓
Alembic migration framework
  ↓
Automated schema versioning
  ↓
Connection pooling (PgBouncer or SQLAlchemy pool)
  ↓
Automated backups (daily snapshot + PITR)
  ↓
Read replica (reporting + admin queries)
```

**Migration approach:**

1. Install Alembic: `pip install alembic`
2. `alembic init alembic` → generates `alembic.ini` and `alembic/env.py`
3. `alembic revision --autogenerate -m "initial"` → generates schema from SQLAlchemy models
4. `alembic upgrade head` → applies to PostgreSQL
5. Seed data via separate seeding script (not in migration)

### Stage 3 — Production Target (TARGET)

```
HA PostgreSQL
  Primary (write)
       ↓ streaming replication
  Replica (read)
       ↓
  Backup: automated WAL archiving + daily snapshots
       ↓
  DR site: standby with tested restore
       ↓
  Connection pooling: PgBouncer cluster
       ↓
  Monitoring: pg_stat_statements + slow query alerts
```

---

## Database Security Invariants

The following constraints exist at the database layer (not just application layer):

| Constraint                               | Location                | Status                                       |
| ---------------------------------------- | ----------------------- | -------------------------------------------- |
| `device_id` PRIMARY KEY (unique)         | `registered_devices`    | **CURRENT**                                  |
| `badge_id` UNIQUE on Officer             | `officers`              | **CURRENT**                                  |
| `session_id` PRIMARY KEY (unique)        | `verification_sessions` | **CURRENT**                                  |
| `enrollment_code_hash` UNIQUE            | `device_enrollments`    | **CURRENT**                                  |
| `audit_log.id` PRIMARY KEY autoincrement | `audit_log`             | **CURRENT**                                  |
| Foreign keys enforced                    | All tables              | **CURRENT** (SQLite: PRAGMA foreign_keys=ON) |

**Note on SQLite foreign key enforcement:** SQLite requires `PRAGMA foreign_keys = ON` per connection. This is set via SQLAlchemy's `connect_args`. For PostgreSQL, foreign keys are enforced by default.

---

## Backup Strategy

| Tier           | Backup Method                                                        | RPO             | RTO            | Status      |
| -------------- | -------------------------------------------------------------------- | --------------- | -------------- | ----------- |
| SIH Prototype  | Manual file copy of `verishield.db`                                  | N/A (prototype) | Manual restore | **CURRENT** |
| Ministry Pilot | Automated PostgreSQL snapshots + WAL                                 | < 5 min         | < 30 min       | **PLANNED** |
| Production     | Continuous WAL archiving + cross-zone replicas + immutable snapshots | < 1 min         | < 15 min       | **TARGET**  |

> RPO/RTO for Ministry Pilot and Production are documented as **targets only**. They have not been measured or tested in this environment.
