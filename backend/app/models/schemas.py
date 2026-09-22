"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DocumentType = Literal["aadhaar", "passport", "dl"]
Decision = Literal["cleared", "referred", "rejected"]


class UploadResponse(BaseModel):
    document_id: str
    document_type: DocumentType
    size_bytes: int
    content_type: str
    expires_in_seconds: int
    note: str = (
        "The image is held in volatile storage only and is deleted when the "
        "session closes or the TTL expires. It is never written to the database."
    )


class CheckItem(BaseModel):
    check: str
    passed: bool | None
    detail: str
    is_ai: bool = False


class OcrResponse(BaseModel):
    document_id: str
    document_type: DocumentType
    raw_text: str
    fields: dict[str, Any]
    mean_confidence: float
    word_count: int
    engine: str
    is_ai: bool = True
    method: str


class ValidateResponse(BaseModel):
    document_id: str
    session_id: str
    document_type: DocumentType
    fields: dict[str, Any]
    checks: list[CheckItem]
    summary: dict[str, Any]
    disclaimer: str = (
        "Structural and checksum validation is deterministic arithmetic, not AI. "
        "A pass means the number is well-formed — it does not prove the document "
        "is genuine. The officer is the final decision-maker."
    )


class SessionOut(BaseModel):
    id: str
    officer_id: str | None
    document_type: str
    extracted_fields: dict[str, Any]
    checksum_results: list[dict[str, Any]]
    ocr_confidence: float | None
    face_match_score: float | None
    tamper_score: float | None
    risk_score: float | None
    risk_reasons: list[Any]
    decision: str | None
    created_at: datetime
    synced: bool

    class Config:
        from_attributes = True


class DecisionRequest(BaseModel):
    decision: Decision
    officer_id: str | None = None
    note: str | None = Field(default=None, max_length=500)


# --------------------------------------------------------------------------- #
# HQ sync — payload pushed from the officer's device once it has connectivity.
# The device has already computed every score locally; this just carries the
# verdicts, never raw images.
# --------------------------------------------------------------------------- #

class SyncEventIn(BaseModel):
    action: str = Field(..., max_length=100)
    detail: str | None = Field(default=None, max_length=1000)


class SyncSessionIn(BaseModel):
    session_id: str = Field(..., min_length=4, max_length=64)
    officer_badge: str = Field(..., min_length=2, max_length=60)
    officer_name: str | None = Field(default=None, max_length=120)
    checkpoint: str = Field(..., min_length=2, max_length=64)
    checkpoint_label: str | None = Field(default=None, max_length=120)
    document_type: DocumentType
    extracted_fields: dict[str, Any] = {}
    checksum_results: list[dict[str, Any]] = []
    ocr_confidence: float | None = None
    face_match_score: float | None = None
    face_verdict: str | None = Field(default=None, max_length=50)
    tamper_score: float | None = None
    tamper_verdict: str | None = Field(default=None, max_length=50)
    risk_score: float | None = None
    risk_band: str | None = Field(default=None, max_length=50)
    risk_reasons: list[Any] = []
    decision: Decision | None = None
    note: str | None = Field(default=None, max_length=1000)
    client_created_at: datetime | None = None
    events: list[SyncEventIn] = []


class SyncSessionOut(BaseModel):
    session_id: str
    stored: bool
    received_at: datetime


# --------------------------------------------------------------------------- #
# HQ admin
# --------------------------------------------------------------------------- #

class AdminLoginRequest(BaseModel):
    passcode: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    token: str
    expires_in: int


class AdminSessionOut(BaseModel):
    id: str
    officer_badge: str | None
    officer_name: str | None
    checkpoint: str | None
    document_type: str
    extracted_fields: dict[str, Any]
    ocr_confidence: float | None
    face_match_score: float | None
    face_verdict: str | None
    tamper_score: float | None
    tamper_verdict: str | None
    risk_score: float | None
    risk_band: str | None
    risk_reasons: list[Any]
    decision: str | None
    note: str | None
    review_status: str = "OPEN"
    review_notes: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    received_at: datetime | None
    synced: bool


class AuditLogOut(BaseModel):
    action: str
    actor: str
    detail: str | None
    timestamp: datetime
    session_id: str | None = None


class AdminSessionDetail(AdminSessionOut):
    audit_log: list[AuditLogOut] = []


class AdminStatsOut(BaseModel):
    total_sessions: int
    by_decision: dict[str, int]
    by_band: dict[str, int]
    by_checkpoint: dict[str, int]
    by_document_type: dict[str, int]
    avg_risk_score: float | None
    pending_review: int
    last_24h: int


class ChatMessage(BaseModel):
    sender: Literal["user", "assistant"]
    text: str
    timestamp: str | None = None


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    context: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    reply: str
    suggested_actions: list[str] = []
    sources: list[str] = []


# --------------------------------------------------------------------------- #
# Device enrollment
# --------------------------------------------------------------------------- #

class DeviceEnrollIn(BaseModel):
    enrollment_code: str = Field(..., min_length=4, max_length=128)
    device_id: str = Field(..., min_length=2, max_length=64)
    public_key: str = Field(..., min_length=10)
    algorithm: str = Field(default="ECDSA-P256-SHA256")
    challenge_signature: str = Field(..., min_length=10)


class DeviceEnrollOut(BaseModel):
    enrolled: bool
    device_id: str
    checkpoint_id: str
    officer_badge: str
    enrolled_at: datetime


# --------------------------------------------------------------------------- #
# Case Review & Operational Analytics (P3.3)
# --------------------------------------------------------------------------- #

ReviewStatus = Literal["OPEN", "UNDER_REVIEW", "CLEARED", "ESCALATED", "CLOSED"]


class CaseReviewUpdateIn(BaseModel):
    review_status: ReviewStatus
    note: str | None = Field(None, max_length=1000)


class CaseReviewUpdateOut(BaseModel):
    session_id: str
    review_status: str
    review_notes: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None


class OperationalAnalyticsOut(BaseModel):
    total_screenings: int
    accepted_count: int
    rejected_count: int
    review_count: int
    pending_sync_count: int
    synced_count: int
    sync_failed_count: int
    risk_band_distribution: dict[str, int]
    document_type_distribution: dict[str, int]
    acceptance_rate: float
    rejection_rate: float
    review_rate: float
    average_risk_score: float
    screenings_over_time: list[dict[str, Any]]
    checkpoint_activity: list[dict[str, Any]]
    officer_activity: list[dict[str, Any]]
    evidence_signals: dict[str, int]