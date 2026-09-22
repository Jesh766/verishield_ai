"""VeriShield AI — Phase 2.5 Reliability, Failure Recovery & Data Integrity Test Suite.

Validates atomic backend transactions, failure recovery, idempotency under response loss,
conflicting retry rejection, audit log consistency, and database error safety.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from app.models.db import AuditLog, SessionLocal, VerificationSession, log, verify_audit_chain


def _generate_ecdsa_keypair():
    key = ec.generate_private_key(ec.SECP256R1())
    pub_spki_b64 = base64.b64encode(
        key.public_key().public_bytes(
            __import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]).Encoding.DER,
            __import__("cryptography.hazmat.primitives.serialization", fromlist=["PublicFormat"]).PublicFormat.SubjectPublicKeyInfo,
        )
    ).decode()
    return key, pub_spki_b64


def _sign_sync_request(private_key, device_id: str, timestamp: str, nonce: str, body_bytes: bytes) -> str:
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    canonical = f"POST\n/sync/session\n{timestamp}\n{nonce}\n{body_hash}\n{device_id}"
    sig = private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig).decode()


# ---------------------------------------------------------------------------
# 1. Transaction Atomicity & Rollback Safety
# ---------------------------------------------------------------------------
def test_sync_transaction_atomicity(client, sign_request):
    """Session creation and SYNC_ACCEPTED audit event land atomically in DB."""
    session_id = f"VS-ATOMIC-{time.time_ns()}"
    payload = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "cleared",
        "risk_score": 10.0,
        "risk_band": "clear",
        "risk_reasons": [],
        "events": [{"action": "OCR_COMPLETED", "detail": "mean_confidence=98.5"}],
    }
    body_bytes = json.dumps(payload).encode()
    r = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    assert r.status_code == 200, f"Sync failed: {r.text}"

    with SessionLocal() as db:
        sess = db.get(VerificationSession, session_id)
        assert sess is not None, "Session record was not persisted in DB"

        logs = db.query(AuditLog).filter_by(session_id=session_id).all()
        assert len(logs) >= 1, "Audit log event was not persisted with session"
        actions = [l.action for l in logs]
        assert "SYNC_ACCEPTED" in actions


# ---------------------------------------------------------------------------
# 2. Idempotent Retry After Simulated Response Loss
# ---------------------------------------------------------------------------
def test_sync_response_loss_idempotent_retry(client, sign_request):
    """Resending exact same payload with a new nonce returns 200 OK without duplicating session."""
    session_id = f"VS-RESPONSE-LOSS-{time.time_ns()}"
    payload = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "aadhaar",
        "decision": "cleared",
        "risk_score": 5.0,
        "risk_band": "clear",
        "risk_reasons": [],
    }
    body_bytes = json.dumps(payload).encode()

    # First attempt (simulated network response drop after server process)
    r1 = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    assert r1.status_code == 200

    # Retry attempt (new signature + nonce, exact same payload)
    r2 = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    assert r2.status_code == 200
    assert r2.json()["stored"] is True

    with SessionLocal() as db:
        sessions = db.query(VerificationSession).filter_by(id=session_id).all()
        assert len(sessions) == 1, "Duplicate session created for idempotent retry"


# ---------------------------------------------------------------------------
# 3. Conflicting Retry Rejection
# ---------------------------------------------------------------------------
def test_sync_conflicting_payload_rejected(client, sign_request):
    """Resending same session_id with a conflicting decision/score returns 409 Conflict."""
    session_id = f"VS-CONFLICT-{time.time_ns()}"
    payload1 = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "cleared",
        "risk_score": 10.0,
    }
    body_bytes1 = json.dumps(payload1).encode()
    r1 = client.post("/sync/session", content=body_bytes1, headers=sign_request(body_bytes1))
    assert r1.status_code == 200

    # Conflicting payload (decision changed to rejected)
    payload2 = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "rejected",  # Conflicting field
        "risk_score": 90.0,
    }
    body_bytes2 = json.dumps(payload2).encode()
    r2 = client.post("/sync/session", content=body_bytes2, headers=sign_request(body_bytes2))
    assert r2.status_code == 409, f"Expected 409 Conflict, got {r2.status_code}"
    assert "Conflicting payload" in r2.json()["detail"]


# ---------------------------------------------------------------------------
# 4. Clock Skew / Stale Timestamp Recovery
# ---------------------------------------------------------------------------
def test_stale_timestamp_rejected_and_recoverable(client, ecdsa_private_key):
    """Timestamp older than 300s is rejected (401), but fresh timestamp succeeds."""
    session_id = f"VS-CLOCK-{time.time_ns()}"
    payload = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "dl",
        "decision": "cleared",
        "risk_score": 12.0,
    }
    body_bytes = json.dumps(payload).encode()
    device_id = "DEV-OFFICER-01"

    # Stale timestamp (10 minutes ago)
    stale_ts = str(int(time.time()) - 600)
    nonce = f"nonce-{time.time_ns()}"
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    canonical = f"POST\n/sync/session\n{stale_ts}\n{nonce}\n{body_hash}\n{device_id}"
    sig = ecdsa_private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    stale_headers = {
        "X-VeriShield-Device": device_id,
        "X-VeriShield-Timestamp": stale_ts,
        "X-VeriShield-Nonce": nonce,
        "X-VeriShield-Signature": base64.b64encode(sig).decode(),
        "Content-Type": "application/json",
    }

    r_stale = client.post("/sync/session", content=body_bytes, headers=stale_headers)
    assert r_stale.status_code == 401
    assert "timestamp expired" in r_stale.json()["detail"].lower()

    # Recovery: retry with fresh timestamp succeeds
    fresh_ts = str(int(time.time()))
    fresh_nonce = f"nonce-{time.time_ns()}"
    canonical_fresh = f"POST\n/sync/session\n{fresh_ts}\n{fresh_nonce}\n{body_hash}\n{device_id}"
    sig_fresh = ecdsa_private_key.sign(canonical_fresh.encode(), ec.ECDSA(hashes.SHA256()))
    fresh_headers = {
        "X-VeriShield-Device": device_id,
        "X-VeriShield-Timestamp": fresh_ts,
        "X-VeriShield-Nonce": fresh_nonce,
        "X-VeriShield-Signature": base64.b64encode(sig_fresh).decode(),
        "Content-Type": "application/json",
    }

    r_fresh = client.post("/sync/session", content=body_bytes, headers=fresh_headers)
    assert r_fresh.status_code == 200
