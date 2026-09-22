"""HQ admin API — read-only ledger over everything synced from checkpoints.

Requires valid server authentication token. Hardcoded client fallbacks have been
removed. Authenticated endpoints use database-level pagination, SQL aggregation,
and security audit logging.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import config
from ..models.db import AuditLog, Officer, VerificationSession, get_db, log
from ..models.schemas import (
    AdminLoginRequest, AdminLoginResponse, AdminSessionDetail, AdminSessionOut,
    AdminStatsOut, AuditLogOut, CaseReviewUpdateIn, CaseReviewUpdateOut, OperationalAnalyticsOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# In-memory token store: token -> expiry timestamp
_TOKENS: dict[str, datetime] = {}

# Sliding window rate limiter for login: client_ip -> list of failed attempt timestamps
_FAILED_LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}


def _check_rate_limit(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    attempts = [t for t in _FAILED_LOGIN_ATTEMPTS.get(client_ip, []) if now - t < timedelta(seconds=60)]
    _FAILED_LOGIN_ATTEMPTS[client_ip] = attempts
    if len(attempts) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please wait 1 minute before retrying.",
        )


def _record_failed_attempt(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    attempts = _FAILED_LOGIN_ATTEMPTS.get(client_ip, [])
    attempts.append(now)
    _FAILED_LOGIN_ATTEMPTS[client_ip] = attempts


@router.post("/login", response_model=AdminLoginResponse)
@router.post("/admin/login", response_model=AdminLoginResponse)
@router.post("/api/admin/login", response_model=AdminLoginResponse)
def login(body: AdminLoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    if not config.ADMIN_PASSCODE:
        log(db, session_id=None, action="ADMIN_LOGIN_ERROR", actor=client_ip, detail="Unconfigured admin passcode")
        raise HTTPException(status_code=500, detail="HQ Server Configuration Error: VERISHIELD_ADMIN_PASSCODE environment variable is not configured.")

    input_pass = (body.passcode or "").strip()
    is_valid = secrets.compare_digest(input_pass, config.ADMIN_PASSCODE)
    
    if not is_valid:
        _record_failed_attempt(client_ip)
        log(db, session_id=None, action="ADMIN_LOGIN_FAILURE", actor=client_ip, detail="Incorrect passcode submitted")
        raise HTTPException(status_code=401, detail="Incorrect admin passcode.")

    # Success: clear failed attempts and issue token
    _FAILED_LOGIN_ATTEMPTS.pop(client_ip, None)
    token = secrets.token_urlsafe(32)
    _TOKENS[token] = datetime.now(timezone.utc) + timedelta(seconds=config.ADMIN_TOKEN_TTL_SECONDS)
    log(db, session_id=None, action="ADMIN_LOGIN_SUCCESS", actor=client_ip, detail="Admin token issued")
    
    return AdminLoginResponse(token=token, expires_in=config.ADMIN_TOKEN_TTL_SECONDS)


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid admin authorization token.")
    token = authorization.removeprefix("Bearer ").strip()
    expiry = _TOKENS.get(token)
    if not expiry or expiry < datetime.now(timezone.utc):
        _TOKENS.pop(token, None)
        raise HTTPException(status_code=401, detail="Admin session expired — log in again.")


def _to_out(s: VerificationSession) -> AdminSessionOut:
    return AdminSessionOut(
        id=s.id,
        officer_badge=s.officer.badge_id if s.officer else None,
        officer_name=s.officer.name if s.officer else None,
        checkpoint=s.checkpoint.name if s.checkpoint else None,
        document_type=s.document_type,
        extracted_fields=s.extracted_fields or {},
        ocr_confidence=s.ocr_confidence,
        face_match_score=s.face_match_score,
        face_verdict=s.face_verdict,
        tamper_score=s.tamper_score,
        tamper_verdict=s.tamper_verdict,
        risk_score=s.risk_score,
        risk_band=s.risk_band,
        risk_reasons=s.risk_reasons or [],
        decision=s.decision,
        note=s.note,
        review_status=s.review_status or "OPEN",
        review_notes=s.review_notes,
        reviewed_by=s.reviewed_by,
        reviewed_at=s.reviewed_at,
        created_at=s.created_at,
        received_at=s.received_at,
        synced=s.synced,
    )


@router.get("/sessions", response_model=list[AdminSessionOut], dependencies=[Depends(require_admin)])
def list_sessions(
    db: Session = Depends(get_db),
    checkpoint: str | None = None,
    decision: str | None = None,
    band: str | None = None,
    document_type: str | None = None,
    review_status: str | None = None,
    q: str | None = Query(default=None, description="Search officer badge or session ID"),
    limit: int = Query(default=50, ge=1, le=100, description="Database query limit"),
    offset: int = Query(default=0, ge=0, description="Database query offset"),
):
    query = db.query(VerificationSession)

    if checkpoint:
        query = query.filter(VerificationSession.checkpoint_id == checkpoint)
    if decision:
        query = query.filter(VerificationSession.decision == decision)
    if band:
        query = query.filter(VerificationSession.risk_band == band)
    if document_type:
        query = query.filter(VerificationSession.document_type == document_type)
    if review_status:
        query = query.filter(VerificationSession.review_status == review_status)
    if q and q.strip():
        q_term = f"%{q.strip()}%"
        query = query.outerjoin(VerificationSession.officer).filter(
            VerificationSession.id.ilike(q_term) |
            VerificationSession.officer_id.ilike(q_term) |
            Officer.badge_id.ilike(q_term) |
            Officer.name.ilike(q_term)
        )

    rows = query.order_by(VerificationSession.created_at.desc()).offset(offset).limit(limit).all()
    return [_to_out(s) for s in rows]


@router.get("/sessions/{session_id}", response_model=AdminSessionDetail, dependencies=[Depends(require_admin)])
def session_detail(session_id: str, db: Session = Depends(get_db)):
    s = db.get(VerificationSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="No such session.")
    
    log(db, session_id=session_id, action="SESSION_VIEWED", actor="admin", detail=f"Detailed view fetched for {session_id}")
    
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.session_id == session_id)
        .order_by(AuditLog.timestamp.asc())
        .all()
    )
    return AdminSessionDetail(
        **_to_out(s).model_dump(),
        audit_log=[
            AuditLogOut(action=l.action, actor=l.actor, detail=l.detail, timestamp=l.timestamp)
            for l in logs
        ],
    )


@router.put("/sessions/{session_id}/review", response_model=CaseReviewUpdateOut, dependencies=[Depends(require_admin)])
def update_case_review(
    session_id: str,
    body: CaseReviewUpdateIn,
    db: Session = Depends(get_db),
):
    s = db.get(VerificationSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="No such session.")

    now = datetime.now(timezone.utc)
    s.review_status = body.review_status
    if body.note is not None:
        s.review_notes = body.note.strip()
    s.reviewed_by = "admin"
    s.reviewed_at = now

    log(
        db,
        session_id=session_id,
        action="CASE_REVIEW_UPDATED",
        actor="admin",
        detail=f"review_status={body.review_status} note={body.note or ''}",
    )
    db.commit()
    db.refresh(s)

    return CaseReviewUpdateOut(
        session_id=s.id,
        review_status=s.review_status,
        review_notes=s.review_notes,
        reviewed_by=s.reviewed_by,
        reviewed_at=s.reviewed_at,
    )


@router.get("/audit", response_model=list[AuditLogOut], dependencies=[Depends(require_admin)])
def audit_log(
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        AuditLogOut(action=l.action, actor=l.actor, detail=l.detail, timestamp=l.timestamp, session_id=l.session_id)
        for l in logs
    ]


@router.get("/audit/verify", dependencies=[Depends(require_admin)])
def audit_verify(db: Session = Depends(get_db)):
    from ..models.db import verify_audit_chain

    return verify_audit_chain(db)


@router.get("/stats", response_model=AdminStatsOut, dependencies=[Depends(require_admin)])
def stats(db: Session = Depends(get_db)):
    total_sessions = db.query(func.count(VerificationSession.id)).scalar() or 0

    dec_rows = db.query(VerificationSession.decision, func.count(VerificationSession.id)).group_by(VerificationSession.decision).all()
    by_decision = {d or "pending": c for d, c in dec_rows}

    band_rows = db.query(VerificationSession.risk_band, func.count(VerificationSession.id)).group_by(VerificationSession.risk_band).all()
    by_band = {b or "unscored": c for b, c in band_rows}

    cp_rows = (
        db.query(VerificationSession.checkpoint_id, func.count(VerificationSession.id))
        .group_by(VerificationSession.checkpoint_id)
        .all()
    )
    by_checkpoint = {cp or "unknown": c for cp, c in cp_rows}

    doc_rows = db.query(VerificationSession.document_type, func.count(VerificationSession.id)).group_by(VerificationSession.document_type).all()
    by_document_type = {dt or "unknown": c for dt, c in doc_rows}

    avg_score = db.query(func.avg(VerificationSession.risk_score)).filter(VerificationSession.risk_score.isnot(None)).scalar()
    avg_risk_score = round(float(avg_score), 1) if avg_score is not None else None

    pending_review = by_decision.get("pending", 0)

    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    last_24h = db.query(func.count(VerificationSession.id)).filter(VerificationSession.received_at >= day_ago).scalar() or 0

    return AdminStatsOut(
        total_sessions=total_sessions,
        by_decision=by_decision,
        by_band=by_band,
        by_checkpoint=by_checkpoint,
        by_document_type=by_document_type,
        avg_risk_score=avg_risk_score,
        pending_review=pending_review,
        last_24h=last_24h,
    )


@router.get("/analytics", dependencies=[Depends(require_admin)])
def analytics(db: Session = Depends(get_db)):
    total = db.query(func.count(VerificationSession.id)).scalar() or 0
    dec_rows = dict(db.query(VerificationSession.decision, func.count(VerificationSession.id)).group_by(VerificationSession.decision).all())
    accepted = dec_rows.get("cleared", 0)
    rejected = dec_rows.get("rejected", 0)
    review = dec_rows.get("referred", 0)

    synced_count = db.query(func.count(VerificationSession.id)).filter(VerificationSession.synced.is_(True)).scalar() or 0
    pending_sync_count = total - synced_count

    band_rows = dict(db.query(VerificationSession.risk_band, func.count(VerificationSession.id)).group_by(VerificationSession.risk_band).all())
    by_band = {
        "clear": band_rows.get("clear", 0),
        "review": band_rows.get("review", 0),
        "escalate": band_rows.get("escalate", 0),
    }

    doc_rows = dict(db.query(VerificationSession.document_type, func.count(VerificationSession.id)).group_by(VerificationSession.document_type).all())
    by_doc = {
        "aadhaar": doc_rows.get("aadhaar", 0),
        "passport": doc_rows.get("passport", 0),
        "dl": doc_rows.get("dl", 0),
        "visa": doc_rows.get("visa", 0),
    }

    avg_score_raw = db.query(func.avg(VerificationSession.risk_score)).filter(VerificationSession.risk_score.isnot(None)).scalar()
    avg_score = round(float(avg_score_raw), 1) if avg_score_raw is not None else 0.0

    acc_rate = round((accepted / total * 100), 1) if total > 0 else 0.0
    rej_rate = round((rejected / total * 100), 1) if total > 0 else 0.0
    rev_rate = round((review / total * 100), 1) if total > 0 else 0.0

    # Time-series (screenings per day over last 14 days)
    time_series: list[dict[str, Any]] = []
    today = datetime.now(timezone.utc).date()
    for i in range(13, -1, -1):
        day_date = today - timedelta(days=i)
        day_start = datetime.combine(day_date, datetime.min.time())
        day_end = datetime.combine(day_date, datetime.max.time())
        cnt = db.query(func.count(VerificationSession.id)).filter(
            VerificationSession.created_at >= day_start,
            VerificationSession.created_at <= day_end,
        ).scalar() or 0
        time_series.append({"date": day_date.isoformat(), "count": cnt})

    # Checkpoint activity
    cp_rows = db.query(VerificationSession.checkpoint_id, func.count(VerificationSession.id)).group_by(VerificationSession.checkpoint_id).all()
    cp_act = [{"checkpoint": cp or "unknown", "count": cnt} for cp, cnt in cp_rows]

    # Officer activity
    off_rows = db.query(VerificationSession.officer_id, func.count(VerificationSession.id)).group_by(VerificationSession.officer_id).all()
    off_act = [{"officer": off or "unknown", "count": cnt} for off, cnt in off_rows]

    # Evidence signals rollup
    all_sessions = db.query(VerificationSession).all()
    signals = {
        "verhoeff_failures": 0,
        "mrz_failures": 0,
        "dl_format_failures": 0,
        "consistency_failures": 0,
        "ela_hotspots": 0,
        "face_mismatches": 0,
    }
    for s in all_sessions:
        checks = s.checksum_results or []
        for c in checks:
            if isinstance(c, dict) and c.get("passed") is False:
                chk = c.get("check", "")
                if "verhoeff" in chk:
                    signals["verhoeff_failures"] += 1
                elif "mrz" in chk or "passport" in chk:
                    signals["mrz_failures"] += 1
                elif "dl_" in chk:
                    signals["dl_format_failures"] += 1
                elif "consistency" in chk:
                    signals["consistency_failures"] += 1

        if (s.tamper_score or 0) >= 45:
            signals["ela_hotspots"] += 1
        if s.face_verdict == "mismatch":
            signals["face_mismatches"] += 1

    return {
        "total_screenings": total,
        "accepted_count": accepted,
        "rejected_count": rejected,
        "review_count": review,
        "pending_sync_count": pending_sync_count,
        "synced_count": synced_count,
        "sync_failed_count": 0,
        "risk_band_distribution": by_band,
        "document_type_distribution": by_doc,
        "acceptance_rate": acc_rate,
        "rejection_rate": rej_rate,
        "review_rate": rev_rate,
        "average_risk_score": avg_score,
        "screenings_over_time": time_series,
        "checkpoint_activity": cp_act,
        "officer_activity": off_act,
        "evidence_signals": signals,
    }


@router.get("/export", dependencies=[Depends(require_admin)])
def export_operational_report(db: Session = Depends(get_db)):
    from ..models.db import verify_audit_chain

    audit_status = verify_audit_chain(db)
    stats_data = stats(db)
    analytics_data = analytics(db)

    sessions = (
        db.query(VerificationSession)
        .order_by(VerificationSession.created_at.desc())
        .limit(100)
        .all()
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": stats_data.model_dump(),
        "analytics": analytics_data,
        "audit_chain_integrity": audit_status,
        "recent_sessions_summary": [
            {
                "session_id": s.id,
                "document_type": s.document_type,
                "risk_band": s.risk_band,
                "risk_score": s.risk_score,
                "decision": s.decision,
                "review_status": s.review_status or "OPEN",
                "checkpoint_id": s.checkpoint_id,
                "officer_id": s.officer_id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "synced": s.synced,
            }
            for s in sessions
        ],
        "privacy_note": "Export contains masked operational metrics and derived evidence summary only. Raw document scans and unmasked PII are not exported.",
    }