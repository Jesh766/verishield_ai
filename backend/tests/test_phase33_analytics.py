"""VeriShield AI — Phase 3.3 Field Operational Tools & Analytics Test Suite.

Validates operational analytics aggregations, multi-field filtering, manual review status workflow,
supervisor note validation, tamper-evident audit log events, privacy-safe export, and auth enforcement.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import config
from app.main import app
from app.models.db import AuditLog, VerificationSession, get_db

client = TestClient(app)


def get_admin_token() -> str:
    """Helper to obtain an authenticated admin token."""
    res = client.post("/admin/login", json={"passcode": config.ADMIN_PASSCODE})
    assert res.status_code == 200
    return res.json()["token"]


def test_analytics_unauthorized_rejected():
    """GET /admin/analytics rejects unauthenticated requests."""
    res = client.get("/admin/analytics")
    assert res.status_code == 401


def test_case_review_update_unauthorized_rejected():
    """PUT /admin/sessions/{session_id}/review rejects unauthenticated requests."""
    res = client.put("/admin/sessions/test-session-id/review", json={"review_status": "CLEARED"})
    assert res.status_code == 401


def test_export_unauthorized_rejected():
    """GET /admin/export rejects unauthenticated requests."""
    res = client.get("/admin/export")
    assert res.status_code == 401


def test_operational_analytics_and_review_workflow(db_session: Session):
    """Full operational workflow: seed session -> fetch analytics -> update review status & notes -> export."""
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Seed a test session
    sess_id = f"test-p33-{secrets.token_hex(6)}"
    sess = VerificationSession(
        id=sess_id,
        checkpoint_id="cp-demo",
        officer_id="off-demo",
        document_type="passport",
        extracted_fields={"name": "TEST USER", "passport_number": "J••••••7"},
        ocr_confidence=94.5,
        risk_score=15.0,
        risk_band="clear",
        decision="cleared",
        synced=True,
        review_status="OPEN",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(sess)
    db_session.commit()

    # 2. Fetch operational analytics
    anal_res = client.get("/admin/analytics", headers=headers)
    assert anal_res.status_code == 200
    data = anal_res.json()
    assert data["total_screenings"] >= 1
    assert data["accepted_count"] >= 1
    assert "screenings_over_time" in data
    assert "evidence_signals" in data

    # 3. Update case review status and supervisor note
    rev_res = client.put(
        f"/admin/sessions/{sess_id}/review",
        headers=headers,
        json={
            "review_status": "CLEARED",
            "note": "Operational clearance verified by supervisor at Attari ICP.",
        },
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["session_id"] == sess_id
    assert rev_data["review_status"] == "CLEARED"
    assert "supervisor at Attari" in rev_data["review_notes"]

    # 4. Verify audit log entry created
    logs = db_session.query(AuditLog).filter(AuditLog.session_id == sess_id).all()
    actions = [l.action for l in logs]
    assert "CASE_REVIEW_UPDATED" in actions

    # 5. Filter sessions by review_status=CLEARED
    filt_res = client.get("/admin/sessions?review_status=CLEARED", headers=headers)
    assert filt_res.status_code == 200
    filtered_sessions = filt_res.json()
    assert any(s["id"] == sess_id for s in filtered_sessions)

    # 6. Export privacy-safe operational report
    exp_res = client.get("/admin/export", headers=headers)
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert "summary" in exp_data
    assert "analytics" in exp_data
    assert "audit_chain_integrity" in exp_data
    assert "privacy_note" in exp_data
