"""SQLAlchemy models — local SQLite in field mode, mirrored to Postgres in HQ mode.

Nothing in this schema holds a raw image. Only extracted fields (with identity
numbers masked), scores, reasons and outcomes are persisted.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session

from .. import config


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# RegisteredDevice — pre-provisioned device identity records.
#
# device_id       : unique device identifier sent in X-VeriShield-Device header
# checkpoint_id   : the checkpoint this device is authorized for (FK → checkpoints)
# officer_badge   : the officer badge this device is authorized for
# public_key_spki_b64 : ECDSA P-256 public key, SPKI DER, base64-encoded
# algorithm       : always "ECDSA-P256-SHA256" for SIH prototype
# status          : "active" | "revoked"
# created_at      : provisioning timestamp
#
# Devices are provisioned by an enrollment authority — never auto-created from
# sync requests. The client cannot supply its own authoritative public key.
# ---------------------------------------------------------------------------
class RegisteredDevice(Base):
    __tablename__ = "registered_devices"

    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"), nullable=False)
    officer_badge: Mapped[str] = mapped_column(String(60), nullable=False)
    public_key_spki_b64: Mapped[str] = mapped_column(Text, nullable=False)
    algorithm: Mapped[str] = mapped_column(String(32), nullable=False, default="ECDSA-P256-SHA256")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active | revoked | suspended
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# DeviceEnrollment — one-time controlled enrollment authorization records.
#
# Represents a server-provisioned invitation for a specific field device.
# Stores SHA-256 hash of the enrollment code (raw code is never stored).
# ---------------------------------------------------------------------------
class DeviceEnrollment(Base):
    __tablename__ = "device_enrollments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    enrollment_code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"), nullable=False)
    officer_badge: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")  # pending | used | expired | revoked
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


def hash_enrollment_code(raw_code: str) -> str:
    """Compute deterministic SHA-256 hash of an enrollment code."""
    import hashlib
    normalized = raw_code.strip().upper()
    return hashlib.sha256(normalized.encode()).hexdigest()



class Checkpoint(Base):
    __tablename__ = "checkpoints"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str | None] = mapped_column(String(240))

    officers: Mapped[list["Officer"]] = relationship(back_populates="checkpoint")
    sessions: Mapped[list["VerificationSession"]] = relationship(back_populates="checkpoint")


class Officer(Base):
    __tablename__ = "officers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    badge_id: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    checkpoint_id: Mapped[str | None] = mapped_column(ForeignKey("checkpoints.id"))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    checkpoint: Mapped[Checkpoint | None] = relationship(back_populates="officers")
    sessions: Mapped[list["VerificationSession"]] = relationship(back_populates="officer")


class VerificationSession(Base):
    __tablename__ = "verification_sessions"

    # Client-generated id (e.g. VS-260830-AB12C) is the primary key so a sync
    # push is idempotent — pushing the same session twice just updates it.
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_uuid)
    officer_id: Mapped[str | None] = mapped_column(ForeignKey("officers.id"))
    checkpoint_id: Mapped[str | None] = mapped_column(ForeignKey("checkpoints.id"), index=True)
    document_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # Identity numbers here are MASKED (last 4 only). See src/lib/engine/extract.ts.
    extracted_fields: Mapped[dict] = mapped_column(JSON, default=dict)
    identity_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    checksum_results: Mapped[list] = mapped_column(JSON, default=list)
    ocr_confidence: Mapped[float | None] = mapped_column(Float)

    face_match_score: Mapped[float | None] = mapped_column(Float)
    face_verdict: Mapped[str | None] = mapped_column(String(32))
    tamper_score: Mapped[float | None] = mapped_column(Float)
    tamper_verdict: Mapped[str | None] = mapped_column(String(32))
    risk_score: Mapped[float | None] = mapped_column(Float)
    risk_band: Mapped[str | None] = mapped_column(String(16), index=True)
    risk_reasons: Mapped[list] = mapped_column(JSON, default=list)

    decision: Mapped[str | None] = mapped_column(String(32), index=True)
    note: Mapped[str | None] = mapped_column(Text)

    # Case review workflow (Phase 6 / P3.3)
    review_status: Mapped[str] = mapped_column(String(32), default="OPEN", index=True)
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(120))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)   # set on device
    received_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)          # set by HQ on sync
    synced: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    officer: Mapped[Officer | None] = relationship(back_populates="sessions")
    checkpoint: Mapped[Checkpoint | None] = relationship(back_populates="sessions")
    logs: Mapped[list["AuditLog"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("verification_sessions.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor: Mapped[str] = mapped_column(String(120), default="system")
    detail: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    prev_hash: Mapped[str | None] = mapped_column(String(64))
    event_hash: Mapped[str | None] = mapped_column(String(64))

    session: Mapped[VerificationSession | None] = relationship(back_populates="logs")


# --------------------------------------------------------------------------- #
# Engine / session
# --------------------------------------------------------------------------- #

engine = create_engine(
    config.DATABASE_URL, connect_args={"check_same_thread": False}, future=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _hash_password(raw: str) -> str:
    try:
        from passlib.hash import bcrypt

        return bcrypt.using(rounds=10).hash(raw)
    except Exception:  # passlib/bcrypt not installed -- dev fallback
        import hashlib

        return "sha256$" + hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# SIH prototype public keys for pre-provisioned devices.
#
# These are TEST-ONLY keys generated once for the SIH prototype.
# In a Ministry Pilot, devices would be enrolled through an authenticated
# enrollment protocol and public keys stored in a PKI database.
#
# Key material generated with:
#   cryptography.hazmat.primitives.asymmetric.ec.generate_private_key(SECP256R1())
#
# The corresponding private keys are held ONLY in backend/tests/fixtures/
# and are never committed to any production environment.
# ---------------------------------------------------------------------------
_SIH_DEVICE_REGISTRY = [
    {
        "device_id": "DEV-OFFICER-01",
        "checkpoint_id": "cp-demo",
        "officer_badge": "VS-0001",
        # Public key: see backend/tests/fixtures/dev_officer_01_pub.pem
        # Private key: backend/tests/fixtures/dev_officer_01_priv.pem (test only)
        "public_key_spki_b64": (
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqVH7BL5qCUtpp24SepP2k4WUs1+"
            "LrKzZ3sAwY150MzbxZMuIbVBFGSlYdsiKtwXE0AKmsINBvCTUpe1b9Cv5jg=="
        ),
        "algorithm": "ECDSA-P256-SHA256",
        "status": "active",
    },
    {
        "device_id": "DEV-OFFICER-02",
        "checkpoint_id": "cp-demo",
        "officer_badge": "VS-0002",
        # Public key: backend/tests/fixtures/dev_officer_02_pub.pem (test only)
        "public_key_spki_b64": (
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+0/rc8psfUcBQbEG+KBglNCEujp/"
            "SwlGG++03PWO26Jx3Ua3rZW3kCTBZcUCi5d09kR17GBVCqOSBJZNYoN0iQ=="
        ),
        "algorithm": "ECDSA-P256-SHA256",
        "status": "active",
    },
    {
        "device_id": "DEV-OFFICER-03",
        "checkpoint_id": "cp-demo",
        "officer_badge": "VS-0003",
        # Public key: backend/tests/fixtures/dev_officer_03_pub.pem (test only)
        "public_key_spki_b64": (
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE3RNTXrhEw+QUp/eDeOOUkqlEC55k"
            "GgCc7eTW+rARVGjwiNNd21PCTEJrTCykpFah59dV0Killb4y7n22rrxlpg=="
        ),
        "algorithm": "ECDSA-P256-SHA256",
        "status": "active",
    },
    {
        "device_id": "DEV-OFFICER-04",
        "checkpoint_id": "cp-demo",
        "officer_badge": "VS-0004",
        # Public key: backend/tests/fixtures/dev_officer_04_pub.pem (test only)
        "public_key_spki_b64": (
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEiM21n3UtegCtgvXVieNApxB5v0Gw"
            "sl/kle+neRauKmIGAH1FfzRMU+HkotuChMMf1+zxh+IuOJh4qunuyZHnvg=="
        ),
        "algorithm": "ECDSA-P256-SHA256",
        "status": "active",
    },
    {
        "device_id": "DEV-OFFICER-05",
        "checkpoint_id": "cp-demo",
        "officer_badge": "VS-0005",
        # Public key: backend/tests/fixtures/dev_officer_05_pub.pem (test only)
        "public_key_spki_b64": (
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE88VEMHjG+oJ2FxzPWY8yiLA6V2VN"
            "RwWONXNJSLmzXy37NzDuo9n8sgEWgK+ppG8vjlXSyCwEGNE77t0tcymNRA=="
        ),
        "algorithm": "ECDSA-P256-SHA256",
        "status": "active",
    },
]


def init_db() -> None:
    """Create tables and seed demo checkpoint, officer, and device registry."""
    from sqlalchemy import text

    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)

    # Apply incremental schema migrations for pre-existing databases
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(audit_log)")).fetchall()
        cols = {row[1] for row in res}
        if "prev_hash" not in cols:
            conn.execute(text("ALTER TABLE audit_log ADD COLUMN prev_hash VARCHAR(64)"))
        if "event_hash" not in cols:
            conn.execute(text("ALTER TABLE audit_log ADD COLUMN event_hash VARCHAR(64)"))

        res_sess = conn.execute(text("PRAGMA table_info(verification_sessions)")).fetchall()
        sess_cols = {row[1] for row in res_sess}
        if "review_status" not in sess_cols:
            conn.execute(
                text("ALTER TABLE verification_sessions ADD COLUMN review_status VARCHAR(32) DEFAULT 'OPEN'")
            )
        if "review_notes" not in sess_cols:
            conn.execute(text("ALTER TABLE verification_sessions ADD COLUMN review_notes TEXT"))
        if "reviewed_by" not in sess_cols:
            conn.execute(text("ALTER TABLE verification_sessions ADD COLUMN reviewed_by VARCHAR(120)"))
        if "reviewed_at" not in sess_cols:
            conn.execute(text("ALTER TABLE verification_sessions ADD COLUMN reviewed_at DATETIME"))
        conn.commit()

    with SessionLocal() as db:
        # Seed demo checkpoint
        if not db.get(Checkpoint, "cp-demo"):
            cp = Checkpoint(
                id="cp-demo", name="Attari Integrated Check Post", location="Punjab, India"
            )
            db.add(cp)
            db.commit()

        # Seed load-test officers VS-0001 through VS-0005
        _LOAD_TEST_OFFICERS = [
            {"id": "off-demo",  "name": "Demo Officer 1",  "badge_id": "VS-0001"},
            {"id": "off-lt-02", "name": "Load Test Officer 2", "badge_id": "VS-0002"},
            {"id": "off-lt-03", "name": "Load Test Officer 3", "badge_id": "VS-0003"},
            {"id": "off-lt-04", "name": "Load Test Officer 4", "badge_id": "VS-0004"},
            {"id": "off-lt-05", "name": "Load Test Officer 5", "badge_id": "VS-0005"},
        ]
        for o in _LOAD_TEST_OFFICERS:
            existing_off = db.get(Officer, o["id"])
            if not existing_off:
                db.add(Officer(
                    id=o["id"],
                    name=o["name"],
                    badge_id=o["badge_id"],
                    checkpoint_id="cp-demo",
                    password_hash=_hash_password(uuid.uuid4().hex),
                ))
        db.commit()

        # Seed pre-provisioned device registry
        for entry in _SIH_DEVICE_REGISTRY:
            existing = db.get(RegisteredDevice, entry["device_id"])
            if not existing:
                db.add(RegisteredDevice(**entry))
            else:
                existing.status = entry.get("status", "active")
                existing.public_key_spki_b64 = entry["public_key_spki_b64"]
                existing.checkpoint_id = entry["checkpoint_id"]
                existing.officer_badge = entry["officer_badge"]
        db.commit()

        # Seed demo device enrollments for browser setup and automated tests
        from datetime import timedelta
        demo_enrollments = [
            {
                "enrollment_code_hash": hash_enrollment_code("VS-ENROLL-DEMO-01"),
                "device_id": "DEV-OFFICER-01",
                "checkpoint_id": "cp-demo",
                "officer_badge": "VS-0001",
                "expires_at": utcnow() + timedelta(days=30),
                "status": "pending",
                "used_at": None,
            },
            {
                "enrollment_code_hash": hash_enrollment_code("VS-ENROLL-DEMO-02"),
                "device_id": "DEV-OFFICER-02",
                "checkpoint_id": "cp-demo",
                "officer_badge": "VS-0001",
                "expires_at": utcnow() + timedelta(days=30),
                "status": "pending",
                "used_at": None,
            },
            {
                "enrollment_code_hash": hash_enrollment_code("VS-ENROLL-DEMO-03"),
                "device_id": "DEV-OFFICER-03",
                "checkpoint_id": "cp-demo",
                "officer_badge": "VS-0001",
                "expires_at": utcnow() + timedelta(days=30),
                "status": "pending",
                "used_at": None,
            },
            {
                "enrollment_code_hash": hash_enrollment_code("VS-ENROLL-EXPIRED"),
                "device_id": "DEV-OFFICER-03",
                "checkpoint_id": "cp-demo",
                "officer_badge": "VS-0001",
                "expires_at": utcnow() - timedelta(days=1),
                "status": "pending",
                "used_at": None,
            },
            {
                "enrollment_code_hash": hash_enrollment_code("VS-ENROLL-USED"),
                "device_id": "DEV-OFFICER-04",
                "checkpoint_id": "cp-demo",
                "officer_badge": "VS-0001",
                "expires_at": utcnow() + timedelta(days=30),
                "status": "used",
                "used_at": utcnow() - timedelta(days=1),
            },
        ]
        for en in demo_enrollments:
            existing_en = db.query(DeviceEnrollment).filter_by(enrollment_code_hash=en["enrollment_code_hash"]).first()
            if not existing_en:
                db.add(DeviceEnrollment(**en))
            else:
                existing_en.status = en["status"]
                existing_en.expires_at = en["expires_at"]
                existing_en.used_at = en["used_at"]
                existing_en.device_id = en["device_id"]
        db.commit()

    # Reload the in-memory device registry in sync.py
    try:
        from ..api.sync import _load_device_registry
        _load_device_registry()
    except Exception:
        pass  # sync module may not be loaded yet during tests


GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


def compute_event_hash(
    session_id: str | None,
    action: str,
    actor: str,
    detail: str | None,
    timestamp: datetime,
    prev_hash: str,
) -> str:
    import hashlib

    ts_str = timestamp.strftime("%Y-%m-%dT%H:%M:%S")
    raw = f"{session_id or ''}|{action}|{actor}|{detail or ''}|{ts_str}|{prev_hash}"
    return hashlib.sha256(raw.encode()).hexdigest()


import threading

_AUDIT_LOCK = threading.Lock()


def log(
    db: Session,
    session_id: str | None,
    action: str,
    actor: str = "system",
    detail: str | None = None,
    commit: bool = True,
) -> AuditLog:
    """Write a tamper-evident audit log entry.

    Args:
        commit: If True (default), commits the entry immediately as a standalone
                transaction. Set to False when called inside an existing transaction
                that will be committed by the caller — this allows the session record
                and its audit events to land atomically.
    """
    with _AUDIT_LOCK:
        last_log = db.query(AuditLog).filter(AuditLog.event_hash.isnot(None)).order_by(AuditLog.id.desc()).first()
        prev_hash = last_log.event_hash if (last_log and last_log.event_hash) else GENESIS_HASH
        ts = utcnow().replace(microsecond=0)
        ev_hash = compute_event_hash(session_id, action, actor, detail, ts, prev_hash)

        entry = AuditLog(
            session_id=session_id,
            action=action,
            actor=actor,
            detail=detail,
            timestamp=ts,
            prev_hash=prev_hash,
            event_hash=ev_hash,
        )
        db.add(entry)
        if commit:
            db.commit()
        return entry


def verify_audit_chain(db: Session) -> dict:
    logs = db.query(AuditLog).filter(AuditLog.event_hash.isnot(None)).order_by(AuditLog.id.asc()).all()
    if not logs:
        return {"status": "VALID", "total_events": 0, "detail": "Audit chain is empty."}

    expected_prev = GENESIS_HASH
    for l in logs:
        if l.prev_hash != expected_prev:
            return {
                "status": "INVALID",
                "failed_at_id": l.id,
                "detail": f"Previous hash mismatch at log ID {l.id}. Expected {expected_prev}, found {l.prev_hash}.",
            }
        recomputed = compute_event_hash(
            l.session_id, l.action, l.actor, l.detail, l.timestamp, l.prev_hash
        )
        if l.event_hash != recomputed:
            return {
                "status": "INVALID",
                "failed_at_id": l.id,
                "detail": f"Event hash tampering detected at log ID {l.id}.",
            }
        expected_prev = l.event_hash

    return {
        "status": "VALID",
        "total_events": len(logs),
        "detail": f"Tamper-evident audit hash chain verified successfully ({len(logs)} events verified).",
    }