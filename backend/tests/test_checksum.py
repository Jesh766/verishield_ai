"""Checksum tests with known-good and known-bad vectors."""

from __future__ import annotations

import pytest

from app.services.checksum import (
    mrz_check_digit, summarise, validate_aadhaar, validate_dl,
    validate_passport_mrz, verhoeff_check_digit, verhoeff_valid,
)


# --- Verhoeff --------------------------------------------------------------- #

@pytest.mark.parametrize("number", ["2363", "123451", "1428570", "0", "758722"])
def test_verhoeff_known_valid(number):
    assert verhoeff_valid(number)


@pytest.mark.parametrize("number", ["2364", "75873", "123452", "1428571"])
def test_verhoeff_known_invalid(number):
    assert not verhoeff_valid(number)


def test_verhoeff_check_digit_round_trip():
    for payload in ["12345", "99999999999", "23456789012", "7", "246813579"]:
        assert verhoeff_valid(payload + str(verhoeff_check_digit(payload)))


def test_verhoeff_detects_single_digit_error():
    payload = "23456789012"
    full = payload + str(verhoeff_check_digit(payload))
    for i in range(len(full)):
        for d in "0123456789":
            if d == full[i]:
                continue
            mutated = full[:i] + d + full[i + 1:]
            assert not verhoeff_valid(mutated), mutated


def test_verhoeff_detects_adjacent_transposition():
    payload = "23456789012"
    full = payload + str(verhoeff_check_digit(payload))
    for i in range(len(full) - 1):
        if full[i] == full[i + 1]:
            continue
        swapped = full[:i] + full[i + 1] + full[i] + full[i + 2:]
        assert not verhoeff_valid(swapped), swapped


# --- Aadhaar ---------------------------------------------------------------- #

def _by_name(checks):
    return {c["check"]: c for c in checks}


def test_aadhaar_valid_number_passes():
    payload = "23456789012"
    number = payload + str(verhoeff_check_digit(payload))
    checks = _by_name([c.dict() for c in validate_aadhaar(number)])
    assert checks["aadhaar_format"]["passed"]
    assert checks["aadhaar_leading_digit"]["passed"]
    assert checks["aadhaar_verhoeff_checksum"]["passed"]
    assert all(c["is_ai"] is False for c in checks.values())


def test_aadhaar_bad_checksum_fails():
    checks = _by_name([c.dict() for c in validate_aadhaar("234567890123")])
    assert checks["aadhaar_verhoeff_checksum"]["passed"] is False


def test_aadhaar_leading_zero_rejected():
    checks = _by_name([c.dict() for c in validate_aadhaar("012345678901")])
    assert checks["aadhaar_leading_digit"]["passed"] is False


def test_aadhaar_missing_number_is_not_evaluated():
    checks = [c.dict() for c in validate_aadhaar(None)]
    assert checks[0]["passed"] is None


# --- Passport MRZ ----------------------------------------------------------- #

def test_mrz_check_digit_icao_reference():
    # Reference vectors from ICAO 9303 part 3.
    assert mrz_check_digit("D23145890734") == 9
    assert mrz_check_digit("L898902C") == 3      # ICAO TD3 specimen doc number
    assert mrz_check_digit("690806") == 1        # ... its date of birth
    assert mrz_check_digit("940623") == 6        # ... its expiry date


def _build_mrz():
    from fixtures.generate import make_mrz

    return make_mrz("SHARMA", "RAVI KUMAR", "M1234567", "IND", "910814", "M", "310813")


def test_passport_valid_mrz_passes():
    l1, l2 = _build_mrz()
    checks = _by_name([c.dict() for c in validate_passport_mrz(l1, l2)])
    assert checks["mrz_line_length"]["passed"]
    assert checks["mrz_document_number"]["passed"]
    assert checks["mrz_date_of_birth"]["passed"]
    assert checks["mrz_expiry"]["passed"]
    assert checks["mrz_composite"]["passed"]


def test_passport_altered_dob_fails():
    l1, l2 = _build_mrz()
    tampered = l2[:13] + "920814" + l2[19:]
    checks = _by_name([c.dict() for c in validate_passport_mrz(l1, tampered)])
    assert checks["mrz_date_of_birth"]["passed"] is False


def test_passport_missing_mrz_is_not_evaluated():
    checks = [c.dict() for c in validate_passport_mrz(None, None)]
    assert checks[0]["passed"] is None


def test_passport_short_line_flagged():
    checks = _by_name([c.dict() for c in validate_passport_mrz(None, "P<INDSHARMA")])
    assert checks["mrz_line_length"]["passed"] is False


# --- Driving licence -------------------------------------------------------- #

def test_dl_valid_structure():
    checks = _by_name([c.dict() for c in validate_dl("MH1420110062821")])
    assert checks["dl_format"]["passed"]
    assert checks["dl_state_code"]["passed"]
    # We must never claim a checksum we do not have.
    assert checks["dl_checksum_unavailable"]["passed"] is None
    assert "no public national checksum" in checks["dl_checksum_unavailable"]["detail"].lower()


def test_dl_unknown_state_code():
    checks = _by_name([c.dict() for c in validate_dl("XX1420110062821")])
    assert checks["dl_state_code"]["passed"] is False


def test_dl_bad_format():
    checks = _by_name([c.dict() for c in validate_dl("M-1420")])
    assert checks["dl_format"]["passed"] is False


# --- Summary ---------------------------------------------------------------- #

def test_summary_fail_wins():
    checks = [c.dict() for c in validate_aadhaar("234567890123")]
    s = summarise(checks)
    assert s["status"] == "fail"
    assert s["is_ai"] is False
    assert s["reasons"]


def test_summary_needs_review_when_unknowns_present():
    checks = [c.dict() for c in validate_dl("MH1420110062821")]
    s = summarise(checks)
    assert s["status"] == "needs_review"
