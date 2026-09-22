# VeriShield AI — API Gateway Contract

> Phase 4 Evidence Document
> Current state (SIH): no external API gateway deployed.
> Production target: full API gateway layer.

---

## Current SIH State (IMPLEMENTED — no gateway)

The SIH prototype exposes the FastAPI backend directly. Security controls that would normally be in an API gateway are implemented at the application layer:

| Control              | Location                 | Status          |
| -------------------- | ------------------------ | --------------- |
| Request size limits  | Middleware in `main.py`  | **IMPLEMENTED** |
| Rate limiting        | In-process, per-endpoint | **IMPLEMENTED** |
| Correlation IDs      | Middleware in `main.py`  | **IMPLEMENTED** |
| Security headers     | Middleware in `main.py`  | **IMPLEMENTED** |
| CORS                 | FastAPI CORSMiddleware   | **IMPLEMENTED** |
| ECDSA authentication | `sync.py`                | **IMPLEMENTED** |

---

## Production Target API Gateway Architecture (TARGET)

```
Client (field device / admin browser)
         │
         │ TLS 1.2+ (field devices)
         │ mTLS (target: enrolled devices with X.509 certificates)
         ▼
┌─────────────────────────────────────────────┐
│                    WAF                       │
│  OWASP rule sets, DDoS protection,          │
│  geo-blocking (if applicable),              │
│  bot mitigation                             │
│  STATUS: TARGET                             │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│               API Gateway                   │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Authentication                       │  │
│  │ - ECDSA JWT validation               │  │
│  │ - Admin: government IdP + MFA        │  │
│  │ STATUS: TARGET                       │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Authorization                        │  │
│  │ - Route-level RBAC                   │  │
│  │ - Field officer: /sync only          │  │
│  │ - Admin: /admin only                 │  │
│  │ STATUS: TARGET                       │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Rate Limiting (shared, distributed)  │  │
│  │ - Per device, per endpoint           │  │
│  │ - Redis-backed counters              │  │
│  │ STATUS: TARGET                       │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Routing                              │  │
│  │ - /sync/* → Sync API cluster         │  │
│  │ - /admin/* → Admin API (isolated)    │  │
│  │ - /health/* → direct (no auth)       │  │
│  │ STATUS: TARGET                       │  │
│  └──────────────────────────────────────┘  │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  Sync API Backend        Admin API Backend
```

---

## Specification

### TLS

| Property            | Current                                    | Target                                                 |
| ------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Transport           | HTTP (localhost dev) / HTTPS (recommended) | TLS 1.2 minimum, TLS 1.3 preferred                     |
| Certificate         | Self-signed / Let's Encrypt                | Government CA certificate                              |
| mTLS                | Not implemented                            | Required between gateway and backend (PLANNED)         |
| Device certificates | Not implemented                            | X.509 device certificates from government PKI (TARGET) |

### Rate Limits (Specification)

| Endpoint            | Current (Process-local) | Target (Gateway)                |
| ------------------- | ----------------------- | ------------------------------- |
| POST /sync/session  | 300 req/min per device  | 300 req/min per device (shared) |
| POST /device/enroll | 10 attempts/min         | 10 attempts/min                 |
| POST /admin/login   | 5 attempts/min          | 5 attempts/min                  |
| GET /health/live    | No limit                | No limit                        |
| GET /health/ready   | No limit                | No limit                        |

### Request Size Limits

| Endpoint               | Limit | Status          |
| ---------------------- | ----- | --------------- |
| POST /sync/session     | 1 MB  | **IMPLEMENTED** |
| POST /documents/upload | 12 MB | **IMPLEMENTED** |
| POST /device/enroll    | 64 KB | **IMPLEMENTED** |
| All other              | 2 MB  | **IMPLEMENTED** |

### Timeouts (TARGET)

| Timeout            | Recommended Value |
| ------------------ | ----------------- |
| Connection timeout | 5 seconds         |
| Read timeout       | 30 seconds        |
| Keep-alive         | 75 seconds        |
| Upstream request   | 10 seconds        |

### Security Headers (IMPLEMENTED in middleware)

| Header                    | Value                                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| X-Content-Type-Options    | nosniff                                                                        |
| X-Frame-Options           | DENY                                                                           |
| Referrer-Policy           | strict-origin-when-cross-origin                                                |
| Permissions-Policy        | camera=(), microphone=(), geolocation=(), payment=()                           |
| Content-Security-Policy   | default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none' |
| Strict-Transport-Security | max-age=31536000; includeSubDomains                                            |

### Allowed HTTP Methods

| Route Group       | Methods   |
| ----------------- | --------- |
| /sync/*           | POST only |
| /device/enroll    | POST only |
| /admin/*          | POST, GET |
| /documents/upload | POST      |
| /health/*         | GET only  |
| /                 | GET only  |

### Audit Headers

| Header                 | Direction     | Description                                             |
| ---------------------- | ------------- | ------------------------------------------------------- |
| X-Correlation-ID       | Bidirectional | Client-supplied or server-generated, echoed in response |
| X-Request-ID           | Response only | Unique per-request server ID                            |
| X-VeriShield-Device    | Request       | Device identifier for auth                              |
| X-VeriShield-Timestamp | Request       | Unix timestamp for freshness check                      |
| X-VeriShield-Nonce     | Request       | Replay prevention nonce                                 |
| X-VeriShield-Signature | Request       | ECDSA P-256 signature                                   |
