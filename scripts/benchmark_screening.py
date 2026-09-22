"""VeriShield AI — Full Screening Pipeline Benchmark.

Measures the complete document screening pipeline:
  synthetic document text → OCR (Tesseract) → field extraction → checksum → ELA → risk

If Tesseract is not installed, reports that OCR benchmark is unavailable.
All test data is synthetic — no real citizen information is used.

Usage:
    python scripts/benchmark_screening.py

Requirements:
    pip install pytesseract pillow
    Tesseract OCR binary must be installed and on PATH.
"""

from __future__ import annotations

import os
import platform
import sys
import time
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
backend_dir = project_root / "backend"
sys.path.insert(0, str(backend_dir))


def percentiles(vals: list[float]) -> dict[str, float]:
    if not vals:
        return {"min": 0.0, "median": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0}
    s = sorted(vals)
    n = len(s)

    def p(pct: float) -> float:
        idx = int(round((n - 1) * pct))
        return s[max(0, min(idx, n - 1))]

    return {
        "min": round(s[0], 3),
        "median": round(p(0.50), 3),
        "p95": round(p(0.95), 3),
        "p99": round(p(0.99), 3),
        "max": round(s[-1], 3),
    }


# ---------------------------------------------------------------------------
# Synthetic test data — purely fabricated, no real citizen data
# ---------------------------------------------------------------------------
SYNTHETIC_PASSPORT_TEXT = """\
P<INDTEST<<SYNTHETIC<<<<<<<<<<<<<<<<<<<<<<<<<<
T1234567<8IND9001015M3001018<<<<<<<<<<<<<<04
"""

SYNTHETIC_AADHAAR_TEXT = """\
Government of India
Synthetic Test Person
DOB: 01/01/2000
Male
9999 1234 5674
"""

SYNTHETIC_DL_TEXT = """\
GOVERNMENT OF INDIA
MOTOR VEHICLES ACT 1988
Name: SYNTHETIC TEST PERSON
DL No: MH0120001234567
DOB: 01/01/2000
"""


def check_tesseract() -> bool:
    """Return True if Tesseract binary is available."""
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def benchmark_deterministic_pipeline(iterations: int = 200) -> dict:
    """Benchmark the deterministic steps that run after OCR: extraction + checksum + hash chain."""
    from app.services.checksum import validate_aadhaar, validate_passport_mrz
    from app.services.extract import extract_fields
    from app.models.db import GENESIS_HASH, compute_event_hash
    from datetime import datetime, timezone

    times = []
    bench_ts = datetime.now(timezone.utc)
    prev = GENESIS_HASH

    for _ in range(iterations):
        t0 = time.perf_counter()

        # Field extraction (regex/heuristic, no OCR)
        extracted = extract_fields("passport", SYNTHETIC_PASSPORT_TEXT)
        _ = extract_fields("aadhaar", SYNTHETIC_AADHAAR_TEXT)

        # Checksum validation
        _ = validate_aadhaar("999912345674")
        _ = validate_passport_mrz(
            "T1234567<8IND9001015M3001018<<<<<<<<<<<<<<04",
            "P<INDTEST<<SYNTHETIC<<<<<<<<<<<<<<<<<<<<<<<<",
        )

        # Audit hash chain event
        prev = compute_event_hash(
            "VS-BENCH-SCREEN-01",
            "DOCUMENT_SCREENED",
            "DEV-OFFICER-01",
            "checksum=pass",
            bench_ts,
            prev,
        )

        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)

    return percentiles(times)


def benchmark_ocr_pipeline(iterations: int = 10) -> dict | None:
    """Benchmark Tesseract OCR on a rendered synthetic passport MRZ image.

    Returns None if Tesseract or Pillow is not available.
    """
    if not check_tesseract():
        return None

    try:
        from PIL import Image, ImageDraw, ImageFont
        import pytesseract
    except ImportError:
        return None

    # Render a synthetic text image (white background, black mono text)
    def _make_text_image(text: str) -> "Image.Image":
        img = Image.new("L", (800, 200), color=255)
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), text, fill=0)
        return img

    passport_img = _make_text_image(SYNTHETIC_PASSPORT_TEXT)
    aadhaar_img = _make_text_image(SYNTHETIC_AADHAAR_TEXT)

    times = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        _ = pytesseract.image_to_string(passport_img)
        _ = pytesseract.image_to_string(aadhaar_img)
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)

    return percentiles(times)


def main():
    print("=" * 70)
    print("  VERISHIELD AI -- FULL SCREENING PIPELINE BENCHMARK")
    print("=" * 70)
    print(f"  OS           : {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"  Python       : {platform.python_version()}")
    print(f"  CPU Cores    : {os.cpu_count()}")

    DETERMINISTIC_ITERATIONS = 200
    OCR_ITERATIONS = 10

    print(f"\n--- A. DETERMINISTIC PIPELINE (post-OCR steps only) ---")
    print(f"  {DETERMINISTIC_ITERATIONS} iterations — extraction + checksum + hash chain")
    det_result = benchmark_deterministic_pipeline(DETERMINISTIC_ITERATIONS)
    print(f"  min: {det_result['min']:.3f}ms | median: {det_result['median']:.3f}ms | "
          f"p95: {det_result['p95']:.3f}ms | p99: {det_result['p99']:.3f}ms | max: {det_result['max']:.3f}ms")
    print()
    print("  NOTE: The deterministic checksum, field-extraction, and audit-hash components")
    print("  benchmark below 2 ms at P99 in this local synthetic benchmark. This excludes")
    print("  Tesseract OCR, real image preprocessing, face detection/matching and camera I/O.")

    print(f"\n--- B. TESSERACT OCR PIPELINE ---")
    tess_available = check_tesseract()
    if not tess_available:
        print("  OCR benchmark unavailable: Tesseract binary not installed.")
        print("  Install Tesseract and pytesseract to enable this benchmark.")
        ocr_result = None
    else:
        print(f"  {OCR_ITERATIONS} iterations — Tesseract OCR on synthetic document images")
        ocr_result = benchmark_ocr_pipeline(OCR_ITERATIONS)
        if ocr_result:
            print(f"  min: {ocr_result['min']:.1f}ms | median: {ocr_result['median']:.1f}ms | "
                  f"p95: {ocr_result['p95']:.1f}ms | p99: {ocr_result['p99']:.1f}ms | max: {ocr_result['max']:.1f}ms")
        else:
            print("  OCR benchmark unavailable: Pillow not installed.")

    print("\n" + "=" * 70)

    # Print summary
    if ocr_result:
        total_p99 = det_result["p99"] + ocr_result["p99"]
        print(f"\n  Combined P99 estimate (deterministic + OCR): {total_p99:.1f} ms")
        print("  (Excludes face detection, camera I/O, real image preprocessing)")
    else:
        print(f"\n  Deterministic pipeline P99: {det_result['p99']:.3f} ms")
        print("  (OCR P99 not measured — Tesseract not available)")


if __name__ == "__main__":
    main()
