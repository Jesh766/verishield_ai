"""OCR service.

+---------------------------------------------------------------------------+
| THIS IS A REAL LEARNED MODEL.                                              |
| Tesseract 5.x uses an LSTM recogniser trained on large text corpora. We    |
| run inference locally (no network). The preprocessing chain below is       |
| deterministic image maths; the recognition itself is the model.            |
+---------------------------------------------------------------------------+
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .. import config


class OCRUnavailable(RuntimeError):
    """Raised when the OCR engine is not installed on this device."""


def _load_engine():
    import pytesseract  # imported lazily so the API can boot without it

    if config.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
    try:
        pytesseract.get_tesseract_version()
    except Exception as exc:  # pragma: no cover - environment dependent
        raise OCRUnavailable(
            "Tesseract OCR is not installed or not on PATH on this device. "
            "Install Tesseract 5.x and restart the VeriShield service."
        ) from exc
    return pytesseract


def engine_info() -> dict[str, Any]:
    try:
        pytesseract = _load_engine()
        return {
            "engine": "tesseract",
            "version": str(pytesseract.get_tesseract_version()),
            "available": True,
            "is_ai": True,
            "note": "LSTM text recogniser running locally. No network calls.",
        }
    except Exception as exc:
        return {"engine": config.OCR_ENGINE, "available": False, "is_ai": True, "error": str(exc)}


# --------------------------------------------------------------------------- #
# Preprocessing (deterministic image maths, not AI)
# --------------------------------------------------------------------------- #


def _deskew(img: Image.Image) -> Image.Image:
    """Estimate skew from the dominant dark-pixel row profile and rotate back."""
    arr = np.asarray(img.convert("L"), dtype=np.uint8)
    if arr.size == 0:
        return img
    binary = (arr < 128).astype(np.float32)
    best_angle, best_score = 0.0, -1.0
    for angle in np.arange(-6, 6.5, 1.5):
        rotated = np.asarray(
            Image.fromarray((binary * 255).astype(np.uint8)).rotate(
                angle, resample=Image.BILINEAR, fillcolor=0
            ),
            dtype=np.float32,
        )
        profile = rotated.sum(axis=1)
        score = float(np.var(profile))
        if score > best_score:
            best_score, best_angle = score, float(angle)
    if abs(best_angle) < 0.5:
        return img
    return img.rotate(best_angle, resample=Image.BICUBIC, fillcolor="white")


def preprocess(image: Image.Image, binarize: bool = False) -> Image.Image:
    """Grayscale, deskew and upscale.

    Binarisation is OFF by default: on clean phone captures it destroys thin
    glyph strokes and Tesseract's own internal thresholding does better. It is
    kept as a second variant for low-contrast or shadowed captures, and
    run_ocr() picks whichever variant the model is more confident about.
    """
    img = ImageOps.exif_transpose(image).convert("L")
    img = ImageOps.autocontrast(img)
    img = _deskew(img)

    # Upscale so glyph x-height reaches Tesseract's preferred ~30px.
    target = 2000
    if min(img.size) < target:
        factor = min(3.0, target / max(1, min(img.size)))
        if factor > 1.05:
            img = img.resize(
                (int(img.width * factor), int(img.height * factor)), Image.LANCZOS
            )

    if not binarize:
        return img

    img = img.filter(ImageFilter.MedianFilter(size=3))
    # Adaptive-ish threshold: local mean via a box blur, then compare.
    arr = np.asarray(img, dtype=np.float32)
    local_mean = np.asarray(img.filter(ImageFilter.BoxBlur(25)), dtype=np.float32)
    binary = np.where(arr > local_mean - 12, 255, 0).astype(np.uint8)
    return Image.fromarray(binary)


# --------------------------------------------------------------------------- #
# Recognition
# --------------------------------------------------------------------------- #


def _recognise(
    pytesseract, image: Image.Image, psm: int
) -> tuple[str, list[dict[str, Any]], float]:
    cfg = f"--oem 3 --psm {psm}"
    text = pytesseract.image_to_string(image, lang=config.OCR_LANGS, config=cfg)
    data = pytesseract.image_to_data(
        image, lang=config.OCR_LANGS, config=cfg, output_type=pytesseract.Output.DICT
    )

    words: list[dict[str, Any]] = []
    for word, conf in zip(data.get("text", []), data.get("conf", [])):
        try:
            c = float(conf)
        except (TypeError, ValueError):
            continue
        if word and word.strip() and c >= 0:
            words.append({"text": word.strip(), "confidence": round(c, 1)})

    mean_conf = round(sum(w["confidence"] for w in words) / len(words), 1) if words else 0.0
    return text, words, mean_conf


MRZ_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"


def read_mrz_strip(image_bytes: bytes) -> str:
    """Second OCR pass restricted to the machine-readable zone.

    The MRZ sits in the bottom band of a passport data page and uses only
    A-Z, 0-9 and '<'. Constraining the character set to that alphabet stops
    the recogniser emitting look-alike letters for the filler character.
    """
    pytesseract = _load_engine()
    img = ImageOps.exif_transpose(Image.open(BytesIO(image_bytes))).convert("L")
    strip = img.crop((0, int(img.height * 0.70), img.width, img.height))
    strip = ImageOps.autocontrast(strip)
    if strip.width < 2200:
        factor = min(3.0, 2200 / max(1, strip.width))
        strip = strip.resize((int(strip.width * factor), int(strip.height * factor)), Image.LANCZOS)
    cfg = f"--oem 3 --psm 6 -c tessedit_char_whitelist={MRZ_CHARSET}"
    return pytesseract.image_to_string(strip, lang=config.OCR_LANGS, config=cfg)


def run_ocr(image_bytes: bytes, psm: int = 6, mrz: bool = False) -> dict[str, Any]:
    """Run local OCR and return raw text plus per-word confidences.

    Two preprocessing variants are tried and the higher-confidence one wins.
    This is still one learned model (Tesseract's LSTM) — the variants are just
    deterministic image preparation.
    """
    pytesseract = _load_engine()

    try:
        original = Image.open(BytesIO(image_bytes))
        original.load()
    except Exception as exc:
        raise ValueError(
            "That file could not be read as an image. Capture the document "
            "again as JPEG or PNG."
        ) from exc

    attempts: list[tuple[str, str, list[dict[str, Any]], float]] = []
    for label, binarize in (("upscaled-grayscale", False), ("binarised", True)):
        image = preprocess(original, binarize=binarize)
        text, words, conf = _recognise(pytesseract, image, psm)
        attempts.append((label, text, words, conf))
        if conf >= 85 and len(text.strip()) >= 20:
            break  # good enough; don't burn CPU on a field device

    label, raw_text, words, mean_conf = max(
        attempts, key=lambda a: (len(a[1].strip()) >= 20, a[3])
    )

    # Sparse-mode rescue for odd crops.
    if len(raw_text.strip()) < 20:
        raw_text, words, mean_conf = _recognise(pytesseract, preprocess(original), 11)
        label = "sparse-rescue"

    if mrz:
        try:
            mrz_text = read_mrz_strip(image_bytes)
        except Exception:
            mrz_text = ""
        if mrz_text.strip():
            raw_text = f"{raw_text}\n{mrz_text}"
            label += "+mrz-pass"

    return {
        "raw_text": raw_text,
        "words": words,
        "mean_confidence": mean_conf,
        "engine": "tesseract",
        "variant": label,
        "is_ai": True,
        "method": "Learned LSTM text recogniser (Tesseract 5.x), run locally.",
        "image_size": list(original.size),
    }
