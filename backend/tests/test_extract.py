from __future__ import annotations

from app.services.extract import extract_fields, mask_number

AADHAAR_TEXT = """GOVERNMENT OF INDIA
Ravi Kumar Sharma
DOB: 14/08/1991
Male
2345 6789 0120
MERA AADHAAR MERI PEHCHAN
"""

DL_TEXT = """INDIAN UNION DRIVING LICENCE
DL No: MH1420110062821
Ravi Kumar Sharma
DOB: 14/08/1991
"""


def test_extract_aadhaar_fields():
    f = extract_fields("aadhaar", AADHAAR_TEXT)
    assert f["aadhaar_number"] == "234567890120"
    assert f["date_of_birth"] == "14/08/1991"
    assert f["gender"] == "Male"
    assert f["name"] == "Ravi Kumar Sharma"


def test_extract_dl_fields():
    f = extract_fields("dl", DL_TEXT)
    assert f["dl_number"] == "MH1420110062821"
    assert f["date_of_birth"] == "14/08/1991"


def test_extract_passport_mrz():
    from fixtures.generate import make_mrz

    l1, l2 = make_mrz("SHARMA", "RAVI KUMAR", "M1234567", "IND", "910814", "M", "310813")
    f = extract_fields("passport", f"REPUBLIC OF INDIA\n{l1}\n{l2}\n")
    assert f["mrz_line2"] == l2
    assert f["passport_number"] == "M1234567"
    assert f["nationality"] == "IND"
    assert f["surname"] == "SHARMA"
    assert f["sex"] == "Male"


def test_extract_handles_empty_text():
    f = extract_fields("aadhaar", "")
    assert f["aadhaar_number"] is None
    assert f["name"] is None


def test_mask_number_keeps_only_last_four():
    assert mask_number("234567890120") == "XXXXXXXX0120"
    assert mask_number(None) is None


def test_mrz_glyph_repair_is_confirmed_by_check_digit():
    """A look-alike misread is repaired only when the ICAO check digit agrees."""
    from app.services.extract import normalise_td3_line2
    from fixtures.generate import make_mrz

    _, l2 = make_mrz("SHARMA", "RAVI KUMAR", "M1234567", "IND", "910814", "M", "310813")
    misread = l2[:13] + "O" + l2[14:]  # OCR read the leading 9 of the DOB as O
    fixed, repairs = normalise_td3_line2(misread)
    assert fixed[13:19] == "910814"
    assert repairs


def test_mrz_repair_cannot_rescue_a_genuinely_wrong_number():
    """Altering a digit outside the look-alike set must stay a failure."""
    from app.services.checksum import validate_passport_mrz
    from app.services.extract import normalise_td3_line2
    from fixtures.generate import make_mrz

    _, l2 = make_mrz("SHARMA", "RAVI KUMAR", "M1234567", "IND", "910814", "M", "310813")
    forged = l2[:13] + "930814" + l2[19:]  # deliberate DOB forgery
    fixed, _ = normalise_td3_line2(forged)
    checks = {c.check: c for c in validate_passport_mrz(None, fixed)}
    assert checks["mrz_date_of_birth"].passed is False
