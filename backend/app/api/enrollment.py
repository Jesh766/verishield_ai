"""Device enrollment API — controlled one-time binding of browser-generated ECDSA public keys.

Authentication & Provisioning Model:
  1. Administrator generates a one-time enrollment code tied to a device_id, checkpoint_id, and officer_badge.
  2. Field browser generates a non-exportable ECDSA P-256 key pair locally.
  3. Browser calls POST /device/enroll submitting its public key and a proof-of-possession signature.
  4. Server verifies proof-of-possession, validates enrollment code & assignment, and stores public key.
  5. Enrollment code is marked as used (one-time consume).
  6. Subsequent sync requests use the registered public key to verify device signatures.
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.db import (
    DeviceEnrollment, RegisteredDevice, get_db, hash_enrollment_code, log, utcnow,
)
from ..models.schemas import DeviceEnrollIn, DeviceEnrollOut

router = APIRouter(prefix="/device", tags=["device"])

# Sliding window rate limiter for enrollment code brute-force protection: client_ip -> list of attempt timestamps
_FAILED_ENROLLMENT_ATTEMPTS: dict[str, list[datetime]] = {}


def _check_enrollment_rate_limit(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    attempts = [t for t in _FAILED_ENROLLMENT_ATTEMPTS.get(client_ip, []) if t > cutoff]
    _FAILED_ENROLLMENT_ATTEMPTS[client_ip] = attempts
    if len(attempts) >= 15:
        raise HTTPException(
            status_code=429,
            detail="TOO_MANY_FAILED_ENROLLMENTS: Operational rate limit exceeded (15 failed attempts per 15 minutes).",
        )


def _record_failed_enrollment(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    attempts = _FAILED_ENROLLMENT_ATTEMPTS.get(client_ip, [])
    attempts.append(now)
    _FAILED_ENROLLMENT_ATTEMPTS[client_ip] = attempts


def _verify_proof_of_possession(public_key_spki_b64: str, canonical_bytes: bytes, signature_b64: str) -> bool:
    """Verify proof-of-possession ECDSA signature over canonical challenge text."""
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
        from cryptography.exceptions import InvalidSignature

        pub_key_bytes = base64.b64decode(public_key_spki_b64.strip())
        sig_bytes = base64.b64decode(signature_b64.strip())
        if len(sig_bytes) == 64:
            sig_bytes = encode_dss_signature(
                int.from_bytes(sig_bytes[:32], "big"), int.from_bytes(sig_bytes[32:], "big")
            )
        pub_key = load_der_public_key(pub_key_bytes)
        if not isinstance(pub_key, ec.EllipticCurvePublicKey) or not isinstance(pub_key.curve, ec.SECP256R1):
            return False
        pub_key.verify(sig_bytes, canonical_bytes, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, Exception):
        return False


@router.post("/enroll", response_model=DeviceEnrollOut)
@router.post("/api/device/enroll", response_model=DeviceEnrollOut)
async def enroll_device(
    body: DeviceEnrollIn,
    request: Request = None,
    db: Session = Depends(get_db),
):
    client_ip = (request.client.host if request and request.client else "unknown")
    _check_enrollment_rate_limit(client_ip)
    now = utcnow()

    # 1. Validate requested algorithm
    if body.algorithm != "ECDSA-P256-SHA256":
        raise HTTPException(
            status_code=422,
            detail=f"INVALID_ALGORITHM: Unsupported algorithm '{body.algorithm}'. Only 'ECDSA-P256-SHA256' is supported.",
        )

    # 2. Hash and lookup enrollment code
    code_hash = hash_enrollment_code(body.enrollment_code)
    enrollment = db.query(DeviceEnrollment).filter_by(enrollment_code_hash=code_hash).first()

    if not enrollment:
        _record_failed_enrollment(client_ip)
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail="Invalid enrollment code submitted")
        raise HTTPException(
            status_code=403,
            detail="INVALID_ENROLLMENT_CODE: The enrollment code provided is invalid.",
        )

    # 3. Check if enrollment code has already been used
    if enrollment.status == "used" or enrollment.used_at is not None:
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail="Reused enrollment code attempt")
        raise HTTPException(
            status_code=409,
            detail="ENROLLMENT_CODE_ALREADY_USED: This enrollment code has already been consumed.",
        )

    # 4. Check if enrollment code has expired
    #    Make sure enrollment.expires_at is timezone-aware if needed
    exp_at = enrollment.expires_at
    if exp_at.tzinfo is None:
        exp_at = exp_at.replace(tzinfo=timezone.utc)
    if exp_at < now:
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail="Expired enrollment code attempt")
        raise HTTPException(
            status_code=403,
            detail="ENROLLMENT_CODE_EXPIRED: This enrollment code has expired.",
        )

    # 5. Check device ID reservation match (prevent device ID spoofing)
    if enrollment.device_id.upper() != body.device_id.upper():
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail=f"Device ID mismatch: code reserved for {enrollment.device_id}, submitted {body.device_id}")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_ID_MISMATCH: Enrollment code is reserved for device '{enrollment.device_id}', not '{body.device_id}'.",
        )

    # 6. Check existing device revocation status
    existing_reg = db.get(RegisteredDevice, enrollment.device_id)
    if existing_reg and existing_reg.status in ("revoked", "suspended"):
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail=f"Enrollment attempt on {existing_reg.status} device")
        raise HTTPException(
            status_code=403,
            detail=f"DEVICE_{existing_reg.status.upper()}: Device '{body.device_id}' has been {existing_reg.status} and cannot be enrolled.",
        )

    # 7. Validate public key format (SPKI DER base64 ECDSA P-256)
    try:
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        from cryptography.hazmat.primitives.asymmetric import ec
        pk_bytes = base64.b64decode(body.public_key.strip())
        parsed_pk = load_der_public_key(pk_bytes)
        if not isinstance(parsed_pk, ec.EllipticCurvePublicKey) or not isinstance(parsed_pk.curve, ec.SECP256R1):
            raise ValueError("Not an EllipticCurvePublicKey SECP256R1 curve")
    except Exception:
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail="Malformed public key format")
        raise HTTPException(
            status_code=422,
            detail="INVALID_PUBLIC_KEY: Public key must be a valid base64-encoded DER SPKI ECDSA P-256 key.",
        )

    # 8. Proof-of-Possession check
    #    Canonical challenge text: ENROLL\n{device_id}\n{enrollment_code}\n{public_key}
    canonical_challenge = (
        f"ENROLL\n{body.device_id}\n"
        f"{body.enrollment_code.strip().upper()}\n"
        f"{body.public_key.strip()}"
    )

    if not _verify_proof_of_possession(
        body.public_key, canonical_challenge.encode(), body.challenge_signature
    ):
        log(db, session_id=None, action="ENROLLMENT_REJECTED", actor=body.device_id,
            detail="Proof of possession signature failed")
        raise HTTPException(
            status_code=401,
            detail="PROOF_OF_POSSESSION_FAILED: Proof of possession signature failed verification.",
        )

    # 9. Bind device public key in RegisteredDevice database table
    if existing_reg:
        existing_reg.public_key_spki_b64 = body.public_key.strip()
        existing_reg.checkpoint_id = enrollment.checkpoint_id
        existing_reg.officer_badge = enrollment.officer_badge
        existing_reg.algorithm = body.algorithm
        existing_reg.status = "active"
    else:
        new_reg = RegisteredDevice(
            device_id=enrollment.device_id,
            checkpoint_id=enrollment.checkpoint_id,
            officer_badge=enrollment.officer_badge,
            public_key_spki_b64=body.public_key.strip(),
            algorithm=body.algorithm,
            status="active",
        )
        db.add(new_reg)

    # 10. Mark enrollment code as used (one-time consume)
    enrollment.status = "used"
    enrollment.used_at = now

    db.commit()

    # 11. Reload in-memory device registry in sync.py
    try:
        from .sync import _load_device_registry
        _load_device_registry()
    except Exception:
        pass

    log(
        db,
        session_id=None,
        action="DEVICE_ENROLLED",
        actor=enrollment.device_id,
        detail=f"checkpoint={enrollment.checkpoint_id} officer={enrollment.officer_badge}",
    )

    return DeviceEnrollOut(
        enrolled=True,
        device_id=enrollment.device_id,
        checkpoint_id=enrollment.checkpoint_id,
        officer_badge=enrollment.officer_badge,
        enrolled_at=now,
    )
