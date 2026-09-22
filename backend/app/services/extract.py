"""Field extraction from raw OCR text.

NOT AI. This is regex + positional heuristics over the text that the OCR model
produced. The OCR step is a learned model; this step is deterministic parsing.
"""

from __future__ import annotations

import re
from typing import Any

from .checksum import AADHAAR_RE, DL_RE

# --------------------------------------------------------------------------- #
# Shared patterns
# --------------------------------------------------------------------------- #

DOB_RE = re.compile(r"\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b")
YOB_RE = re.compile(r"\b(?:year of birth|yob)\D{0,5}(\d{4})\b", re.I)
GENDER_RE = re.compile(r"\b(male|female|transgender|पुरुष|महिला)\b", re.I)
NAME_LINE_RE = re.compile(r"^[A-Z][A-Za-z.'\-]+(?: [A-Z][A-Za-z.'\-]+){1,4}$")

_NOISE = {
    "GOVERNMENTOFINDIA", "UNIQUEIDENTIFICATIONAUTHORITYOFINDIA",
    "REPUBLICOFINDIA", "INDIANUNIONDRIVINGLICENCE", "DRIVINGLICENCE",
    "AADHAAR", "PASSPORT", "MERAAADHAARMERIPEHCHAN", "PHOTO", "SIGNATURE",
    "DATEOFBIRTH", "SURNAMEGIVENNAMES", "VALIDTILL", "NATIONALITYINDIAN",
}

# Words that mark a line as a label/heading rather than a person's name.
_NOISE_TOKENS = (
    "GOVERNMENT", "INDIA", "AUTHORITY", "LICENCE", "LICENSE", "AADHAAR",
    "PASSPORT", "REPUBLIC", "PEHCHAN", "PHOTO", "SIGNATURE", "NATIONALITY",
    "ADDRESS", "ISSUE", "VALID", "BIRTH", "SURNAME",
)


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in (text or "").splitlines() if ln.strip()]


def _is_noise(cleaned: str) -> bool:
    compact = re.sub(r"[^A-Z]", "", cleaned.upper())
    if compact in _NOISE:
        return True
    return any(tok in compact for tok in _NOISE_TOKENS)


def _guess_name(text: str) -> str | None:
    for ln in _lines(text):
        cleaned = re.sub(r"\s{2,}", " ", ln).strip("‘’'\"|. ")
        if _is_noise(cleaned):
            continue
        if len(cleaned) < 5 or any(ch.isdigit() for ch in cleaned):
            continue
        if NAME_LINE_RE.match(cleaned) or (cleaned.isupper() and " " in cleaned):
            return cleaned.title()
    return None


def _guess_dob(text: str) -> str | None:
    m = DOB_RE.search(text or "")
    if m:
        return f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
    y = YOB_RE.search(text or "")
    return y.group(1) if y else None


def _guess_gender(text: str) -> str | None:
    m = GENDER_RE.search(text or "")
    if not m:
        return None
    v = m.group(1).lower()
    if v in ("पुरुष",):
        return "Male"
    if v in ("महिला",):
        return "Female"
    return v.capitalize()


# --------------------------------------------------------------------------- #
# MRZ (TD3)
# --------------------------------------------------------------------------- #

MRZ_LINE_RE = re.compile(r"^[A-Z0-9<]{26,50}$")

# OCR glyph confusions. TD3 field offsets are fixed by ICAO 9303, so these can
# be resolved positionally and confirmed against the check digits.
# Deterministic string handling — no model, no learning.
_DIGIT_ALTS = {
    "O": "09", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2", "S": "5",
    "B": "8", "G": "6", "T": "7", "A": "4", "E": "8", "U": "0",
}
_TO_ALPHA = str.maketrans({"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B"})

_L2_ALPHA_POS = [*range(10, 13)]
# (data slice, check-digit index, human label)
_L2_FIELDS = [
    ((0, 9), 9, "passport number"),
    ((13, 19), 19, "date of birth"),
    ((21, 27), 27, "expiry date"),
]


def _rebuild_td3(compact: str) -> str:
    """Restore a 44-character TD3 line from an OCR read.

    Tesseract collapses long runs of the filler character '<'. Because TD3
    field offsets are fixed, a short read can be re-expanded: keep the leading
    28 data characters and the trailing 2 check characters, and restore the
    14-character optional-data field between them.
    """
    if len(compact) >= 44:
        return compact[:44]
    if len(compact) >= 30:
        head, tail = compact[:28], compact[-2:]
        middle = compact[28:-2].ljust(14, "<")[:14]
        return head + middle + tail
    return compact.ljust(44, "<")


def _digit_candidates(ch: str) -> list[str]:
    if ch.isdigit():
        return [ch]
    alts = _DIGIT_ALTS.get(ch, "")
    return list(alts) or [ch]


def _repair_numeric_field(field: str, check: str) -> tuple[str, str, list[str]]:
    """Resolve OCR glyph ambiguity in one MRZ field using its check digit.

    Only substitutions from the known look-alike table are considered, and a
    repair is accepted only when it makes the ICAO check digit valid. If the
    field already validates, nothing changes. This corrects reader error — it
    can never turn an invalid document into a valid one, because an attacker
    would have to produce a number whose real check digit matches.
    """
    from itertools import product

    from .checksum import mrz_check_digit

    def valid(f: str, c: str) -> bool:
        return c.isdigit() and mrz_check_digit(f) == int(c)

    if valid(field, check):
        return field, check, []

    field_opts = [_digit_candidates(c) if c != "<" else ["<"] for c in field]
    check_opts = _digit_candidates(check)
    if any(len(o) > 1 for o in field_opts + [check_opts]):
        combos = list(product(*field_opts, check_opts))
        if len(combos) <= 512:
            scored = []
            for combo in combos:
                cand_field, cand_check = "".join(combo[:-1]), combo[-1]
                if valid(cand_field, cand_check):
                    changes = sum(
                        1 for a, b in zip(field + check, cand_field + cand_check) if a != b
                    )
                    scored.append((changes, cand_field, cand_check))
            if scored:
                scored.sort()
                # Ambiguous if two different repairs are equally minimal.
                minimal = [s for s in scored if s[0] == scored[0][0]]
                if len({(s[1], s[2]) for s in minimal}) == 1:
                    _, f2, c2 = scored[0]
                    notes = [
                        f"'{a}' read as '{b}'"
                        for a, b in zip(field + check, f2 + c2)
                        if a != b
                    ]
                    return f2, c2, notes
    return field, check, []


def normalise_td3_line2(line: str) -> tuple[str, list[str]]:
    from .checksum import mrz_check_digit

    chars = list(_rebuild_td3(line))
    repairs: list[str] = []

    for i in _L2_ALPHA_POS:
        if chars[i] != "<":
            chars[i] = chars[i].translate(_TO_ALPHA)

    for (start, end), cd_idx, label in _L2_FIELDS:
        field = "".join(chars[start:end])
        fixed, cd, notes = _repair_numeric_field(field, chars[cd_idx])
        chars[start:end] = list(fixed)
        chars[cd_idx] = cd
        repairs += [f"{label}: {n}" for n in notes]

    # Composite check digit (position 43) — same look-alike-only repair rule.
    composite = "".join(chars[0:10] + chars[13:20] + chars[21:43])
    expected = str(mrz_check_digit(composite))
    if chars[43] != expected and expected in _digit_candidates(chars[43]):
        repairs.append(f"composite check digit: '{chars[43]}' read as '{expected}'")
        chars[43] = expected

    return "".join(chars), repairs


def _score_line2(line: str) -> int:
    """How many of the three field check digits validate. Used to pick the
    best of several OCR reads of the same MRZ."""
    from .checksum import mrz_check_digit

    score = 0
    for (start, end), cd_idx, _ in _L2_FIELDS:
        cd = line[cd_idx]
        if cd.isdigit() and mrz_check_digit(line[start:end]) == int(cd):
            score += 1
    composite = line[0:10] + line[13:20] + line[21:43]
    if line[43].isdigit() and mrz_check_digit(composite) == int(line[43]):
        score += 1
    return score


def _mrz_lines(text: str) -> tuple[str | None, str | None, list[str]]:
    """Pick the two TD3 lines out of noisy OCR text and normalise them."""
    candidates: list[str] = []
    for ln in _lines(text):
        compact = re.sub(r"[^A-Z0-9<]", "", ln.upper())
        if "<" in compact and MRZ_LINE_RE.match(compact):
            candidates.append(compact)
    if not candidates:
        return None, None, []

    l1_candidates = [c for c in candidates if c.startswith("P")]
    l2_candidates = [c for c in candidates if not c.startswith("P")] or candidates

    line1 = max(l1_candidates, key=lambda c: c.count("<")) if l1_candidates else None

    best: tuple[tuple[int, int, int], str, list[str]] | None = None
    for cand in l2_candidates:
        normalised, repairs = normalise_td3_line2(cand)
        # Prefer the read with the most valid check digits, then the fewest
        # glyph repairs, then the one whose filler field looks like filler.
        score = (_score_line2(normalised), -len(repairs), normalised.count("<"))
        if best is None or score > best[0]:
            best = (score, normalised, repairs)

    line2, repairs = (best[1], best[2]) if best else (None, [])
    return (_rebuild_td3(line1) if line1 else None), line2, repairs


def _parse_mrz(line1: str | None, line2: str | None) -> dict[str, Any]:
    out: dict[str, Any] = {"mrz_line1": line1, "mrz_line2": line2}
    if line1 and len(line1) >= 44:
        out["issuing_country"] = line1[2:5].replace("<", "")
        names = line1[5:44].split("<<", 1)
        surname = names[0].replace("<", " ").strip()
        given = names[1].replace("<", " ").strip() if len(names) > 1 else ""
        out["surname"] = surname or None
        out["given_names"] = given or None
        out["name"] = f"{given} {surname}".strip() or None
    if line2 and len(line2) >= 44:
        out["passport_number"] = line2[0:9].replace("<", "")
        out["nationality"] = line2[10:13].replace("<", "")
        out["date_of_birth_mrz"] = line2[13:19]
        out["sex"] = {"M": "Male", "F": "Female"}.get(line2[20], "Unspecified")
        out["expiry_date_mrz"] = line2[21:27]
    return out


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


def extract_fields(document_type: str, text: str) -> dict[str, Any]:
    dt = (document_type or "").lower()
    text = text or ""

    if dt == "aadhaar":
        m = AADHAAR_RE.search(text)
        return {
            "aadhaar_number": "".join(m.groups()) if m else None,
            "name": _guess_name(text),
            "date_of_birth": _guess_dob(text),
            "gender": _guess_gender(text),
        }

    if dt == "passport":
        l1, l2, repairs = _mrz_lines(text)
        fields = _parse_mrz(l1, l2)
        fields["mrz_ocr_repairs"] = repairs
        fields.setdefault("name", None)
        if not fields.get("name"):
            fields["name"] = _guess_name(text)
        fields["date_of_birth"] = _guess_dob(text)
        return fields

    if dt in ("dl", "driving_licence", "driving_license"):
        dl = None
        for token in re.findall(r"[A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4,11}", text.upper()):
            candidate = re.sub(r"[\s\-]", "", token)
            if DL_RE.match(candidate):
                dl = candidate
                break
        return {
            "dl_number": dl,
            "name": _guess_name(text),
            "date_of_birth": _guess_dob(text),
        }

    return {"name": _guess_name(text), "date_of_birth": _guess_dob(text)}


PRIMARY_NUMBER_KEY = {
    "aadhaar": "aadhaar_number",
    "passport": "passport_number",
    "dl": "dl_number",
    "driving_licence": "dl_number",
    "driving_license": "dl_number",
}


def mask_number(value: str | None) -> str | None:
    """Store only a masked form of any identity number."""
    if not value:
        return None
    v = re.sub(r"\s", "", value)
    if len(v) <= 4:
        return "*" * len(v)
    return "X" * (len(v) - 4) + v[-4:]
