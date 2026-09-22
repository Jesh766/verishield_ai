"""Document ingest, OCR and validation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import config
from ..models.db import VerificationSession, get_db, log
from ..models.schemas import (
    DecisionRequest, OcrResponse, SessionOut, UploadResponse, ValidateResponse,
)
from ..services import checksum, extract, ocr, storage

router = APIRouter(tags=["documents"])

_SUFFIX = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_TYPES = {"aadhaar", "passport", "dl"}


def _normalise_type(document_type: str) -> str:
    dt = (document_type or "").strip().lower()
    if dt in ("driving_licence", "driving_license"):
        dt = "dl"
    if dt not in _TYPES:
        raise HTTPException(
            400,
            detail=f"Unsupported document type '{document_type}'. "
                   f"Supported: {', '.join(sorted(_TYPES))}.",
        )
    return dt


@router.post("/documents/upload", response_model=UploadResponse)
async def upload(
    file: UploadFile = File(...),
    document_type: str = Form(...),
):
    dt = _normalise_type(document_type)
    data = await file.read()

    if not data:
        raise HTTPException(400, detail="The uploaded file was empty. Capture the document again.")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            detail=f"Image is {len(data) // 1024} KB; the limit is "
                   f"{config.MAX_UPLOAD_BYTES // 1024} KB. Retake at a lower resolution.",
        )

    # Magic byte binary header validation
    is_jpeg = data.startswith(b"\xff\xd8\xff")
    is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP"

    if not (is_jpeg or is_png or is_webp):
        raise HTTPException(
            415,
            detail="Unsupported media format. Upload must be a valid JPEG, PNG, or WebP image binary.",
        )

    # Verify actual PIL image structure
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception as exc:
        raise HTTPException(400, detail="Corrupted or invalid image binary header.") from exc

    ctype = file.content_type or ("image/png" if is_png else "image/webp" if is_webp else "image/jpeg")
    item = storage.save(data, ctype, _SUFFIX.get(ctype, ".jpg"))
    _TYPE_BY_DOC[item.document_id] = dt

    return UploadResponse(
        document_id=item.document_id,
        document_type=dt,
        size_bytes=item.size,
        content_type=ctype,
        expires_in_seconds=config.UPLOAD_TTL_SECONDS,
    )


# document_id -> declared type, held in memory only (dies with the process).
_TYPE_BY_DOC: dict[str, str] = {}
# document_id -> last OCR result, so /validate can reuse it without re-running.
_OCR_CACHE: dict[str, dict] = {}


def _require_doc(document_id: str):
    data = storage.read(document_id)
    if data is None:
        raise HTTPException(
            404,
            detail="That capture has expired or was already cleared from memory. "
                   "Upload the document again.",
        )
    return data


@router.post("/documents/{document_id}/ocr", response_model=OcrResponse)
def run_ocr(document_id: str):
    data = _require_doc(document_id)
    dt = _TYPE_BY_DOC.get(document_id, "aadhaar")

    try:
        result = ocr.run_ocr(data, mrz=(dt == "passport"))
    except ocr.OCRUnavailable as exc:
        raise HTTPException(503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc

    if not result["raw_text"].strip():
        raise HTTPException(
            422,
            detail="No text could be read from that image. Move to even lighting, "
                   "fill the frame with the document, hold steady and retry.",
        )

    fields = extract.extract_fields(dt, result["raw_text"])
    _OCR_CACHE[document_id] = {"result": result, "fields": fields}

    return OcrResponse(
        document_id=document_id,
        document_type=dt,
        raw_text=result["raw_text"],
        fields=fields,
        mean_confidence=result["mean_confidence"],
        word_count=len(result["words"]),
        engine=result["engine"],
        method=result["method"],
    )


@router.post("/documents/{document_id}/validate", response_model=ValidateResponse)
def validate(
    document_id: str,
    db: Session = Depends(get_db),
    x_officer_id: str | None = Header(default=None),
):
    _require_doc(document_id)
    dt = _TYPE_BY_DOC.get(document_id, "aadhaar")

    cached = _OCR_CACHE.get(document_id)
    if not cached:
        raise HTTPException(
            409,
            detail="Run OCR on this document before validating it "
                   "(POST /documents/{id}/ocr).",
        )

    fields = cached["fields"]
    checks = checksum.validate(dt, fields)
    summary = checksum.summarise(checks)

    primary_key = extract.PRIMARY_NUMBER_KEY.get(dt)
    primary_value = fields.get(primary_key) if primary_key else None

    stored_fields = dict(fields)
    if primary_key and primary_value:
        stored_fields[primary_key] = extract.mask_number(primary_value)
    # The MRZ contains the passport number in clear; never persist it.
    stored_fields.pop("mrz_line1", None)
    stored_fields.pop("mrz_line2", None)

    session = VerificationSession(
        officer_id=x_officer_id or "off-demo",
        document_type=dt,
        extracted_fields=stored_fields,
        identity_hash=storage.id_hash(primary_value),
        checksum_results=checks,
        ocr_confidence=cached["result"]["mean_confidence"],
        risk_reasons=[],
    )
    db.add(session)
    db.commit()
    log(db, session.id, "validate", x_officer_id or "off-demo", summary["headline"])

    return ValidateResponse(
        document_id=document_id,
        session_id=session.id,
        document_type=dt,
        fields=fields,
        checks=checks,
        summary=summary,
    )


@router.post("/documents/{document_id}/close")
def close_capture(document_id: str):
    """Officer finished with this capture — wipe the image immediately."""
    purged = storage.purge(document_id)
    _OCR_CACHE.pop(document_id, None)
    _TYPE_BY_DOC.pop(document_id, None)
    return {
        "document_id": document_id,
        "image_deleted": purged,
        "detail": "Raw capture removed from device memory. Extracted fields and "
                  "scores remain in the local session record.",
    }


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.get(VerificationSession, session_id)
    if not session:
        raise HTTPException(404, detail="No verification session with that id on this device.")
    return session


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(limit: int = 50, db: Session = Depends(get_db)):
    return (
        db.query(VerificationSession)
        .order_by(VerificationSession.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )


@router.post("/sessions/{session_id}/decision", response_model=SessionOut)
def record_decision(
    session_id: str, body: DecisionRequest, db: Session = Depends(get_db)
):
    """The officer is always the final decision-maker; the system never auto-rejects."""
    session = db.get(VerificationSession, session_id)
    if not session:
        raise HTTPException(404, detail="No verification session with that id on this device.")
    session.decision = body.decision
    db.commit()
    log(db, session.id, f"decision:{body.decision}", body.officer_id or "off-demo", body.note)
    return session
