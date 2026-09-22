"""VeriShield AI — Repeatable API Load Testing Engine.

DEVELOPMENT / TEST TOOL ONLY:
  This script uses local test private key fixtures from backend/tests/fixtures/.
  Fixtures are intentionally excluded from distributable submission archives.
  This tool is for developer benchmarks and MUST NOT be used with production credentials.

Authentication: ECDSA P-256 / SHA-256 (matching production sync protocol).
Each simulated device uses its own distinct private key fixture and is registered
in the HQ device registry with a different public key.
No HMAC secret or shared key is used.

Multi-device mode (--devices N):
  Each device uses its own private key (dev_officer_0N_priv.pem) and its own
  officer badge (VS-000N). The server verifies each signature against the
  corresponding registered public key independently.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Test ECDSA key registry for load testing
# Each device has its own key pair in backend/tests/fixtures/
# The HQ device registry has each device's corresponding public key.
# ---------------------------------------------------------------------------
_FIXTURES_DIR = Path(__file__).parent.parent / "backend" / "tests" / "fixtures"

# Load-test device registry: device_id → (officer_badge, priv_key_filename)
_TEST_DEVICE_REGISTRY = {
    "DEV-OFFICER-01": {"badge": "VS-0001", "key_file": "dev_officer_01_priv.pem", "checkpoint": "cp-demo"},
    "DEV-OFFICER-02": {"badge": "VS-0002", "key_file": "dev_officer_02_priv.pem", "checkpoint": "cp-demo"},
    "DEV-OFFICER-03": {"badge": "VS-0003", "key_file": "dev_officer_03_priv.pem", "checkpoint": "cp-demo"},
    "DEV-OFFICER-04": {"badge": "VS-0004", "key_file": "dev_officer_04_priv.pem", "checkpoint": "cp-demo"},
    "DEV-OFFICER-05": {"badge": "VS-0005", "key_file": "dev_officer_05_priv.pem", "checkpoint": "cp-demo"},
}

# Cache of loaded private keys — loaded lazily on first use
_KEY_CACHE: dict[str, object] = {}


def _load_device_key(device_id: str):
    """Load and cache ECDSA private key for a test device."""
    if device_id in _KEY_CACHE:
        return _KEY_CACHE[device_id]
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    key_file = _FIXTURES_DIR / _TEST_DEVICE_REGISTRY[device_id]["key_file"]
    if not key_file.exists():
        raise FileNotFoundError(
            f"Test fixture not found: {key_file}\n"
            f"Run: python scripts/generate_test_keys.py to create fixtures."
        )
    key = load_pem_private_key(key_file.read_bytes(), password=None)
    _KEY_CACHE[device_id] = key
    return key


def _sign_request(private_key, device_id: str, timestamp: str, nonce: str, body_bytes: bytes) -> str:
    """Sign canonical sync string with ECDSA P-256 / SHA-256.

    Canonical format: POST\\n/sync/session\\nTIMESTAMP\\nNONCE\\nBODY_SHA256_HEX\\nDEVICE_ID
    """
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    canonical = f"POST\n/sync/session\n{timestamp}\n{nonce}\n{body_hash}\n{device_id}"
    sig_bytes = private_key.sign(canonical.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig_bytes).decode()


def send_sync_request(base_url: str, device_id: str, req_idx: int) -> tuple[int | str, float]:
    """Send a single authenticated sync request.

    Returns:
        (status_code_or_error_type, latency_ms)
        status_code: int (HTTP status) or 'timeout' or 'error'
    """
    device = _TEST_DEVICE_REGISTRY[device_id]
    badge = device["badge"]
    checkpoint = device["checkpoint"]
    session_id = f"VS-LOAD-{device_id}-R{req_idx}-{time.time_ns()}"

    payload = {
        "session_id": session_id,
        "officer_badge": badge,
        "checkpoint": checkpoint,
        "document_type": "passport",
        "extracted_fields": {"passport_number": f"Z{req_idx:06d}"},
        "checksum_results": [],
        "ocr_confidence": 95.0,
        "face_match_score": 90.0,
        "face_verdict": "match",
        "tamper_score": 10.0,
        "tamper_verdict": "clean",
        "risk_score": 15.0,
        "risk_band": "clear",
        "risk_reasons": [],
        "decision": "cleared",
        "note": "Load test — synthetic data",
        "events": [],
    }

    body_bytes = json.dumps(payload).encode("utf-8")
    timestamp = str(int(time.time()))
    nonce = f"nonce-lt-{device_id}-{req_idx}-{time.time_ns()}"
    private_key = _load_device_key(device_id)
    signature = _sign_request(private_key, device_id, timestamp, nonce, body_bytes)

    headers = {
        "Content-Type": "application/json",
        "X-VeriShield-Device": device_id,
        "X-VeriShield-Timestamp": timestamp,
        "X-VeriShield-Nonce": nonce,
        "X-VeriShield-Signature": signature,
    }

    url = f"{base_url.rstrip('/')}/sync/session"
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")

    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            t1 = time.perf_counter()
            return resp.status, (t1 - t0) * 1000
    except urllib.error.HTTPError as e:
        t1 = time.perf_counter()
        return e.code, (t1 - t0) * 1000
    except TimeoutError:
        t1 = time.perf_counter()
        return "timeout", (t1 - t0) * 1000
    except Exception as e:
        t1 = time.perf_counter()
        return "error", (t1 - t0) * 1000


def _summarise_statuses(statuses: list[int | str]) -> dict:
    """Return a dict with counts for each HTTP status and error type."""
    counts: dict[str, int] = {}
    for s in statuses:
        key = str(s)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = int(round((len(sorted_vals) - 1) * pct))
    return round(sorted_vals[max(0, min(idx, len(sorted_vals) - 1))], 2)


def run_load_test(
    base_url: str = "http://127.0.0.1:8000",
    concurrency: int = 10,
    total_requests: int = 100,
    num_devices: int = 1,
) -> dict:
    # Determine which devices to use
    device_ids = list(_TEST_DEVICE_REGISTRY.keys())[:num_devices]
    if not device_ids:
        print("ERROR: No test devices available.", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print(f"VeriShield AI Load Test — Target: {base_url}")
    print(f"Concurrency : {concurrency} workers")
    print(f"Requests    : {total_requests}")
    print(f"Devices     : {num_devices} ({', '.join(device_ids)})")
    print(f"Auth        : ECDSA P-256 per device (distinct key pairs)")
    print(f"Note        : localhost benchmark — network latency excluded")
    print("=" * 60)

    # Pre-load all keys before the timed section
    for did in device_ids:
        _load_device_key(did)

    latencies: list[float] = []
    status_codes: list[int | str] = []

    t_start = time.perf_counter()

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [
            executor.submit(
                send_sync_request,
                base_url,
                device_ids[i % num_devices],
                i,
            )
            for i in range(total_requests)
        ]
        for f in concurrent.futures.as_completed(futures):
            status, lat = f.result()
            latencies.append(lat)
            status_codes.append(status)

    t_total = time.perf_counter() - t_start
    rps = total_requests / t_total if t_total > 0 else 0

    sorted_lat = sorted(latencies)
    p50 = _percentile(sorted_lat, 0.50)
    p95 = _percentile(sorted_lat, 0.95)
    p99 = _percentile(sorted_lat, 0.99)
    avg_lat = round(statistics.mean(sorted_lat), 2) if sorted_lat else 0

    status_dist = _summarise_statuses(status_codes)
    success_count = status_dist.get("200", 0)
    failure_count = total_requests - success_count
    err_rate = (failure_count / total_requests) * 100 if total_requests > 0 else 0

    print(f"\n--- LOAD TEST RESULTS ---")
    print(f"Total Time     : {t_total:.2f} seconds")
    print(f"Throughput     : {rps:.2f} req/sec")
    print(f"Success (200)  : {success_count} / {total_requests}")
    print(f"Error Rate     : {err_rate:.2f}%")
    print(f"Avg Latency    : {avg_lat:.2f} ms")
    print(f"p50 Latency    : {p50:.2f} ms")
    print(f"p95 Latency    : {p95:.2f} ms")
    print(f"p99 Latency    : {p99:.2f} ms")
    print(f"\n--- STATUS CODE BREAKDOWN ---")
    for code in sorted(status_dist.keys()):
        label = {
            "200": "OK",
            "401": "Unauthorized (bad/missing signature)",
            "403": "Forbidden (wrong device/checkpoint/officer)",
            "409": "Conflict (duplicate session)",
            "413": "Payload Too Large",
            "422": "Unprocessable (bad request body)",
            "429": "Too Many Requests (rate limited)",
            "500": "Internal Server Error",
            "timeout": "Network timeout",
            "error": "Transport/connection error",
        }.get(code, "Other")
        print(f"  HTTP {code:>7}: {status_dist[code]:4d}  ({label})")
    print("=" * 60)

    return {
        "concurrency": concurrency,
        "total_requests": total_requests,
        "num_devices": num_devices,
        "devices_used": device_ids,
        "duration_sec": round(t_total, 2),
        "rps": round(rps, 2),
        "success_count": success_count,
        "failure_count": failure_count,
        "error_rate_pct": round(err_rate, 2),
        "avg_ms": avg_lat,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "status_distribution": status_dist,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VeriShield API Load Testing Engine (DEV/TEST ONLY)")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Target API base URL")
    parser.add_argument("--concurrency", type=int, default=10, help="Number of concurrent workers")
    parser.add_argument("--requests", type=int, default=100, help="Total requests to send")
    parser.add_argument(
        "--devices", type=int, default=1,
        help="Number of simulated field devices (1-5). Each uses its own ECDSA key pair.",
    )
    parser.add_argument(
        "--sessions-per-device", type=int, default=0,
        help="If > 0, total requests = devices × sessions-per-device",
    )
    args = parser.parse_args()

    if args.devices < 1 or args.devices > 5:
        print("ERROR: --devices must be between 1 and 5 (test fixtures exist for DEV-OFFICER-01..05).")
        sys.exit(1)

    total_reqs = args.requests
    if args.sessions_per_device > 0:
        total_reqs = args.devices * args.sessions_per_device

    run_load_test(
        base_url=args.url,
        concurrency=args.concurrency,
        total_requests=total_reqs,
        num_devices=args.devices,
    )
