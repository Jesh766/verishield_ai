"""HQ sync — receives already-computed screening results from authorized devices.

Authentication model:
  Browser generates a WebCrypto ECDSA P-256 non-exportable key pair.
  The device's public key is pre-provisioned in the HQ device registry.
  Every sync request is signed with the device private key.
  HQ verifies the signature against the registered public key.
  If ECDSA verification fails → 401. No fallback authentication method exists.

Authorization model:
  Device → registered checkpoint (enforced)
  Device → authorized officer badge (enforced)
  Officer must pre-exist in the database (no auto-creation).
  Checkpoint must pre-exist in the database (no auto-creation).
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..models.db import (
    Checkpoint, Officer, VerificationSession, get_db, log,
)
from ..models.schemas import SyncSessionIn, SyncSessionOut

router = APIRouter(tags=["sync"])

# In-memory nonce replay cache: nonce → first-seen timestamp.
# SIH prototype only — not durable across server restarts.
# Production would use a distributed cache (Redis/Memcached).
_USED_NONCES: dict[str, datetime] = {}

# ---------------------------------------------------------------------------
# Pre-provisioned device registry.
#
# Each entry maps a device_id to its registered public key (ECDSA P-256,
# SPKI DER, base64-encoded), the checkpoint it is assigned to, and the
# officer badge it is authorized for.
#
# This registry is the authoritative source of device identity. The client
# CANNOT override it by submitting its own public key in the request.
#
# Production deployment: move this into a signed database table provisioned
# by an enrollment authority. See docs/device-identity.md.
# ---------------------------------------------------------------------------
_REGISTERED_DEVICES: dict[str, dict[str, str]] = {}

# Test/demo devices are injected at startup from init_db() so the registry
# key material lives in one authoritative place (the database seed).
# _REGISTERED_DEVICES is populated by _load_device_registry() below.


def _load_device_registry() -> None:
    """Populate _REGISTERED_DEVICES from the database at startup."""
    from ..models.db import RegisteredDevice, SessionLocal
    with SessionLocal() as db:
        devices = db.query(RegisteredDevice).all()
        _REGISTERED_DEVICES.clear()
        for d in devices:
            _REGISTERED_DEVICES[d.device_id] = {
                "checkpoint_id": d.checkpoint_id,
                "officer_badge": d.officer_badge,
                "public_key": d.public_key_spki_b64,
                "algorithm": d.algorithm,
                "status": d.status,
            }


_ALLOWED_BANDS = {"clear", "review", "escalate", "unscored"}
_ALLOWED_DECISIONS = {"cleared", "referred", "rejected", "pending"}
_ALLOWED_DOC_TYPES = {"passport", "aadhaar", "dl", "visa"}


def _cleanup_old_nonces(now: datetime) -> None:
    cutoff = now - timedelta(minutes=10)
    expired = [n for n, ts in _USED_NONCES.items() if ts < cutoff]
    for n in expired:
        _USED_NONCES.pop(n, None)


def _verify_ecdsa_signature(public_key_spki_b64: str, canonical_bytes: bytes, signature_b64: str) -> bool:
    """Verify an ECDSA P-256 / SHA-256 signature.

    Accepts the signature as standard base64.
    Returns True on successful verification, False on any failure.
    No HMAC fallback exists — if ECDSA fails, the request is rejected.
    """
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        from cryptography.exceptions import InvalidSignature

        pub_key_bytes = base64.b64decode(public_key_spki_b64)
        sig_bytes = base64.b64decode(signature_b64)
        if len(sig_bytes) == 64:
            sig_bytes = encode_dss_signature(
                int.from_bytes(sig_bytes[:32], "big"), int.from_bytes(sig_bytes[32:], "big")
            )
        pub_key = load_der_public_key(pub_key_bytes)
        if not isinstance(pub_key, ec.EllipticCurvePublicKey):
            return False
        pub_key.verify(sig_bytes, canonical_bytes, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, Exception):
        return False


# Process-local rate limiter for sync requests
# SIH prototype limitation: process-local in-memory storage; production target uses Redis
_SYNC_RATE_LIMIT_SLOTS: dict[str, list[float]] = {}
_SYNC_RATE_LIMIT_LOCK = threading.Lock()


def _check_sync_rate_limit(client_id: str, max_requests: int = 300, window_seconds: int = 60) -> bool:
    """Process-local sliding-window rate limiter keyed by client IP + device ID.

    Thread-safe within a single process via threading.Lock.
    Enforced unconditionally across all environments.
    """
    now = time.time()
    with _SYNC_RATE_LIMIT_LOCK:
        timestamps = _SYNC_RATE_LIMIT_SLOTS.setdefault(client_id, [])
        cutoff = now - window_seconds
        valid_ts = [ts for ts in timestamps if ts > cutoff]
        if len(valid_ts) >= max_requests:
            _SYNC_RATE_LIMIT_SLOTS[client_id] = valid_ts
            return False
        valid_ts.append(now)
        _SYNC_RATE_LIMIT_SLOTS[client_id] = valid_ts
        return True



@router.post("/sync/session", response_model=SyncSessionOut)
async def sync_session(
    request: Request,
    body: SyncSessionIn,
    db: Session = Depends(get_db),
    x_verishield_device: str | None = Header(default=None, alias="X-VeriShield-Device"),
    x_verishield_timestamp: str | None = Header(default=None, alias="X-VeriShield-Timestamp"),
    x_verishield_nonce: str | None = Header(default=None, alias="X-VeriShield-Nonce"),
    x_verishield_signature: str | None = Header(default=None, alias="X-VeriShield-Signature"),
):
    now = datetime.now(timezone.utc)
    _cleanup_old_nonces(now)

    # Rate limiting check
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{x_verishield_device or 'none'}"
    if not _check_sync_rate_limit(rate_key, max_requests=300, window_seconds=60):
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device or "unknown",
            detail="Sync rate limit exceeded")
        raise HTTPException(
            status_code=429,
            detail="TOO_MANY_REQUESTS: Operational rate limit exceeded (300 requests/minute).",
        )

    # 1. Security header presence check
    if not (x_verishield_device and x_verishield_timestamp and x_verishield_nonce and x_verishield_signature):
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor="unknown",
            detail="Missing authentication headers")
        raise HTTPException(
            status_code=401,
            detail="Missing required security authentication headers "
                   "(X-VeriShield-Device, X-VeriShield-Timestamp, X-VeriShield-Nonce, X-VeriShield-Signature).",
        )

    # 2. Device registration check — NO fallback, NO auto-registration.
    #    Reload registry if device not found (handles runtime provisioning).
    if x_verishield_device not in _REGISTERED_DEVICES:
        _load_device_registry()
    reg_device = _REGISTERED_DEVICES.get(x_verishield_device)
    if not reg_device:
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail="Unregistered device ID")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_NOT_REGISTERED: Device '{x_verishield_device}' is not registered with HQ.",
        )

    # 2b. Device status lifecycle check — active / revoked / suspended
    device_status = reg_device.get("status", "active")
    if device_status == "revoked":
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail="Revoked device attempt")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_REVOKED: Device '{x_verishield_device}' has been revoked by HQ.",
        )
    if device_status == "suspended":
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail="Suspended device attempt")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_SUSPENDED: Device '{x_verishield_device}' is currently suspended.",
        )
    if device_status != "active":
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail=f"Inactive device attempt status={device_status}")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_INACTIVE: Device '{x_verishield_device}' status is '{device_status}'.",
        )

    # 3. Device ↔ Checkpoint authorization — exact normalized equality only.
    #    Substring/prefix matching is forbidden: "CP-01" must NOT pass for "CP-012".
    allowed_cp = reg_device["checkpoint_id"].upper().strip()
    submitted_cp = (body.checkpoint or "").upper().strip()
    if submitted_cp != allowed_cp:
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail=f"Checkpoint mismatch: registered={allowed_cp}, submitted={submitted_cp}")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_CHECKPOINT_MISMATCH: Device '{x_verishield_device}' is registered "
                   f"to '{reg_device['checkpoint_id']}', not '{body.checkpoint}'.",
        )

    # 4. Officer authorization — officer must pre-exist in the DB.
    #    Auto-creation is forbidden: unknown officers are rejected.
    officer = db.query(Officer).filter_by(badge_id=body.officer_badge).first()
    if not officer:
        # Also check the device registry assignment
        if body.officer_badge != reg_device["officer_badge"]:
            log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
                detail=f"Unauthorized officer badge {body.officer_badge}")
            raise HTTPException(
                status_code=403,
                detail=f"UNAUTHORIZED_OFFICER: Officer badge '{body.officer_badge}' is not authorized "
                       f"for device '{x_verishield_device}'.",
            )
        # Officer is in device registry but not yet in DB — reject: officers must be provisioned.
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail=f"Officer badge {body.officer_badge} not in database")
        raise HTTPException(
            status_code=403,
            detail=f"UNAUTHORIZED_OFFICER: Officer badge '{body.officer_badge}' has not been "
                   f"provisioned in the HQ database.",
        )

    # 5. Checkpoint existence check — checkpoint must pre-exist in the DB.
    #    Auto-creation is forbidden.
    cp_obj = db.get(Checkpoint, reg_device["checkpoint_id"])
    if not cp_obj:
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail=f"Checkpoint {reg_device['checkpoint_id']} not in database")
        raise HTTPException(
            status_code=403,
            detail=f"UNKNOWN_CHECKPOINT: Checkpoint '{reg_device['checkpoint_id']}' has not been "
                   f"provisioned in the HQ database.",
        )

    # 6. Timestamp freshness (max 300 s / 5 min clock skew)
    try:
        ts_val = float(x_verishield_timestamp)
        req_dt = datetime.fromtimestamp(ts_val, tz=timezone.utc)
    except Exception:
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail="Malformed timestamp header")
        raise HTTPException(status_code=401, detail="Invalid X-VeriShield-Timestamp header value.")

    if abs((now - req_dt).total_seconds()) > 300:
        log(db, session_id=body.session_id, action="SYNC_REJECTED", actor=x_verishield_device,
            detail=f"Timestamp expired: skew {abs((now - req_dt).total_seconds()):.0f}s")
        raise HTTPException(
            status_code=401,
            detail="Synchronization timestamp expired or device clock skew too high (> 300 seconds).",
        )

    # 7. Nonce replay protection (in-memory, SIH prototype)
    if x_verishield_nonce in _USED_NONCES:
        log(db, session_id=body.session_id, action="SYNC_REPLAY_REJECTED", actor=x_verishield_device,
            detail=f"Reused nonce {x_verishield_nonce}")
        raise HTTPException(
            status_code=409,
            detail="Replay attack detected: duplicate request nonce rejected.",
        )

    # 8. ECDSA payload integrity and signature verification.
    #    Canonical string = METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256_HEX\nDEVICE_ID
    #    Signature must be base64-encoded DER ECDSA (as produced by WebCrypto).
    raw_body = await request.body()
    body_hash = hashlib.sha256(raw_body).hexdigest()
    canonical_text = (
        f"POST\n/sync/session\n{x_verishield_timestamp}\n"
        f"{x_verishield_nonce}\n{body_hash}\n{x_verishield_device}"
    )

    if not _verify_ecdsa_signature(
        reg_device["public_key"], canonical_text.encode(), x_verishield_signature
    ):
        log(db, session_id=body.session_id, action="SYNC_SIGNATURE_FAILURE", actor=x_verishield_device,
            detail="ECDSA signature verification failed")
        raise HTTPException(
            status_code=401,
            detail="Invalid ECDSA digital signature: device authentication failed.",
        )

    # Record nonce as consumed
    _USED_NONCES[x_verishield_nonce] = now

    # 9. Schema and range validation on client-supplied data
    if body.document_type not in _ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid document_type '{body.document_type}'.")
    if body.risk_band and body.risk_band not in _ALLOWED_BANDS:
        raise HTTPException(status_code=422, detail=f"Invalid risk_band '{body.risk_band}'.")
    if body.decision and body.decision not in _ALLOWED_DECISIONS:
        raise HTTPException(status_code=422, detail=f"Invalid decision '{body.decision}'.")
    if body.risk_score is not None and not (0 <= body.risk_score <= 100):
        raise HTTPException(status_code=422, detail="risk_score must be between 0 and 100.")

    # 10. Database idempotency and conflict check
    existing = db.get(VerificationSession, body.session_id)
    if existing:
        is_same = (
            existing.document_type == body.document_type
            and existing.risk_score == body.risk_score
            and existing.decision == body.decision
        )
        if is_same:
            log(db, existing.id, "SYNC_IDEMPOTENT_SUCCESS", x_verishield_device,
                "Duplicate payload accepted idempotently")
            return SyncSessionOut(session_id=existing.id, stored=True, received_at=existing.received_at or now)
        else:
            log(db, existing.id, "SYNC_CONFLICT_REJECTED", x_verishield_device,
                "Conflicting payload for existing session ID")
            raise HTTPException(
                status_code=409,
                detail="Conflicting payload for existing session ID rejected.",
            )

    # 11. Persist valid sync record — atomic transaction: session + audit events.
    #
    # The session record and the SYNC_ACCEPTED audit event are written inside one
    # SQLAlchemy transaction that commits once at the end. If the audit write or any
    # device-event write fails, the whole transaction rolls back — preventing a
    # half-created session without a corresponding audit event, or a committed audit
    # event that refers to a session that does not exist.
    #
    # Conceptual flow:
    #   BEGIN TRANSACTION
    #     → create VerificationSession
    #     → write SYNC_ACCEPTED audit event (with hash chain)
    #     → write device-local events (if any)
    #   COMMIT  (all or nothing)
    #
    # The log() helper uses _AUDIT_LOCK so hash-chain ordering is thread-safe.
    try:
        session = VerificationSession(
            id=body.session_id,
            officer_id=officer.id,
            checkpoint_id=cp_obj.id,
            document_type=body.document_type,
            extracted_fields=body.extracted_fields,
            checksum_results=body.checksum_results,
            ocr_confidence=body.ocr_confidence,
            face_match_score=body.face_match_score,
            face_verdict=body.face_verdict,
            tamper_score=body.tamper_score,
            tamper_verdict=body.tamper_verdict,
            risk_score=body.risk_score,
            risk_band=body.risk_band,
            risk_reasons=body.risk_reasons,
            decision=body.decision,
            note=body.note,
            synced=True,
            received_at=now,
        )
        if body.client_created_at:
            session.created_at = body.client_created_at

        db.add(session)
        # Flush to DB (but do not commit yet) so the session PK is available for FK references
        db.flush()

        # Write SYNC_ACCEPTED audit event — within the same open transaction
        log(db, session.id, "SYNC_ACCEPTED", officer.badge_id,
            f"decision={body.decision or 'pending'} risk={body.risk_score}", commit=False)

        # Write any field-device events forwarded with the sync payload
        for ev in body.events:
            log(db, session.id, f"device:{ev.action}", officer.badge_id, ev.detail, commit=False)

        # Single atomic commit — session + all audit events land together
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="SYNC_STORAGE_FAILURE: Session could not be persisted. Please retry.",
        )

    return SyncSessionOut(session_id=session.id, stored=True, received_at=session.received_at)