"""VeriShield AI — Phase 2.7 Device Enrollment & Revocation Test Suite.

Validates the browser-to-HQ device enrollment flow, proof-of-possession verification,
device lifecycle status (active, revoked, suspended), and end-to-end ECDSA sync.

Test scenarios covered:
- Valid device enrollment with proof of possession (-> 200)
- Invalid enrollment code (-> 403)
- Expired enrollment code (-> 403)
- Already-used enrollment code (-> 409)
- Invalid public key format (-> 422)
- Proof of possession signature failure (-> 401)
- Device ID mismatch (-> 403)
- Sync with active device (-> 200)
- Sync with revoked device (-> 403)
- Sync with suspended device (-> 403)
- Re-enrollment attempt on revoked device (-> 403)
- Real End-to-End browser simulation: generate ECDSA key -> enroll -> sign sync -> 200 OK
"""

from __future__ import annotations

import base64
import hashlib
import json
import time

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.models.db import RegisteredDevice, SessionLocal


def _generate_ecdsa_keypair():
    key = ec.generate_private_key(ec.SECP256R1())
    pub_spki_b64 = base64.b64encode(
        key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    ).decode()
    return key, pub_spki_b64


def _sign_challenge(private_key, device_id: str, code: str, public_key_spki_b64: str) -> str:
    canonical = f"ENROLL\n{device_id.strip()}\n{code.strip().upper()}\n{public_key_spki_b64.strip()}"
    sig = private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig).decode()


def _sign_sync_request(private_key, device_id: str, timestamp: str, nonce: str, body_bytes: bytes) -> str:
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    canonical = f"POST\n/sync/session\n{timestamp}\n{nonce}\n{body_hash}\n{device_id}"
    sig = private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig).decode()


# ---------------------------------------------------------------------------
# 1. Valid enrollment
# ---------------------------------------------------------------------------
def test_valid_device_enrollment(client):
    """Fresh key pair + valid code + proof of possession signature -> 200 OK."""
    priv_key, pub_spki = _generate_ecdsa_keypair()
    device_id = "DEV-OFFICER-02"
    code = "VS-ENROLL-DEMO-02"
    challenge_sig = _sign_challenge(priv_key, device_id, code, pub_spki)

    payload = {
        "enrollment_code": code,
        "device_id": device_id,
        "public_key": pub_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert data["enrolled"] is True
    assert data["device_id"] == "DEV-OFFICER-02"
    assert data["checkpoint_id"] == "cp-demo"
    assert data["officer_badge"] == "VS-0001"


# ---------------------------------------------------------------------------
# 2. Invalid enrollment code
# ---------------------------------------------------------------------------
def test_invalid_enrollment_code_rejected(client):
    priv_key, pub_spki = _generate_ecdsa_keypair()
    code = "VS-INVALID-CODE-999"
    challenge_sig = _sign_challenge(priv_key, "DEV-OFFICER-01", code, pub_spki)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-OFFICER-01",
        "public_key": pub_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 403
    assert "invalid_enrollment_code" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 3. Expired enrollment code
# ---------------------------------------------------------------------------
def test_expired_enrollment_code_rejected(client):
    priv_key, pub_spki = _generate_ecdsa_keypair()
    code = "VS-ENROLL-EXPIRED"
    challenge_sig = _sign_challenge(priv_key, "DEV-OFFICER-03", code, pub_spki)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-OFFICER-03",
        "public_key": pub_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 403
    assert "enrollment_code_expired" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 4. Already-used enrollment code
# ---------------------------------------------------------------------------
def test_already_used_enrollment_code_rejected(client):
    priv_key, pub_spki = _generate_ecdsa_keypair()
    code = "VS-ENROLL-USED"
    challenge_sig = _sign_challenge(priv_key, "DEV-OFFICER-04", code, pub_spki)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-OFFICER-04",
        "public_key": pub_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 409
    assert "already_used" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 5. Device ID mismatch (attempt to enroll wrong device ID with code)
# ---------------------------------------------------------------------------
def test_device_id_mismatch_rejected(client):
    priv_key, pub_spki = _generate_ecdsa_keypair()
    code = "VS-ENROLL-DEMO-01"  # Reserved for DEV-OFFICER-01
    challenge_sig = _sign_challenge(priv_key, "DEV-ATTACKER-99", code, pub_spki)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-ATTACKER-99",  # Submitted wrong device ID
        "public_key": pub_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 403
    assert "device_id_mismatch" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 6. Invalid public key format
# ---------------------------------------------------------------------------
def test_invalid_public_key_format_rejected(client):
    priv_key, _ = _generate_ecdsa_keypair()
    bad_pk = "NOT-A-VALID-BASE64-SPKI-PUBLIC-KEY"
    code = "VS-ENROLL-DEMO-01"
    challenge_sig = _sign_challenge(priv_key, "DEV-OFFICER-01", code, bad_pk)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-OFFICER-01",
        "public_key": bad_pk,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 422
    assert "invalid_public_key" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 7. Proof of possession signature failure
# ---------------------------------------------------------------------------
def test_proof_of_possession_failure_rejected(client):
    priv_key1, pub_spki1 = _generate_ecdsa_keypair()
    priv_key2, _ = _generate_ecdsa_keypair()
    code = "VS-ENROLL-DEMO-01"
    # Sign with key2, but submit pub_spki1
    wrong_sig = _sign_challenge(priv_key2, "DEV-OFFICER-01", code, pub_spki1)

    payload = {
        "enrollment_code": code,
        "device_id": "DEV-OFFICER-01",
        "public_key": pub_spki1,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": wrong_sig,
    }

    r = client.post("/device/enroll", json=payload)
    assert r.status_code == 401
    assert "proof_of_possession_failed" in r.json()["detail"].lower()
# ---------------------------------------------------------------------------
# 8. Device status lifecycle: active, revoked, suspended sync tests
# ---------------------------------------------------------------------------
def test_device_revocation_and_suspension_lifecycle(client):
    """Proves active → 200, revoked → 403, suspended → 403, revoked re-enroll → 403."""
    from app.api.sync import _load_device_registry

    # Create an isolated active device for this lifecycle test
    priv_key, pub_spki = _generate_ecdsa_keypair()
    dev_id = "DEV-OFFICER-REVOKE-TEST"

    with SessionLocal() as db:
        dev = RegisteredDevice(
            device_id=dev_id,
            checkpoint_id="cp-demo",
            officer_badge="VS-0001",
            public_key_spki_b64=pub_spki,
            algorithm="ECDSA-P256-SHA256",
            status="active",
        )
        db.add(dev)
        db.commit()
    _load_device_registry()

    try:
        # 1. Active sync succeeds
        sync_body = {
            "session_id": f"VS-REVOKE-SYNC-1-{time.time_ns()}",
            "checkpoint": "cp-demo",
            "officer_badge": "VS-0001",
            "document_type": "passport",
        }
        body_bytes = json.dumps(sync_body).encode()
        ts = str(int(time.time()))
        nonce = f"nonce-revoke-1-{time.time_ns()}"
        sig = _sign_sync_request(priv_key, dev_id, ts, nonce, body_bytes)
        headers = {
            "X-VeriShield-Device": dev_id,
            "X-VeriShield-Timestamp": ts,
            "X-VeriShield-Nonce": nonce,
            "X-VeriShield-Signature": sig,
            "Content-Type": "application/json",
        }
        r1 = client.post("/sync/session", content=body_bytes, headers=headers)
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}: {r1.text}"

        # 2. Set device status to suspended
        with SessionLocal() as db:
            dev = db.get(RegisteredDevice, dev_id)
            dev.status = "suspended"
            db.commit()
        _load_device_registry()

        # Suspended sync is rejected
        nonce_2 = f"nonce-revoke-2-{time.time_ns()}"
        sig_2 = _sign_sync_request(priv_key, dev_id, ts, nonce_2, body_bytes)
        headers_2 = {**headers, "X-VeriShield-Nonce": nonce_2, "X-VeriShield-Signature": sig_2}
        r2 = client.post("/sync/session", content=body_bytes, headers=headers_2)
        assert r2.status_code == 403, f"Expected 403, got {r2.status_code}: {r2.text}"
        assert "device_suspended" in r2.json()["detail"].lower()

        # 3. Set device status to revoked
        with SessionLocal() as db:
            dev = db.get(RegisteredDevice, dev_id)
            dev.status = "revoked"
            db.commit()
        _load_device_registry()

        # Revoked sync is rejected
        nonce_3 = f"nonce-revoke-3-{time.time_ns()}"
        sig_3 = _sign_sync_request(priv_key, dev_id, ts, nonce_3, body_bytes)
        headers_3 = {**headers, "X-VeriShield-Nonce": nonce_3, "X-VeriShield-Signature": sig_3}
        r3 = client.post("/sync/session", content=body_bytes, headers=headers_3)
        assert r3.status_code == 403
        assert "device_revoked" in r3.json()["detail"].lower()

        # 4. Attempt re-enrollment of revoked device is rejected
        from app.models.db import DeviceEnrollment, hash_enrollment_code, utcnow
        from datetime import timedelta
        revoke_code = f"VS-ENROLL-REVOKE-{time.time_ns()}"
        with SessionLocal() as db:
            db.add(
                DeviceEnrollment(
                    enrollment_code_hash=hash_enrollment_code(revoke_code),
                    device_id=dev_id,
                    checkpoint_id="cp-demo",
                    officer_badge="VS-0001",
                    expires_at=utcnow() + timedelta(days=1),
                    status="pending",
                )
            )
            db.commit()

        priv_key_new, pub_spki_new = _generate_ecdsa_keypair()
        challenge_sig = _sign_challenge(priv_key_new, dev_id, revoke_code, pub_spki_new)
        r4 = client.post(
            "/device/enroll",
            json={
                "enrollment_code": revoke_code,
                "device_id": dev_id,
                "public_key": pub_spki_new,
                "algorithm": "ECDSA-P256-SHA256",
                "challenge_signature": challenge_sig,
            },
        )
        assert r4.status_code == 403
        assert "device_revoked" in r4.json()["detail"].lower()

    finally:
        # Cleanup isolated device
        with SessionLocal() as db:
            db.query(RegisteredDevice).filter_by(device_id=dev_id).delete()
            db.commit()
        _load_device_registry()


# ---------------------------------------------------------------------------
# 9. REAL END-TO-END BROWSER SIMULATION
# ---------------------------------------------------------------------------
def test_real_end_to_end_browser_enrollment_and_sync(client):
    """Simulates a fresh browser:

    1. Generate non-exportable ECDSA key pair (Key B).
    2. Call POST /device/enroll submitting public key + proof of possession signature.
    3. HQ verifies proof of possession and binds public key to DEV-OFFICER-01.
    4. Sign sync request with Key B and POST /sync/session → 200 OK.
    5. Sign second sync request with Key B (reusing key after page refresh) → 200 OK.
    """
    key_b, pub_b_spki = _generate_ecdsa_keypair()
    device_id = "DEV-OFFICER-01"
    enroll_code = "VS-ENROLL-DEMO-01"

    # Step 1: Proof of possession challenge signature
    challenge_sig = _sign_challenge(key_b, device_id, enroll_code, pub_b_spki)

    # Step 2: Enroll with HQ
    enroll_req = {
        "enrollment_code": enroll_code,
        "device_id": device_id,
        "public_key": pub_b_spki,
        "algorithm": "ECDSA-P256-SHA256",
        "challenge_signature": challenge_sig,
    }
    r_enroll = client.post("/device/enroll", json=enroll_req)
    assert r_enroll.status_code == 200, f"Enrollment failed: {r_enroll.text}"
    enroll_data = r_enroll.json()
    assert enroll_data["enrolled"] is True
    assert enroll_data["device_id"] == device_id
    assert enroll_data["checkpoint_id"] == "cp-demo"
    assert enroll_data["officer_badge"] == "VS-0001"

    # Step 3: Perform first sync request signed with Key B
    sync_payload_1 = {
        "session_id": f"VS-E2E-SYNC-1-{time.time_ns()}",
        "checkpoint": enroll_data["checkpoint_id"],
        "officer_badge": enroll_data["officer_badge"],
        "document_type": "passport",
        "decision": "cleared",
        "risk_score": 12.0,
        "risk_band": "clear",
        "risk_reasons": [],
        "events": [],
    }
    bytes_1 = json.dumps(sync_payload_1).encode()
    ts_1 = str(int(time.time()))
    nonce_1 = f"nonce-e2e-1-{time.time_ns()}"
    sig_1 = _sign_sync_request(key_b, device_id, ts_1, nonce_1, bytes_1)

    headers_1 = {
        "X-VeriShield-Device": device_id,
        "X-VeriShield-Timestamp": ts_1,
        "X-VeriShield-Nonce": nonce_1,
        "X-VeriShield-Signature": sig_1,
        "Content-Type": "application/json",
    }

    r_sync_1 = client.post("/sync/session", content=bytes_1, headers=headers_1)
    assert r_sync_1.status_code == 200, f"Sync 1 failed: {r_sync_1.text}"
    assert r_sync_1.json()["stored"] is True

    # Step 4: Perform second sync request signed with Key B (page refresh / key reuse simulation)
    sync_payload_2 = {
        "session_id": f"VS-E2E-SYNC-2-{time.time_ns()}",
        "checkpoint": enroll_data["checkpoint_id"],
        "officer_badge": enroll_data["officer_badge"],
        "document_type": "aadhaar",
        "decision": "cleared",
        "risk_score": 18.0,
        "risk_band": "clear",
        "risk_reasons": [],
        "events": [],
    }
    bytes_2 = json.dumps(sync_payload_2).encode()
    ts_2 = str(int(time.time()))
    nonce_2 = f"nonce-e2e-2-{time.time_ns()}"
    sig_2 = _sign_sync_request(key_b, device_id, ts_2, nonce_2, bytes_2)

    headers_2 = {
        "X-VeriShield-Device": device_id,
        "X-VeriShield-Timestamp": ts_2,
        "X-VeriShield-Nonce": nonce_2,
        "X-VeriShield-Signature": sig_2,
        "Content-Type": "application/json",
    }

    r_sync_2 = client.post("/sync/session", content=bytes_2, headers=headers_2)
    assert r_sync_2.status_code == 200, f"Sync 2 failed: {r_sync_2.text}"
    assert r_sync_2.json()["stored"] is True
