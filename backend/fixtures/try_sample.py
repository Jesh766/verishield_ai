"""Run one image through the full Phase 1 pipeline, without the HTTP layer.

    python fixtures/try_sample.py fixtures/samples/aadhaar_valid.png aadhaar
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import checksum, extract, ocr  # noqa: E402


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    path, doc_type = Path(sys.argv[1]), sys.argv[2]
    if not path.exists():
        print(f"No such file: {path}")
        return 1

    result = ocr.run_ocr(path.read_bytes(), mrz=(doc_type == "passport"))
    fields = extract.extract_fields(doc_type, result["raw_text"])
    checks = checksum.validate(doc_type, fields)
    summary = checksum.summarise(checks)

    print("--- RAW OCR TEXT ---")
    print(result["raw_text"].strip() or "(nothing recognised)")
    print(f"\nmean word confidence: {result['mean_confidence']}")
    print("\n--- FIELDS ---")
    print(json.dumps(fields, indent=2, ensure_ascii=False))
    print("\n--- CHECKS ---")
    for c in checks:
        mark = {True: "PASS", False: "FAIL", None: "N/A "}[c["passed"]]
        print(f"[{mark}] {c['check']}: {c['detail']}")
    print(f"\n--- SUMMARY --- {summary['status'].upper()}: {summary['headline']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
