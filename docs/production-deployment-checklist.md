# VeriShield AI — Production Deployment Checklist

> Phase 4 Evidence Document
> To be completed by the deployment team before any production or pilot go-live.
> Each item must be verified — a checkbox does not indicate completion unless signed off.

---

## Section 1: Security

### Secrets and Credentials

- [ ] `ADMIN_PASSCODE` configured via managed secret store (not hardcoded, not in `.env` committed to VCS)
- [ ] `ID_HASH_SALT` configured via managed secret store (minimum 32 random characters)
- [ ] No `.env` file with real credentials committed to repository
- [ ] Secret scan (`gitleaks`) run on repository with 0 findings
- [ ] Container image scanned for embedded secrets (Trivy) with 0 critical findings
- [ ] Private key fixtures (`*_priv.pem`) excluded from submission ZIP

### TLS / Network

- [ ] TLS certificate valid and not expired
- [ ] TLS version: 1.2 minimum, 1.3 preferred
- [ ] HSTS header configured in load balancer or gateway
- [ ] Admin API accessible only from authorized network range (not public internet)
- [ ] CORS origins restricted to known frontend origins only

### Device Registry

- [ ] All authorized devices registered in database with correct public keys
- [ ] No test/SIH devices (`DEV-OFFICER-01..05`) remain in production database
- [ ] Device status for all active devices: `active`
- [ ] Test/load-test officer records (`VS-0002..0005-LOAD-TEST-*`) removed from production DB

### Authentication

- [ ] Admin passcode is strong (minimum 32 characters, random)
- [ ] Admin token TTL reviewed and set appropriately (recommended: 3600 s)
- [ ] Rate limit on admin login verified: 5 attempts/min

### Container (if containerized)

- [ ] Container runs as non-root user (UID 1000)
- [ ] No secrets in Dockerfile or image layers
- [ ] `.dockerignore` verified — test fixtures and `.env` excluded
- [ ] Image tag recorded in deployment manifest

---

## Section 2: Database

- [ ] Database engine configured (SQLite for prototype; PostgreSQL for pilot+)
- [ ] Database migrations applied (`init_db()` or `alembic upgrade head`)
- [ ] Foreign keys enforced (SQLite: `PRAGMA foreign_keys=ON` via engine config)
- [ ] Unique constraints verified on: `device_id`, `badge_id`, `session_id`, `enrollment_code_hash`
- [ ] Initial audit chain verified: `GET /admin/audit/verify` → `VALID`
- [ ] Database backup verified (backup taken, restore tested)
- [ ] Database backup restore tested (not just taken — tested)
- [ ] Database accessible only from application server (not public internet)

---

## Section 3: Application

### Health and Readiness

- [ ] `GET /health/live` returns 200
- [ ] `GET /health/ready` returns 200 (not 503)
- [ ] Version endpoint correct: `GET /version`

### Build Verification

- [ ] `python -m pytest backend/tests/ -v` → 0 failures
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → success
- [ ] Build version recorded in deployment log

### Configuration

- [ ] `VERISHIELD_CORS` restricted to production frontend origin(s) only
- [ ] `LOG_LEVEL` set to `WARNING` or `ERROR` in production (not `DEBUG`)
- [ ] Upload TTL configured: 900 seconds (15 minutes)
- [ ] Config validation on startup passes with no `[CONFIG]` warnings

### Rollback

- [ ] Previous working build artifact available
- [ ] Rollback procedure documented and tested
- [ ] Database migration rollback plan documented (if schema change)

---

## Section 4: Operations

### Monitoring

- [ ] `/health/live` and `/health/ready` polled by health checker or load balancer
- [ ] Application log output routed to operational log store
- [ ] Alert configured: service down (liveness probe failure)
- [ ] Alert configured: readiness probe failure (DB not reachable)

### Incident Response

- [ ] Incident response contacts populated in `docs/incident-response.md`
- [ ] Runbook verified: device revocation procedure tested
- [ ] Runbook verified: audit chain verification procedure tested
- [ ] Incident owner assigned

### Capacity

- [ ] Worker count reviewed against expected load
- [ ] SQLite concurrency limitations reviewed against deployment scale
- [ ] Rate limit values reviewed for expected device count
- [ ] See `docs/capacity-model.md` for scaling guidance

---

## Section 5: Compliance and Audit (Production Only)

> These items are applicable for Ministry Pilot and Production deployments.
> They do not apply to the SIH prototype.

- [ ] Data classification reviewed: `docs/data-classification.md`
- [ ] Retention policy defined by competent authority
- [ ] Data protection review completed by appropriate authority
- [ ] Audit trail access restricted to authorized auditor role
- [ ] CERT-In security assessment (if required by deployment authority)
- [ ] UIDAI/MeitY approval (if applicable to deployment scope)

---

## Sign-Off Record (TEMPLATE)

| Role                    | Name | Date | Signature |
| ----------------------- | ---- | ---- | --------- |
| System Administrator    |      |      |           |
| Security Officer        |      |      |           |
| Data Protection Officer |      |      |           |
| Deployment Lead         |      |      |           |

> This template must be populated with actual personnel for any real deployment.
