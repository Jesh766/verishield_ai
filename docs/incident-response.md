# VeriShield AI — Incident Response Plan

> Phase 4 Evidence Document
> Covers: compromised device, stolen device, credential compromise,
> suspected data leakage, audit tampering, database corruption,
> service outage, synchronization backlog.

---

## General Principles

1. **Preserve evidence** before taking recovery actions where possible
2. **Revoke before you investigate** — a compromised device must be revoked immediately
3. **Do not overwrite audit logs** — tamper-evident chain is evidentiary
4. **Use correlation IDs** to trace specific requests across logs
5. **Notify** the appropriate authority per the deployment's incident notification policy

---

## IR-01: Compromised Device

**Trigger:** Suspected unauthorized access from a registered field device (anomalous sync patterns, officer reports device missing, signature from unexpected IP, unexpected checkpoint).

```
DETECT
  └─ Monitor for: unusual sync volume, unexpected checkpoint, off-hours activity
     Correlation IDs link suspicious requests to specific device sessions

CONTAIN
  └─ Immediately revoke device via Admin API:
       POST /admin/device/{device_id}/status  { "status": "revoked" }
     Effect: all future sync attempts from this device → 403

INVESTIGATE
  └─ Query audit_log for all events from device:
       SELECT * FROM audit_log WHERE actor = 'DEV-OFFICER-01' ORDER BY id;
     Verify audit hash chain integrity:
       GET /admin/audit/verify
     Preserve DB snapshot before any changes

PRESERVE EVIDENCE
  └─ Export audit_log rows for the device
     Note correlation IDs of suspicious requests
     Preserve backend logs for the time window

RECOVER
  └─ Issue new enrollment code to officer (if device was legitimate)
     Re-enroll replacement device via controlled enrollment flow
     Generate new ECDSA key pair on new device (proof-of-possession)
```

**Roles:**

- Admin: revoke device
- Auditor: verify audit chain, preserve evidence
- Supervisor: notify incident owner

---

## IR-02: Stolen or Lost Device

**Trigger:** Officer reports device missing.

```
IMMEDIATE ACTION (< 5 minutes)
  └─ Revoke device:
       POST /admin/device/{device_id}/status  { "status": "revoked" }
     Notify checkpoint supervisor

INVESTIGATION
  └─ Determine last sync timestamp:
       SELECT MAX(received_at) FROM verification_sessions WHERE checkpoint_id = 'CP-01';
     Determine if any syncs occurred after reported loss time
     Check audit_log for post-loss activity

RECOVERY
  └─ Issue new enrollment code to officer
     Re-enroll on new device
```

**Key property:** ECDSA private key is non-exportable from IndexedDB — attacker cannot extract the key directly. However, attacker may be able to use the browser's saved state if the device is unlocked.

---

## IR-03: Admin Credential Compromise

**Trigger:** Unauthorized admin access detected, or passcode suspected stolen.

```
CONTAIN
  └─ Restart backend process (invalidates all process-local admin JWT tokens)
     Change ADMIN_PASSCODE environment variable immediately
     Redeploy with new credential

INVESTIGATE
  └─ Review audit_log for admin actions taken with compromised credential:
       SELECT * FROM audit_log WHERE action LIKE 'ADMIN_%' ORDER BY id DESC LIMIT 100;
     Check: device enrollments, revocations, status changes during window

RECOVER
  └─ Review and if needed reverse unauthorized admin actions (device enrollments etc.)
     Consider re-keying all devices if admin could have exported public keys (public keys are not secret)
     Document timeline for incident report
```

---

## IR-04: Suspected Data Leakage

**Trigger:** Concern that raw document images, identity numbers, or biometric data was exposed.

```
ASSESS
  └─ VeriShield architecture: raw images are NEVER persisted (15-min upload TTL)
     Verify: check for any unexpected files in upload directory
     Check: review logs for any path that returns raw image data
     Check: database — only masked fields and risk scores are stored

IF IMAGE FILES FOUND IN UNEXPECTED LOCATION
  └─ Quarantine directory
     Do not delete (evidence)
     Notify data protection officer per applicable policy
     Trace via correlation IDs to identify which request created them
```

**Design note:** By architecture, VeriShield stores only:

- Masked identity fields (last 4 digits of document numbers)
- Risk scores and verdicts
- Officer decisions
- Audit events

Raw images, full document numbers, and biometrics are not persisted.

---

## IR-05: Audit Trail Tampering Detection

**Trigger:** `verify_audit_chain()` returns `INVALID`, or suspicious gap in audit log IDs.

```
DO NOT OVERWRITE THE DATABASE
  └─ Take a backup/snapshot immediately

VERIFY
  └─ GET /admin/audit/verify
     Note the failed_at_id and detail message
     Determine: which audit event was modified or deleted

PRESERVE
  └─ Export the entire audit_log table with event hashes
     Preserve a copy of the current DB file

INVESTIGATE
  └─ Use audit event timestamps to cross-reference application logs
     Identify: who had DB write access during the tamper window
     Use correlation IDs to trace related requests

REPORT
  └─ Document for incident report and appropriate authority notification
```

---

## IR-06: Database Corruption

**Trigger:** SQLite integrity check fails, DB file corrupted.

```
STOP TAKING NEW REQUESTS
  └─ If in production: use readiness probe to stop routing traffic

ASSESS
  └─ sqlite3 verishield.db "PRAGMA integrity_check;"

RESTORE
  └─ Restore from last known-good backup
     For prototype: manual file restore
     For pilot: restore from automated snapshot + PITR

VERIFY AFTER RESTORE
  └─ python -m pytest backend/tests/ -v
     GET /admin/audit/verify
     GET /health/ready
```

---

## IR-07: Service Outage

**Trigger:** `/health/ready` returns 503 or backend is unreachable.

```
IMMEDIATE DIAGNOSIS
  └─ Check /health/live — if 200: process alive but DB not ready
     Check /health/ready — if 503: DB not reachable
     Check logs for startup errors

FIELD IMPACT
  └─ Field devices continue operating offline (offline-first design)
     Sync backlog accumulates in IndexedDB on field devices
     When service recovers, devices auto-retry sync

SERVICE RECOVERY
  └─ Restart backend if crashed
     Verify DB is accessible
     Monitor /health/ready until 200
     Field devices will auto-drain backlog on reconnection
```

---

## IR-08: Synchronization Backlog

**Trigger:** Field devices report sync failures; sessions accumulate in local IndexedDB.

```
ASSESS
  └─ Check: GET /health/ready — is backend available?
     Check: network connectivity field → HQ
     Check: device rate limiting (429 responses)

DRAIN
  └─ When connectivity restored, devices auto-retry queued sessions
     The sync endpoint is idempotent — duplicate syncs are safe (returns existing record)
     Rate limiting (429) is per-minute: backlog drains at ~300 req/min/device

MONITOR DRAIN
  └─ During backlog clearance burst test: 28.7 sessions/sec (100 sessions in 3.49 sec)
     This is measured performance — sufficient for typical offline backlog scenarios

IF SESSIONS LOST ON DEVICE (device failure)
  └─ Sessions stored in IndexedDB may be lost if device is wiped/replaced
     Recovery: officer re-enters decision for lost sessions if available
     Audit note: gap recorded in audit log
```

---

## Contact and Escalation (TEMPLATE)

| Role                    | Responsibility                 | Contact                           |
| ----------------------- | ------------------------------ | --------------------------------- |
| Incident Owner          | Overall IR coordination        | `<to be assigned per deployment>` |
| System Admin            | Device revocation, backend ops | `<to be assigned>`                |
| Data Protection Officer | PII incidents                  | `<to be assigned>`                |
| Checkpoint Supervisor   | Field officer coordination     | `<per checkpoint>`                |
| Security Auditor        | Audit trail preservation       | `<to be assigned>`                |

> Production deployment must populate this table with actual contacts before go-live.
