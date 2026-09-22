"""Synthetic test-document generator.

Renders mock Aadhaar / Passport / DL card images for automated testing.
All numbers are FABRICATED but structurally valid (real Verhoeff check digit,
real ICAO 9303 MRZ check digits) so the validation path can be tested without
touching a single piece of real PII.

    python fixtures/generate.py
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.checksum import mrz_check_digit, verhoeff_check_digit  # noqa: E402

OUT = Path(__file__).resolve().parent / "samples"

_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]
_MONO_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
]


def _font(size: int, mono: bool = False):
    for p in (_MONO_CANDIDATES if mono else _FONT_CANDIDATES):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# --------------------------------------------------------------------------- #
# Number generators (valid by construction)
# --------------------------------------------------------------------------- #


def make_aadhaar(rng: random.Random) -> str:
    body = str(rng.randint(2, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(10))
    return body + str(verhoeff_check_digit(body))


def make_mrz(
    surname: str, given: str, passport_no: str, nationality: str,
    dob: str, sex: str, expiry: str,
) -> tuple[str, str]:
    name_field = f"{surname}<<{given.replace(' ', '<')}".ljust(39, "<")[:39]
    line1 = f"P<{nationality}{name_field}"

    pn = passport_no.ljust(9, "<")[:9]
    pn_cd = str(mrz_check_digit(pn))
    dob_cd = str(mrz_check_digit(dob))
    exp_cd = str(mrz_check_digit(expiry))
    personal = "<" * 14
    personal_cd = "<"

    partial = f"{pn}{pn_cd}{nationality}{dob}{dob_cd}{sex}{expiry}{exp_cd}{personal}{personal_cd}"
    composite = pn + pn_cd + dob + dob_cd + expiry + exp_cd + personal + personal_cd
    line2 = partial + str(mrz_check_digit(composite))
    return line1, line2[:44]


def make_dl(rng: random.Random, state: str = "MH") -> str:
    return f"{state}{rng.randint(10, 99):02d}{rng.randint(10000000, 99999999)}"


# --------------------------------------------------------------------------- #
# Card renderers
# --------------------------------------------------------------------------- #


def _card(w=1000, h=630, bg=(252, 252, 250)) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (w, h), bg)
    return img, ImageDraw.Draw(img)


def aadhaar_card(number: str, name="Ravi Kumar Sharma", dob="14/08/1991", gender="Male"):
    img, d = _card()
    d.rectangle([0, 0, 1000, 90], fill=(240, 240, 236))
    d.text((30, 28), "GOVERNMENT OF INDIA", font=_font(34), fill=(20, 20, 20))
    d.rectangle([30, 130, 250, 430], outline=(120, 120, 120), width=3)
    d.text((72, 265), "PHOTO", font=_font(30), fill=(150, 150, 150))

    d.text((300, 150), name, font=_font(42), fill=(10, 10, 10))
    d.text((300, 230), f"DOB: {dob}", font=_font(34), fill=(10, 10, 10))
    d.text((300, 295), gender, font=_font(34), fill=(10, 10, 10))
    pretty = f"{number[0:4]} {number[4:8]} {number[8:12]}"
    d.text((300, 400), pretty, font=_font(58, mono=True), fill=(10, 10, 10))
    d.text((300, 500), "MERA AADHAAR MERI PEHCHAN", font=_font(26), fill=(60, 60, 60))
    return img


def passport_page(line1: str, line2: str, name="RAVI KUMAR SHARMA", dob="14/08/1991"):
    img, d = _card(1100, 760, bg=(250, 249, 245))
    d.text((40, 30), "REPUBLIC OF INDIA", font=_font(38), fill=(20, 20, 20))
    d.rectangle([40, 110, 300, 450], outline=(120, 120, 120), width=3)
    d.text((110, 270), "PHOTO", font=_font(30), fill=(150, 150, 150))
    d.text((360, 130), f"Surname / Given names", font=_font(24), fill=(90, 90, 90))
    d.text((360, 170), name, font=_font(40), fill=(10, 10, 10))
    d.text((360, 250), f"Date of Birth: {dob}", font=_font(30), fill=(10, 10, 10))
    d.text((360, 310), "Nationality: INDIAN", font=_font(30), fill=(10, 10, 10))

    d.rectangle([0, 560, 1100, 760], fill=(255, 255, 255))
    mono = _font(38, mono=True)
    d.text((30, 600), line1, font=mono, fill=(0, 0, 0))
    d.text((30, 670), line2, font=mono, fill=(0, 0, 0))
    return img


def dl_card(number: str, name="Ravi Kumar Sharma", dob="14/08/1991"):
    img, d = _card()
    d.rectangle([0, 0, 1000, 90], fill=(232, 238, 245))
    d.text((30, 28), "INDIAN UNION DRIVING LICENCE", font=_font(34), fill=(20, 20, 20))
    d.rectangle([30, 130, 250, 430], outline=(120, 120, 120), width=3)
    d.text((72, 265), "PHOTO", font=_font(30), fill=(150, 150, 150))
    d.text((300, 150), f"DL No: {number}", font=_font(44, mono=True), fill=(10, 10, 10))
    d.text((300, 240), name, font=_font(40), fill=(10, 10, 10))
    d.text((300, 315), f"DOB: {dob}", font=_font(34), fill=(10, 10, 10))
    d.text((300, 390), "Valid Till: 13/08/2031", font=_font(32), fill=(10, 10, 10))
    return img


def generate(seed: int = 26188) -> dict[str, Path]:
    rng = random.Random(seed)
    OUT.mkdir(parents=True, exist_ok=True)

    aadhaar_no = make_aadhaar(rng)
    l1, l2 = make_mrz("SHARMA", "RAVI KUMAR", "M1234567", "IND", "910814", "M", "310813")
    dl_no = make_dl(rng)

    paths = {
        "aadhaar": OUT / "aadhaar_valid.png",
        "passport": OUT / "passport_valid.png",
        "dl": OUT / "dl_valid.png",
    }
    aadhaar_card(aadhaar_no).save(paths["aadhaar"])
    passport_page(l1, l2).save(paths["passport"])
    dl_card(dl_no).save(paths["dl"])

    # A tampered Aadhaar: last digit altered so the Verhoeff checksum fails.
    bad = aadhaar_no[:-1] + str((int(aadhaar_no[-1]) + 5) % 10)
    paths["aadhaar_invalid"] = OUT / "aadhaar_invalid.png"
    aadhaar_card(bad).save(paths["aadhaar_invalid"])

    (OUT / "MANIFEST.txt").write_text(
        "Synthetic fixtures — fabricated numbers, no real PII.\n"
        f"aadhaar_valid.png   {aadhaar_no}  (valid Verhoeff)\n"
        f"aadhaar_invalid.png {bad}  (deliberately broken checksum)\n"
        f"passport_valid.png  {l2}\n"
        f"dl_valid.png        {dl_no}\n"
    )
    return paths


if __name__ == "__main__":
    for k, v in generate().items():
        print(f"{k:20s} -> {v}")
    print((OUT / "MANIFEST.txt").read_text())
