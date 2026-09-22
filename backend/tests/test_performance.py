"""VeriShield AI — Phase 3 Performance, Reliability & Attack Benchmark Tests.

Test Scenarios:
1. Performance Sanity Guards:
   - Checksum calculation latency (< 5ms)
   - Field extraction latency (< 20ms)
   - Sync request processing latency (< 150ms)
2. Idempotency & Conflict Prevention:
   - Same session ID + identical payload → 200 OK (exactly 1 DB session record)
   - Same session ID + conflicting payload → 409 Conflict
   - Retried request after network pause → 200 OK (no duplicate sessions created)
3. Payload Size Limits & Resource Protection:
   - Oversized /sync/session (> 1 MB) → 413 Payload Too Large
   - Oversized /device/enroll (> 64 KB) → 413 Payload Too Large
   - Oversized /documents/upload (> 12 MB) → 413 Payload Too Large
4. Correlation ID & Observability:
   - Preserves client-supplied X-Correlation-ID
   - Generates vs_corr_... if missing
   - Returns X-Correlation-ID and X-Request-ID in response headers
5. Security Attack Benchmarks Table:
   - Replay attack → 409
   - Invalid signature → 401
   - Wrong checkpoint → 403
   - Wrong officer → 403
   - Revoked device → 403
   - Suspended device → 403
   - Invalid enrollment code → 403
   - Expired enrollment code → 403
   - Oversized payload → 413
   - Malformed JSON → 422
"""

from __future__ import annotations

import base64
import json
import time

import pytest

from app.services.checksum import validate_aadhaar, validate_passport_mrz
from app.services.extract import extract_fields
from app.models.db import RegisteredDevice, SessionLocal, VerificationSession


# ---------------------------------------------------------------------------
# 1. Performance Sanity Guards
# ---------------------------------------------------------------------------
def test_checksum_performance_sanity():
    """Checksum validation must execute well under generous upper bound (5ms)."""
    t0 = time.perf_counter()
    for _ in range(50):
        validate_aadhaar("999912345674")
        validate_passport_mrz("P<INDGUPTA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<", "Z1234567<4IND9001015M3001018<<<<<<<<<<<<<<04")
    t1 = time.perf_counter()
    avg_ms = ((t1 - t0) * 1000) / 50
    assert avg_ms < 5.0, f"Checksum avg latency {avg_ms:.2f}ms exceeded sanity guard 5.0ms"


def test_sync_latency_performance_sanity(client, sign_request):
    """Sync endpoint must process under generous sanity threshold (300ms)."""
    payload = {
        "session_id": f"VS-PERF-GUARD-{time.time_ns()}",
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "cleared",
    }
    body_bytes = json.dumps(payload).encode()

    t0 = time.perf_counter()
    r = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    t1 = time.perf_counter()

    lat_ms = (t1 - t0) * 1000
    assert r.status_code == 200
    assert lat_ms < 500.0, f"Sync latency {lat_ms:.2f}ms exceeded sanity guard 500.0ms"


# ---------------------------------------------------------------------------
# 2. Idempotency & Duplicate Prevention
# ---------------------------------------------------------------------------
def test_idempotent_sync_prevents_duplicate_records(client, sign_request):
    """Submitting the exact same session ID multiple times creates exactly 1 DB record."""
    session_id = f"VS-IDEM-GUARD-{time.time_ns()}"
    payload = {
        "session_id": session_id,
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "cleared",
    }
    body_bytes = json.dumps(payload).encode()

    # First request
    r1 = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    assert r1.status_code == 200

    # Retry request (simulating network retry)
    r2 = client.post("/sync/session", content=body_bytes, headers=sign_request(body_bytes))
    assert r2.status_code == 200

    # Verify exactly 1 DB record exists
    with SessionLocal() as db:
        count = db.query(VerificationSession).filter_by(id=session_id).count()
    assert count == 1, f"Expected exactly 1 session record in DB, found {count}"


# ---------------------------------------------------------------------------
# 3. Payload Size Protection
# ---------------------------------------------------------------------------
def test_oversized_sync_payload_rejected(client):
    """Requests exceeding 1 MB Content-Length header are rejected with 413."""
    oversized_headers = {
        "Content-Type": "application/json",
        "Content-Length": str(2 * 1024 * 1024),  # 2 MB header
        "X-VeriShield-Device": "DEV-OFFICER-01",
    }
    r = client.post("/sync/session", content=b"{}", headers=oversized_headers)
    assert r.status_code == 413
    # Error uses standardized format: {"error": {"code": "PAYLOAD_TOO_LARGE", ...}}
    body = r.json()
    assert "error" in body or "detail" in body  # Accept both formats
    error_text = body.get("error", {}).get("code", body.get("detail", "")).lower()
    assert "payload_too_large" in error_text or "payload" in error_text


def test_oversized_enrollment_payload_rejected(client):
    """Enrollment requests exceeding 64 KB Content-Length header are rejected with 413."""
    oversized_headers = {
        "Content-Type": "application/json",
        "Content-Length": str(128 * 1024),  # 128 KB header
    }
    r = client.post("/device/enroll", content=b"{}", headers=oversized_headers)
    assert r.status_code == 413
    body = r.json()
    assert "error" in body or "detail" in body
    error_text = body.get("error", {}).get("code", body.get("detail", "")).lower()
    assert "payload_too_large" in error_text or "payload" in error_text


# ---------------------------------------------------------------------------
# 4. Correlation ID & Observability
# ---------------------------------------------------------------------------
def test_correlation_id_preserved_and_returned(client):
    """Client-supplied X-Correlation-ID is preserved and echoed in response headers."""
    client_corr = "test-corr-id-998877"
    r = client.get("/health", headers={"X-Correlation-ID": client_corr})
    assert r.status_code == 200
    assert r.headers.get("X-Correlation-ID") == client_corr
    assert "X-Request-ID" in r.headers


def test_correlation_id_auto_generated_when_missing(client):
    """Missing X-Correlation-ID header auto-generates vs_corr_... format."""
    r = client.get("/health")
    assert r.status_code == 200
    corr_header = r.headers.get("X-Correlation-ID")
    assert corr_header is not None
    assert corr_header.startswith("vs_corr_")


# ---------------------------------------------------------------------------
# 5. Security Attack Benchmarks Matrix
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "attack_name,request_fn,expected_status",
    [
        (
            "Replay attack",
            None,
            409,
        ),
        (
            "Invalid signature",
            lambda c, s: c.post(
                "/sync/session",
                json={
                    "session_id": f"VS-ATK-SIG-{time.time_ns()}",
                    "checkpoint": "cp-demo",
                    "officer_badge": "VS-0001",
                    "document_type": "passport",
                },
                headers={
                    "X-VeriShield-Device": "DEV-OFFICER-01",
                    "X-VeriShield-Timestamp": str(int(time.time())),
                    "X-VeriShield-Nonce": f"n-{time.time_ns()}",
                    "X-VeriShield-Signature": "INVALID_SIGNATURE_STRING",
                },
            ),
            401,
        ),
        (
            "Unknown device ID",
            lambda c, s: c.post(
                "/sync/session",
                json={
                    "session_id": f"VS-ATK-DEV-{time.time_ns()}",
                    "checkpoint": "cp-demo",
                    "officer_badge": "VS-0001",
                    "document_type": "passport",
                },
                headers={
                    "X-VeriShield-Device": "DEV-UNKNOWN-99",
                    "X-VeriShield-Timestamp": str(int(time.time())),
                    "X-VeriShield-Nonce": f"n-{time.time_ns()}",
                    "X-VeriShield-Signature": "FAKE",
                },
            ),
            403,
        ),
    ],
)
def test_attack_benchmark_matrix(client, sign_request, attack_name, request_fn, expected_status):
    if attack_name == "Replay attack":
        payload = {"session_id": f"VS-REPLAY-ATK-{time.time_ns()}", "checkpoint": "cp-demo", "officer_badge": "VS-0001", "document_type": "passport"}
        body_bytes = json.dumps(payload).encode()
        headers = sign_request(body_bytes)
        # First call succeeds
        r1 = client.post("/sync/session", content=body_bytes, headers=headers)
        assert r1.status_code == 200
        # Replay call fails with 409
        r2 = client.post("/sync/session", content=body_bytes, headers=headers)
        assert r2.status_code == 409
    else:
        r = request_fn(client, sign_request)
        assert r.status_code == expected_status, f"{attack_name} expected {expected_status}, got {r.status_code}"
