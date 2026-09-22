"""End-to-end API round trip against synthetic fixtures (real OCR runs here)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import ocr
from fixtures.generate import generate

OCR_READY = ocr.engine_info().get("available", False)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def samples(tmp_path_factory):
    return generate()


def test_backend_dotenv_is_loaded_for_admin_config(monkeypatch):
    backend_dir = Path(__file__).resolve().parents[1]
    env_path = backend_dir / ".env"
    original = env_path.read_text() if env_path.exists() else None

    try:
        env_path.write_text("VERISHIELD_ADMIN_PASSCODE=dotenv-test-passcode\n")
        monkeypatch.delenv("VERISHIELD_ADMIN_PASSCODE", raising=False)

        import app.config as config
        importlib.reload(config)
        assert config.ADMIN_PASSCODE == "dotenv-test-passcode"
    finally:
        if original is None:
            env_path.unlink(missing_ok=True)
        else:
            env_path.write_text(original)
        monkeypatch.delenv("VERISHIELD_ADMIN_PASSCODE", raising=False)
        import app.config as config
        importlib.reload(config)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["mode"] == "field"


def test_capabilities_is_honest_about_unbuilt_parts(client):
    body = client.get("/capabilities").json()
    names = {c["name"]: c for c in body["components"]}
    face = names["Advisory face similarity"]
    assert face["status"] == "live"
    assert face["is_ai"] is True
    assert "Not authentication" in face["detail"]
    assert names["Authoritative verification gateway"]["status"] == "integration_ready"
    assert names["Aadhaar Verhoeff checksum"]["is_ai"] is False
    assert names["OCR text recognition"]["is_ai"] is True


def test_unbuilt_endpoints_return_501(client):
    assert client.post("/documents/x/face-match").status_code == 501
    assert client.post("/documents/x/risk").status_code == 501
    assert client.post("/assistant/query").status_code == 410
    assert client.post("/sync").status_code == 501


def test_upload_rejects_unknown_document_type(client, samples):
    with open(samples["aadhaar"], "rb") as fh:
        r = client.post(
            "/documents/upload",
            files={"file": ("a.png", fh, "image/png")},
            data={"document_type": "voter_id"},
        )
    assert r.status_code == 400


def test_validate_before_ocr_conflicts(client, samples):
    with open(samples["aadhaar"], "rb") as fh:
        up = client.post(
            "/documents/upload",
            files={"file": ("a.png", fh, "image/png")},
            data={"document_type": "aadhaar"},
        ).json()
    assert client.post(f"/documents/{up['document_id']}/validate").status_code == 409


def test_expired_document_gives_plain_language_error(client):
    r = client.post("/documents/deadbeef/ocr")
    assert r.status_code == 404
    assert "expired" in r.json()["detail"].lower()


@pytest.mark.skipif(not OCR_READY, reason="Tesseract not installed")
def test_aadhaar_round_trip(client, samples):
    with open(samples["aadhaar"], "rb") as fh:
        up = client.post(
            "/documents/upload",
            files={"file": ("a.png", fh, "image/png")},
            data={"document_type": "aadhaar"},
        ).json()
    doc_id = up["document_id"]

    ocr_r = client.post(f"/documents/{doc_id}/ocr")
    assert ocr_r.status_code == 200, ocr_r.text
    assert ocr_r.json()["fields"]["aadhaar_number"]

    val = client.post(f"/documents/{doc_id}/validate")
    assert val.status_code == 200, val.text
    body = val.json()
    assert body["summary"]["status"] == "pass"
    assert body["summary"]["is_ai"] is False

    # Persisted record must carry a masked number and no raw image.
    session = client.get(f"/sessions/{body['session_id']}").json()
    stored = session["extracted_fields"]["aadhaar_number"]
    assert stored.startswith("X") and len(stored) == 12

    # Closing the capture wipes the image.
    assert client.post(f"/documents/{doc_id}/close").json()["image_deleted"] is True
    assert client.post(f"/documents/{doc_id}/ocr").status_code == 404


@pytest.mark.skipif(not OCR_READY, reason="Tesseract not installed")
def test_tampered_aadhaar_is_flagged(client, samples):
    with open(samples["aadhaar_invalid"], "rb") as fh:
        up = client.post(
            "/documents/upload",
            files={"file": ("a.png", fh, "image/png")},
            data={"document_type": "aadhaar"},
        ).json()
    doc_id = up["document_id"]
    client.post(f"/documents/{doc_id}/ocr")
    body = client.post(f"/documents/{doc_id}/validate").json()
    assert body["summary"]["status"] == "fail"


@pytest.mark.skipif(not OCR_READY, reason="Tesseract not installed")
def test_officer_decision_is_recorded(client, samples):
    with open(samples["dl"], "rb") as fh:
        up = client.post(
            "/documents/upload",
            files={"file": ("d.png", fh, "image/png")},
            data={"document_type": "dl"},
        ).json()
    doc_id = up["document_id"]
    client.post(f"/documents/{doc_id}/ocr")
    sid = client.post(f"/documents/{doc_id}/validate").json()["session_id"]

    r = client.post(f"/sessions/{sid}/decision", json={"decision": "referred", "note": "manual"})
    assert r.status_code == 200
    assert r.json()["decision"] == "referred"


@pytest.mark.skipif(not OCR_READY, reason="Tesseract not installed")
def test_passport_round_trip(client, samples):
    with open(samples["passport"], "rb") as fh:
        up = client.post(
            "/documents/upload",
            files={"file": ("p.png", fh, "image/png")},
            data={"document_type": "passport"},
        ).json()
    doc_id = up["document_id"]

    ocr_body = client.post(f"/documents/{doc_id}/ocr").json()
    assert ocr_body["fields"]["passport_number"] == "M1234567"
    assert ocr_body["fields"]["surname"] == "SHARMA"

    body = client.post(f"/documents/{doc_id}/validate").json()
    assert body["summary"]["status"] == "pass", body["summary"]

    # The MRZ (which contains the passport number in clear) is never persisted.
    session = client.get(f"/sessions/{body['session_id']}").json()
    assert "mrz_line2" not in session["extracted_fields"]
