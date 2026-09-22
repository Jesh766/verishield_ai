"""VeriShield AI — Phase 3.1 Verification Intelligence & Evidence Architecture Test Suite.

Validates unified evidence models, document consistency checks, authoritative provider abstraction,
and non-fake government verification compliance.
"""

from __future__ import annotations

import pytest

from app.services.authoritative import (
    AuthoritativeResult,
    LocalOnlyVerificationProvider,
    check_authoritative_verification,
    get_authoritative_provider,
)
from app.services.checksum import validate, validate_consistency


def test_authoritative_provider_default_not_configured():
    """Default authoritative provider returns NOT_CONFIGURED and non-authoritative status."""
    provider = get_authoritative_provider()
    assert isinstance(provider, LocalOnlyVerificationProvider)

    res = check_authoritative_verification("aadhaar", {"aadhaar_number": "234567890123"})
    assert res["status"] == "NOT_CONFIGURED"
    assert res["is_authoritative"] is False
    assert "NOT currently configured" in res["detail"]


def test_cross_field_consistency_date_ordering():
    """Cross-field consistency detects invalid DOB vs Issue Date vs Expiry Date relationships."""
    # Valid date ordering
    valid_fields = {
        "date_of_birth": "15/08/1990",
        "date_of_issue": "10/01/2015",
        "date_of_expiry": "09/01/2025",
    }
    checks_valid = validate_consistency(valid_fields)
    assert len(checks_valid) == 2
    assert all(c.passed is True for c in checks_valid)

    # Invalid date ordering (DOB in 2020, issue in 2015)
    invalid_fields = {
        "date_of_birth": "15/08/2020",
        "date_of_issue": "10/01/2015",
    }
    checks_invalid = validate_consistency(invalid_fields)
    assert len(checks_invalid) == 1
    assert checks_invalid[0].passed is False
    assert "cannot be after" in checks_invalid[0].detail


def test_validate_includes_consistency_checks():
    """validate() incorporates both document structural checks and cross-field consistency checks."""
    fields = {
        "aadhaar_number": "234567890123",
        "date_of_birth": "01/01/1990",
        "date_of_issue": "01/01/2020",
    }
    checks = validate("aadhaar", fields)
    check_names = [c["check"] for c in checks]
    assert "aadhaar_verhoeff_checksum" in check_names
    assert "consistency_dob_vs_issue" in check_names


def test_passport_mrz_vs_visual_number_cross_check():
    """MRZ passport number vs visual passport number agreement & conflict detection."""
    from app.services.checksum import validate_passport_mrz

    line1 = "P<INDTEST<<SAMPLE<<<<<<<<<<<<<<<<<<<<<<<<<<<"
    line2 = "J1234567<4IND9008151M2501104<<<<<<<<<<<<<<04"

    # Matching visual number
    res_match = validate_passport_mrz(line1, line2, visual_passport_number="J1234567")
    match_check = next(c for c in res_match if c.check == "passport_mrz_vs_visual_number")
    assert match_check.passed is True

    # Conflicting visual number
    res_conflict = validate_passport_mrz(line1, line2, visual_passport_number="Z9999999")
    conflict_check = next(c for c in res_conflict if c.check == "passport_mrz_vs_visual_number")
    assert conflict_check.passed is False
    assert "conflicts" in conflict_check.detail
