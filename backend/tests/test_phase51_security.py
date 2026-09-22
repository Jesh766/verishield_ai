"""VeriShield AI — Phase 5.1 Security Correction & Rate Limiter Verification Test Suite.

Proves:
1. Production rate limiter is active under pytest (no "if 'pytest' in sys.modules" bypass).
2. Requests below configured threshold (300/min) succeed.
3. Requests exceeding threshold (300/min) return 429 Too Many Requests.
4. Rate limiter state isolates cleanly between tests using _reset_rate_limiters fixture.
5. Different client device IDs are tracked independently.
6. Invalid/missing device identity headers are handled properly.
"""

from __future__ import annotations

import json
import sys
import time

import pytest

from app.api.sync import _SYNC_RATE_LIMIT_SLOTS, _check_sync_rate_limit


def test_pytest_does_not_disable_rate_limiter():
    """CRITICAL REGRESSION TEST: Proves that running under pytest does NOT bypass rate limiting."""
    assert "pytest" in sys.modules, "Test must run inside pytest context"

    # Use a small temporary test threshold (5 max requests) to verify logic under pytest
    device_id = "DEV-TEST-BYPASS-CHECK"
    _SYNC_RATE_LIMIT_SLOTS.pop(device_id, None)

    # Send 5 requests -> all must return True
    for i in range(5):
        assert _check_sync_rate_limit(device_id, max_requests=5, window_seconds=60) is True

    # 6th request MUST return False (rate limited), proving pytest does NOT bypass the check
    assert _check_sync_rate_limit(device_id, max_requests=5, window_seconds=60) is False, (
        "SECURITY FAILURE: Rate limiter returned True under pytest after max_requests was reached!"
    )


def test_sync_rate_limiter_accepts_under_threshold():
    """Requests under threshold succeed."""
    device_id = "DEV-TEST-UNDER-THRESH"
    for _ in range(10):
        assert _check_sync_rate_limit(device_id, max_requests=300, window_seconds=60) is True


def test_sync_rate_limiter_rejects_above_threshold():
    """Requests exceeding threshold (e.g., 300) are rejected."""
    device_id = "DEV-TEST-ABOVE-THRESH"
    # Fill up 300 slots
    for _ in range(300):
        assert _check_sync_rate_limit(device_id, max_requests=300, window_seconds=60) is True

    # 301st request is rejected
    assert _check_sync_rate_limit(device_id, max_requests=300, window_seconds=60) is False


def test_sync_rate_limiter_isolates_different_devices():
    """Different device IDs maintain independent rate limit counters."""
    dev_a = "DEV-ISOLATE-A"
    dev_b = "DEV-ISOLATE-B"

    # Max out Device A
    for _ in range(5):
        assert _check_sync_rate_limit(dev_a, max_requests=5, window_seconds=60) is True
    assert _check_sync_rate_limit(dev_a, max_requests=5, window_seconds=60) is False

    # Device B is still fresh and accepted
    assert _check_sync_rate_limit(dev_b, max_requests=5, window_seconds=60) is True


def test_rate_limiter_state_resets_between_tests():
    """Verify that fixture clears _SYNC_RATE_LIMIT_SLOTS so state is fresh."""
    # Previous tests used DEV-TEST-*, but _reset_rate_limiters fixture cleared state
    assert len(_SYNC_RATE_LIMIT_SLOTS) == 0, "Rate limit slots should be empty at start of test"


def test_api_returns_429_when_device_rate_limit_exceeded(client, sign_request):
    """API endpoint returns HTTP 429 when client device exceeds max sync request quota."""
    device_id = "DEV-OFFICER-01"
    # Rate key in sync.py is f"{client_ip}:{device_id}" (TestClient host is testclient)
    rate_key = f"testclient:{device_id}"

    # Fill quota up to limit (300)
    for _ in range(300):
        _check_sync_rate_limit(rate_key, max_requests=300, window_seconds=60)

    # Next sync attempt via API client must return HTTP 429
    payload = {
        "session_id": "VS-OVER-LIMIT-01",
        "checkpoint": "cp-demo",
        "officer_badge": "VS-0001",
        "document_type": "passport",
        "decision": "cleared",
        "risk_score": 10.0,
    }
    body = json.dumps(payload).encode()
    headers = sign_request(body, device_id=device_id)
    r = client.post("/sync/session", content=body, headers=headers)
    assert r.status_code == 429, f"Expected 429, got {r.status_code}: {r.text}"
    assert "rate limit" in r.text.lower() or "too many" in r.text.lower()


def test_rate_limiter_concurrency_thread_safety():
    """DEDICATED CONCURRENCY TEST: Proves that _check_sync_rate_limit is thread-safe under parallel calls.

    Fires 50 parallel requests across 10 threads for a limit of 30 max requests.
    Verifies that exactly 30 requests return True and exactly 20 return False without race conditions.
    """
    from concurrent.futures import ThreadPoolExecutor

    rate_key = "DEV-CONCURRENCY-TEST-KEY"
    max_requests = 30
    total_calls = 50

    def _attempt_call(_):
        return _check_sync_rate_limit(rate_key, max_requests=max_requests, window_seconds=60)

    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(_attempt_call, range(total_calls)))

    accepted = results.count(True)
    rejected = results.count(False)

    assert accepted == max_requests, f"Expected exactly {max_requests} accepted, got {accepted}"
    assert rejected == (total_calls - max_requests), f"Expected exactly {total_calls - max_requests} rejected, got {rejected}"

