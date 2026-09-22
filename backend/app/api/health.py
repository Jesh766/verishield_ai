"""Health, liveness, readiness and capability reporting.

Endpoint contract:
  GET /health/live   → liveness probe (is the process alive?)
  GET /health/ready  → readiness probe (can this instance serve traffic?)
  GET /health        → legacy combined health (retained for backwards compat)
  GET /version       → safe build/version metadata
  GET /capabilities  → machine-readable component capability disclosure
"""

from __future__ import annotations

import platform
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from .. import config
from ..services import ocr

router = APIRouter(tags=["system"])

# Track startup time for readiness probe
_STARTUP_TIME = time.time()
_READY = False  # Set to True by the lifespan handler after init_db() completes


def mark_ready() -> None:
    """Called by the lifespan handler after successful startup."""
    global _READY
    _READY = True


def mark_not_ready() -> None:
    """Called during graceful shutdown to stop traffic."""
    global _READY
    _READY = False


# ---------------------------------------------------------------------------
# Liveness probe — answers: "Is this process alive?"
# Must be lightweight: no DB call, no OCR, no external network.
# Never make liveness depend on a database or external service.
# ---------------------------------------------------------------------------
@router.get("/health/live", tags=["system"])
def health_live():
    """Liveness probe.

    Returns 200 if the process is running. No database or external calls.
    Used by container orchestrators (Kubernetes livenessProbe etc.) to decide
    whether to restart this instance.
    """
    return {
        "status": "alive",
        "uptime_seconds": round(time.time() - _STARTUP_TIME, 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Readiness probe — answers: "Can this instance serve traffic?"
# Checks that startup completed (DB initialized). Kept lightweight.
# ---------------------------------------------------------------------------
@router.get("/health/ready", tags=["system"])
def health_ready():
    """Readiness probe.

    Returns 200 if the instance has completed startup and is ready to handle
    requests. Returns 503 during startup or graceful shutdown.

    Used by load balancers and orchestrators to decide whether to route traffic
    to this instance.
    """
    if not _READY:
        from fastapi import Response
        return Response(
            content='{"status":"starting","detail":"Service is initializing."}',
            status_code=503,
            media_type="application/json",
        )

    # Lightweight DB check — confirm database is reachable
    try:
        from ..models.db import SessionLocal
        with SessionLocal() as db:
            db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    if not db_ok:
        from fastapi import Response
        return Response(
            content='{"status":"unavailable","detail":"Database not reachable."}',
            status_code=503,
            media_type="application/json",
        )

    return {
        "status": "ready",
        "uptime_seconds": round(time.time() - _STARTUP_TIME, 1),
        "database": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Legacy health endpoint — retained for backwards compat
# ---------------------------------------------------------------------------
@router.get("/health", tags=["system"])
def health():
    """Legacy combined health endpoint (retained for backwards compatibility)."""
    info = ocr.engine_info()
    return {
        "status": "ok" if info.get("available") else "degraded",
        "ready": _READY,
        "mode": "field",
        "offline": True,
        "ocr": info,
        "liveness": "/health/live",
        "readiness": "/health/ready",
    }


# ---------------------------------------------------------------------------
# Safe version/build metadata endpoint
# Does NOT expose: secrets, filesystem paths, DB credentials, internal IPs
# ---------------------------------------------------------------------------
@router.get("/version", tags=["system"])
def version():
    """Safe build/version metadata.

    Returns application version and environment label. Never exposes secrets,
    filesystem paths, database credentials, or internal infrastructure details.
    """
    env_label = "development" if config.ADMIN_PASSCODE == "" else "configured"
    return {
        "service": "VeriShield AI",
        "version": "3.1.0",
        "phase": "SIH Prototype — Phase 3.1",
        "environment": env_label,
        "python": platform.python_version(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Machine-readable capability disclosure
# ---------------------------------------------------------------------------
@router.get("/capabilities", tags=["system"])
def capabilities():
    return {
        "phase": "SIH Prototype",
        "components": [
            {
                "name": "OCR text recognition",
                "status": "live",
                "kind": "learned model",
                "is_ai": True,
                "detail": "Tesseract 5.x LSTM recogniser, inference on-device.",
            },
            {
                "name": "Field extraction",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "Regex and positional heuristics over the OCR text.",
            },
            {
                "name": "Aadhaar Verhoeff checksum",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "UIDAI-spec Verhoeff arithmetic. Not AI.",
            },
            {
                "name": "Passport MRZ check digits",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "ICAO 9303 weighted 7-3-1 check digits. Not AI.",
            },
            {
                "name": "Driving licence validation",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "Format plus state-code whitelist only.",
            },
            {
                "name": "ECDSA device authentication",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "WebCrypto P-256 ECDSA non-exportable key pairs.",
            },
            {
                "name": "Tamper-evident audit chain",
                "status": "live",
                "kind": "deterministic",
                "is_ai": False,
                "detail": "SHA-256 hash chain. Not blockchain.",
            },
            {"name": "Face match", "status": "planned", "phase": "production", "is_ai": True},
            {"name": "Real ELA image tamper detection", "status": "planned", "phase": "production", "is_ai": False},
        ],
        "note": "Decision-support triage tool. The officer makes the final call.",
        "deployment_tier": "SIH Prototype (Tier A)",
    }
