"""Shared pytest fixtures for VeriShield backend test suite.

Provides:
  - client: FastAPI TestClient with initialized DB
  - ecdsa_private_key: ECDSA P-256 private key for DEV-OFFICER-01 (test fixture)
  - sign_request: helper that signs a sync request body and returns headers

Test/production key separation:
  - The private key lives in backend/tests/fixtures/dev_officer_01_priv.pem
  - The corresponding public key is seeded into the DB by init_db() via _SIH_DEVICE_REGISTRY
  - No HMAC secret is used anywhere in the test suite
"""

from __future__ import annotations

# Suppress StarletteDeprecationWarning from FastAPI test client (httpx compat)
# This warning fires at module import time before pytest filterwarnings applies.
# Root cause: FastAPI 0.141.1 requires httpx2 for starlette.testclient.
# Suppressed here to keep test output clean; tests remain functionally correct.
import warnings
warnings.filterwarnings("ignore", category=Warning, module="starlette")

import base64
import hashlib
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Load test private key once for the session
_PRIV_KEY_PEM = (FIXTURES_DIR / "dev_officer_01_priv.pem").read_bytes()


def _load_private_key():
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    return load_pem_private_key(_PRIV_KEY_PEM, password=None)


def _sign_canonical(private_key, device_id: str, timestamp: str, nonce: str, body_bytes: bytes) -> str:
    """Sign the canonical sync string with ECDSA P-256 / SHA-256.

    Returns base64-encoded DER signature — the same format WebCrypto produces.
    Canonical: POST\\n/sync/session\\nTIMESTAMP\\nNONCE\\nBODY_SHA256_HEX\\nDEVICE_ID
    """
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec

    body_hash = hashlib.sha256(body_bytes).hexdigest()
    canonical = f"POST\n/sync/session\n{timestamp}\n{nonce}\n{body_hash}\n{device_id}"
    sig_bytes = private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig_bytes).decode()


@pytest.fixture(scope="session")
def ecdsa_private_key():
    """Session-scoped ECDSA private key for DEV-OFFICER-01."""
    return _load_private_key()


@pytest.fixture(scope="module")
def client():
    """FastAPI TestClient with a clean initialized database."""
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    """Provides a fresh database session for unit tests."""
    from app.models.db import SessionLocal
    with SessionLocal() as db:
        yield db


@pytest.fixture(scope="session")
def sign_request(ecdsa_private_key):
    """Returns a factory that builds ECDSA-signed headers for sync requests."""

    def _sign(body_bytes: bytes, device_id: str = "DEV-OFFICER-01") -> dict:
        timestamp = str(int(time.time()))
        nonce = f"nonce-{time.time_ns()}"
        signature = _sign_canonical(ecdsa_private_key, device_id, timestamp, nonce, body_bytes)
        return {
            "X-VeriShield-Device": device_id,
            "X-VeriShield-Timestamp": timestamp,
            "X-VeriShield-Nonce": nonce,
            "X-VeriShield-Signature": signature,
            "Content-Type": "application/json",
        }

    return _sign


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Isolate rate limiter state between tests.

    Clears process-local rate limit slots before and after each test run so tests
    execute against the real production rate-limiting logic without inter-test pollution.
    """
    from app.api.admin import _FAILED_LOGIN_ATTEMPTS
    from app.api.sync import _SYNC_RATE_LIMIT_SLOTS
    _SYNC_RATE_LIMIT_SLOTS.clear()
    _FAILED_LOGIN_ATTEMPTS.clear()
    yield
    _SYNC_RATE_LIMIT_SLOTS.clear()
    _FAILED_LOGIN_ATTEMPTS.clear()

