"""Structural / checksum validation.

+---------------------------------------------------------------------------+
| NOT AI. Every function in this module is deterministic arithmetic or a     |
| regex. There is no model, no training, no inference. UI copy for these     |
| results must say "deterministic check", never "AI".                        |
+---------------------------------------------------------------------------+

Covers:
  * Aadhaar  -- Verhoeff checksum (UIDAI spec)
  * Passport -- ICAO 9303 MRZ check digits (TD3)
  * Driving Licence -- structural format + state-code whitelist ONLY.
    No public national checksum standard exists for Indian DL numbers, so we
    do not invent one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any

# --------------------------------------------------------------------------- #
# Result type
# --------------------------------------------------------------------------- #


@dataclass
class CheckResult:
    check: str
    passed: bool | None  # None == could not be evaluated (missing input)
    detail: str
    is_ai: bool = False  # always False in this module, kept explicit for the UI

    def dict(self) -> dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Verhoeff (Aadhaar)
# --------------------------------------------------------------------------- #

# Dihedral group D5 multiplication table
_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)

# Permutation table
_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)

# Multiplicative inverse table (used only to *generate* valid test fixtures)
_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def verhoeff_valid(number: str) -> bool:
    """True if `number` (digits only) carries a valid Verhoeff check digit."""
    digits = re.sub(r"\D", "", number or "")
    if not digits:
        return False
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(payload: str) -> int:
    """Check digit that would make `payload` + digit a valid Verhoeff number."""
    digits = re.sub(r"\D", "", payload or "")
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return _INV[c]


AADHAAR_RE = re.compile(r"\b(\d{4})\s?(\d{4})\s?(\d{4})\b")


def validate_aadhaar(number: str | None) -> list[CheckResult]:
    results: list[CheckResult] = []
    digits = re.sub(r"\D", "", number or "")

    if not digits:
        return [
            CheckResult(
                "aadhaar_present",
                None,
                "No 12-digit Aadhaar number was found in the extracted text.",
            )
        ]

    ok_len = len(digits) == 12
    results.append(
        CheckResult(
            "aadhaar_format",
            ok_len,
            "12 digits present."
            if ok_len
            else f"Expected 12 digits, found {len(digits)}.",
        )
    )

    # UIDAI never issues numbers beginning with 0 or 1.
    ok_lead = digits[0] not in "01"
    results.append(
        CheckResult(
            "aadhaar_leading_digit",
            ok_lead,
            "Leading digit is in the issued range (2-9)."
            if ok_lead
            else f"Aadhaar numbers never start with {digits[0]}.",
        )
    )

    if ok_len:
        ok_sum = verhoeff_valid(digits)
        results.append(
            CheckResult(
                "aadhaar_verhoeff_checksum",
                ok_sum,
                "Verhoeff checksum valid (deterministic arithmetic, not AI)."
                if ok_sum
                else "Verhoeff checksum failed — the number cannot be a genuine "
                "Aadhaar number as printed.",
            )
        )
    return results


# --------------------------------------------------------------------------- #
# ICAO 9303 MRZ (Passport, TD3)
# --------------------------------------------------------------------------- #

_WEIGHTS = (7, 3, 1)


def mrz_char_value(ch: str) -> int:
    if ch == "<":
        return 0
    if ch.isdigit():
        return int(ch)
    if "A" <= ch.upper() <= "Z":
        return ord(ch.upper()) - 55  # A=10 ... Z=35
    return 0


def mrz_check_digit(field: str) -> int:
    total = 0
    for i, ch in enumerate(field):
        total += mrz_char_value(ch) * _WEIGHTS[i % 3]
    return total % 10


def _digit_check(name: str, field: str, given: str, label: str) -> CheckResult:
    if not given.isdigit():
        return CheckResult(name, None, f"{label}: check digit is missing or unreadable.")
    expected = mrz_check_digit(field)
    ok = expected == int(given)
    return CheckResult(
        name,
        ok,
        f"{label}: check digit matches (ICAO 9303, deterministic)."
        if ok
        else f"{label}: check digit is {given}, expected {expected}.",
    )


def validate_passport_mrz(
    line1: str | None, line2: str | None, visual_passport_number: str | None = None
) -> list[CheckResult]:
    """Validate the four check digits of a TD3 machine-readable zone."""
    results: list[CheckResult] = []

    if not line2:
        return [
            CheckResult(
                "mrz_present",
                None,
                "No machine-readable zone was found. Capture the bottom two "
                "lines of the passport data page and retry.",
            )
        ]

    l2 = line2.strip().replace(" ", "").upper()
    ok_len = len(l2) == 44
    results.append(
        CheckResult(
            "mrz_line_length",
            ok_len,
            "MRZ line 2 is the expected 44 characters."
            if ok_len
            else f"MRZ line 2 is {len(l2)} characters, expected 44 — OCR may have "
            "dropped characters.",
        )
    )
    if not ok_len:
        return results

    if line1:
        l1 = line1.strip().replace(" ", "").upper()
        results.append(
            CheckResult(
                "mrz_document_type",
                l1.startswith("P"),
                "Document type is P (passport)."
                if l1.startswith("P")
                else f"Document type code is '{l1[:1]}', expected 'P'.",
            )
        )

    doc_no, doc_cd = l2[0:9], l2[9]
    dob, dob_cd = l2[13:19], l2[19]
    exp, exp_cd = l2[21:27], l2[27]
    personal = l2[28:42]
    composite_cd = l2[43]

    results.append(_digit_check("mrz_document_number", doc_no, doc_cd, "Passport number"))
    results.append(_digit_check("mrz_date_of_birth", dob, dob_cd, "Date of birth"))
    results.append(_digit_check("mrz_expiry", exp, exp_cd, "Expiry date"))

    composite = doc_no + doc_cd + dob + dob_cd + exp + exp_cd + personal + l2[42]
    results.append(
        _digit_check("mrz_composite", composite, composite_cd, "Composite (whole MRZ)")
    )

    if visual_passport_number:
        clean_mrz = doc_no.replace("<", "").strip().upper()
        clean_vis = re.sub(r"[^A-Z0-9]", "", visual_passport_number).upper()
        match = clean_mrz == clean_vis
        results.append(
            CheckResult(
                "passport_mrz_vs_visual_number",
                match,
                "MRZ passport number matches the visual zone number."
                if match
                else f"MRZ passport number ({clean_mrz}) conflicts with visual zone ({clean_vis}).",
            )
        )
    return results


# --------------------------------------------------------------------------- #
# Driving Licence -- structure only
# --------------------------------------------------------------------------- #

STATE_CODES = {
    "AP", "AR", "AS", "BR", "CG", "GA", "GJ", "HR", "HP", "JH", "KA", "KL",
    "MP", "MH", "MN", "ML", "MZ", "NL", "OD", "PB", "RJ", "SK", "TN", "TS",
    "TR", "UP", "UK", "WB", "AN", "CH", "DN", "DD", "DL", "JK", "LA", "LD",
    "PY",
}

DL_RE = re.compile(r"^[A-Z]{2}\d{2}\d{4,11}$")

DL_DISCLAIMER = (
    "No public national checksum standard exists for Indian driving licence "
    "numbers — structural check only. A pass here does not prove the licence "
    "is genuine."
)


def validate_dl(number: str | None) -> list[CheckResult]:
    results: list[CheckResult] = []
    raw = re.sub(r"[\s\-]", "", (number or "")).upper()

    if not raw:
        return [
            CheckResult(
                "dl_present",
                None,
                "No driving licence number was found in the extracted text.",
            )
        ]

    ok_fmt = bool(DL_RE.match(raw))
    results.append(
        CheckResult(
            "dl_format",
            ok_fmt,
            "Matches the state + RTO + serial layout."
            if ok_fmt
            else "Does not match the expected layout (2 letters, 2-digit RTO "
            "code, then 4-11 digits).",
        )
    )

    state = raw[:2]
    ok_state = state in STATE_CODES
    results.append(
        CheckResult(
            "dl_state_code",
            ok_state,
            f"'{state}' is a recognised Indian state / UT code."
            if ok_state
            else f"'{state}' is not a recognised Indian state / UT code.",
        )
    )

    results.append(CheckResult("dl_checksum_unavailable", None, DL_DISCLAIMER))
    return results


def validate_consistency(fields: dict[str, Any]) -> list[CheckResult]:
    results: list[CheckResult] = []

    dob_str = fields.get("dob") or fields.get("date_of_birth")
    issue_str = fields.get("issue_date") or fields.get("date_of_issue")
    expiry_str = fields.get("expiry_date") or fields.get("date_of_expiry") or fields.get("valid_until")

    def _parse_year(d: Any) -> int | None:
        if not d or not isinstance(d, str):
            return None
        m = re.search(r"\b(19\d\d|20\d\d)\b", d)
        return int(m.group(1)) if m else None

    dob_y = _parse_year(dob_str)
    issue_y = _parse_year(issue_str)
    expiry_y = _parse_year(expiry_str)

    if dob_y and issue_y:
        ok = dob_y < issue_y
        results.append(
            CheckResult(
                "consistency_dob_vs_issue",
                ok,
                f"Date of birth year ({dob_y}) precedes issue year ({issue_y})."
                if ok
                else f"Date of birth year ({dob_y}) cannot be after or equal to issue year ({issue_y}).",
            )
        )

    if issue_y and expiry_y:
        ok = issue_y < expiry_y
        results.append(
            CheckResult(
                "consistency_issue_vs_expiry",
                ok,
                f"Issue year ({issue_y}) precedes expiry year ({expiry_y})."
                if ok
                else f"Expiry year ({expiry_y}) precedes or equals issue year ({issue_y}).",
            )
        )

    return results


def validate(document_type: str, fields: dict[str, Any]) -> list[dict[str, Any]]:
    dt = (document_type or "").lower()
    if dt == "aadhaar":
        checks = validate_aadhaar(fields.get("aadhaar_number"))
    elif dt == "passport":
        checks = validate_passport_mrz(
            fields.get("mrz_line1"),
            fields.get("mrz_line2"),
            fields.get("visual_passport_number"),
        )
    elif dt in ("dl", "driving_licence", "driving_license"):
        checks = validate_dl(fields.get("dl_number"))
    else:
        checks = [
            CheckResult(
                "unsupported_document_type",
                None,
                f"'{document_type}' is not a supported document type. "
                "Supported: aadhaar, passport, dl.",
            )
        ]

    checks.extend(validate_consistency(fields))
    return [c.dict() for c in checks]


def summarise(checks: list[dict[str, Any]]) -> dict[str, Any]:
    """Plain-English rollup. Never a bare colour or number in the UI."""
    failed = [c for c in checks if c["passed"] is False]
    passed = [c for c in checks if c["passed"] is True]
    unknown = [c for c in checks if c["passed"] is None]

    if failed:
        status = "fail"
        headline = f"{len(failed)} structural check(s) failed."
    elif not passed:
        status = "needs_review"
        headline = "No structural check could be evaluated — recapture the document."
    elif unknown:
        status = "needs_review"
        headline = f"{len(passed)} check(s) passed, {len(unknown)} could not be evaluated."
    else:
        status = "pass"
        headline = f"All {len(passed)} structural checks passed."

    return {
        "status": status,
        "headline": headline,
        "passed": len(passed),
        "failed": len(failed),
        "not_evaluated": len(unknown),
        "reasons": [c["detail"] for c in failed + unknown] or [c["detail"] for c in passed],
        "method": "deterministic",
        "is_ai": False,
    }
