"""Runtime configuration for the VeriShield AI field-mode backend.

FIELD MODE runs entirely on the officer's own device. Nothing here may point
at a remote service on the primary path.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

for _env_path in (
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / ".env.local",
    BASE_DIR / ".env",
    BASE_DIR / ".env.local",
):
    if _env_path.exists():
        load_dotenv(_env_path, override=False)


def _env_first(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value not in (None, ""):
            return value
    return default

# --- Storage -----------------------------------------------------------------
# SQLite lives next to the backend. Only extracted fields, scores and outcomes
# are ever written here -- never raw images (see services/storage.py).
DB_PATH = Path(os.environ.get("VERISHIELD_DB", BASE_DIR / "verishield.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Raw uploads live in a temp dir with a hard TTL and are deleted on session
# close. This is a privacy requirement, not an optimisation.
UPLOAD_DIR = Path(os.environ.get("VERISHIELD_UPLOADS", BASE_DIR / ".uploads"))
UPLOAD_TTL_SECONDS = int(os.environ.get("VERISHIELD_UPLOAD_TTL", 900))  # 15 min
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

# --- OCR ---------------------------------------------------------------------
# Tesseract 5.x is the default engine. EasyOCR is kept behind a flag as a
# fallback if accuracy on Indian documents proves poor (Phase 1 note).
OCR_ENGINE = os.environ.get("VERISHIELD_OCR_ENGINE", "tesseract")
TESSERACT_CMD = os.environ.get("VERISHIELD_TESSERACT_CMD")  # optional override
OCR_LANGS = os.environ.get("VERISHIELD_OCR_LANGS", "eng")

# --- Misc --------------------------------------------------------------------
# Salt for the one-way hash of document numbers (used for cross-document
# matching in Phase 7 without ever storing the number itself).
ID_HASH_SALT = os.environ.get("VERISHIELD_ID_SALT", "verishield-local-dev-salt")

ALLOWED_ORIGINS = os.environ.get(
    "VERISHIELD_CORS",
    "http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173,http://127.0.0.1:8080",
).split(",")

# Admin passcode MUST be set via environment variable. There is no default.
# An empty string disables login (all admin-login attempts return 401).
ADMIN_PASSCODE = _env_first("VERISHIELD_ADMIN_PASSCODE", "ADMIN_PASSCODE", default="")
ADMIN_TOKEN_TTL_SECONDS = int(os.environ.get("VERISHIELD_ADMIN_TOKEN_TTL", 8 * 3600))

ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
ALLOWED_HEADERS = [
    "Content-Type",
    "Authorization",
    "X-VeriShield-Device",
    "X-VeriShield-Timestamp",
    "X-VeriShield-Nonce",
    "X-VeriShield-Signature",
    "X-Correlation-ID",
    "X-Request-ID",
]
