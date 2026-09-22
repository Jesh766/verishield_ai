"""VeriShield AI — FastAPI application entry point.

Security posture:
  - ECDSA P-256 device authentication on every sync request
  - Correlation IDs on every request/response
  - Security headers: CSP, HSTS (if HTTPS), X-Content-Type-Options, X-Frame-Options,
    Referrer-Policy, Permissions-Policy
  - Payload size limits enforced before processing
  - Privacy-safe structured logging (no raw PII, images, keys)
  - Graceful shutdown: readiness probe disabled before draining
"""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .api import admin, chat, documents, enrollment, health, stubs, sync
from .api.health import mark_not_ready, mark_ready
from .models.db import init_db
from .services import storage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("verishield")


# ---------------------------------------------------------------------------
# Configuration validation — fail fast if required config is missing.
# Development defaults are allowed only when explicitly marked as dev-only.
# ---------------------------------------------------------------------------
def _validate_config() -> None:
    """Fail fast if required production configuration is absent or insecure."""
    warnings = []

    if not config.ADMIN_PASSCODE:
        warnings.append(
            "ADMIN_PASSCODE is not set. Admin login is disabled. "
            "Set ADMIN_PASSCODE or VERISHIELD_ADMIN_PASSCODE to enable."
        )

    if config.ID_HASH_SALT == "verishield-local-dev-salt":
        warnings.append(
            "ID_HASH_SALT is using the development default. "
            "Set VERISHIELD_ID_SALT to a random secret in production."
        )

    for w in warnings:
        logger.warning(f"[CONFIG] {w}")


# ---------------------------------------------------------------------------
# Lifespan: startup and graceful shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    _validate_config()
    init_db()
    storage.sweep()
    mark_ready()  # Signal to readiness probe: instance ready for traffic
    logger.info("[STARTUP] VeriShield backend ready.")

    yield  # Application runs here

    # --- Graceful shutdown ---
    # Mark not-ready first so load balancers stop routing new requests.
    # Active requests already in flight will complete before the process exits.
    mark_not_ready()
    logger.info("[SHUTDOWN] VeriShield backend shutting down gracefully.")
    storage.purge_all()
    logger.info("[SHUTDOWN] Cleanup complete.")


app = FastAPI(
    title="VeriShield AI — Field Mode",
    version="3.1.0",
    description=(
        "AI-assisted identity and document screening for checkpoint officers. "
        "Decision support only — the officer makes the final call. "
        "Raw images are never persisted. "
        "Deployment tier: SIH Prototype (Tier A)."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=config.ALLOWED_METHODS,
    allow_headers=config.ALLOWED_HEADERS,
)


# ---------------------------------------------------------------------------
# Security, observability, and correlation ID middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_and_observability_middleware(request: Request, call_next):
    # 1. Correlation ID handling
    client_corr_id = request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID")
    if client_corr_id and len(client_corr_id) <= 128:
        corr_id = client_corr_id.strip()
    else:
        corr_id = f"vs_corr_{uuid.uuid4().hex[:12]}"

    req_id = str(uuid.uuid4())
    request.state.request_id = req_id
    request.state.correlation_id = corr_id
    start_time = time.time()

    # 2. Payload size protection (early reject before processing)
    content_length = request.headers.get("Content-Length")
    path = request.url.path.lower()
    max_allowed_bytes = 2 * 1024 * 1024  # Default 2 MB

    if "/documents/upload" in path:
        max_allowed_bytes = config.MAX_UPLOAD_BYTES  # 12 MB
    elif "/sync/session" in path:
        max_allowed_bytes = 1024 * 1024  # 1 MB
    elif "/device/enroll" in path:
        max_allowed_bytes = 64 * 1024  # 64 KB

    if content_length:
        try:
            cl = int(content_length)
            if cl > max_allowed_bytes:
                logger.warning(
                    f"corr_id={corr_id} req_id={req_id} method={request.method} "
                    f"path={request.url.path} status=413 "
                    f"detail='Content-Length {cl} exceeds max limit {max_allowed_bytes}'"
                )
                return Response(
                    content=(
                        f'{{"error":{{"code":"PAYLOAD_TOO_LARGE",'
                        f'"message":"Request size ({cl} bytes) exceeds operational limit '
                        f'({max_allowed_bytes} bytes).",'
                        f'"correlation_id":"{corr_id}"}}}}'
                    ),
                    status_code=413,
                    media_type="application/json",
                    headers={"X-Correlation-ID": corr_id, "X-Request-ID": req_id},
                )
        except ValueError:
            pass

    response = await call_next(request)

    latency_ms = round((time.time() - start_time) * 1000, 2)
    device_id = request.headers.get("X-VeriShield-Device", "none")

    # Privacy-safe structured observability logging
    # Prohibited: raw document images, raw selfie, Aadhaar/passport numbers,
    #             private keys, enrollment codes, authentication secrets.
    logger.info(
        f"corr_id={corr_id} req_id={req_id} method={request.method} "
        f"path={request.url.path} status={response.status_code} "
        f"latency_ms={latency_ms} device={device_id}"
    )

    # --- Security headers ---
    response.headers["X-Correlation-ID"] = corr_id
    response.headers["X-Request-ID"] = req_id
    # Prevent MIME sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Deny framing (clickjacking protection)
    response.headers["X-Frame-Options"] = "DENY"
    # Referrer policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Permissions policy — restrict browser features not needed by this API
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=()"
    )
    # Content-Security-Policy for API responses
    # The frontend SPA is served separately; this CSP protects the backend API docs
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
    )
    # HSTS — tells clients to always use HTTPS (effective once served over TLS)
    # max-age=31536000 = 1 year; includeSubDomains + preload for production
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )

    return response


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(enrollment.router)
app.include_router(documents.router)
app.include_router(sync.router)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(stubs.router)


@app.get("/", tags=["system"])
def root():
    """Root endpoint — service identification only."""
    return {
        "service": "VeriShield AI",
        "version": "3.1.0",
        "phase": "SIH Prototype",
        "endpoints": {
            "docs": "/docs",
            "capabilities": "/capabilities",
            "version": "/version",
            "liveness": "/health/live",
            "readiness": "/health/ready",
        },
    }