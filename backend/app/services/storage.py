"""Ephemeral image store.

PRIVACY REQUIREMENT (hard): raw document images and selfies never reach the
database and never outlive the active session. They are written to a temp
directory keyed by document_id, swept after a TTL, and deleted the moment the
session is closed.
"""

from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from .. import config


@dataclass
class StoredImage:
    document_id: str
    path: Path
    created_at: float
    content_type: str
    size: int


_INDEX: dict[str, StoredImage] = {}


def _ensure_dir() -> Path:
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return config.UPLOAD_DIR


def save(data: bytes, content_type: str, suffix: str = ".img") -> StoredImage:
    _ensure_dir()
    sweep()
    document_id = uuid.uuid4().hex
    path = config.UPLOAD_DIR / f"{document_id}{suffix}"
    path.write_bytes(data)
    item = StoredImage(document_id, path, time.time(), content_type, len(data))
    _INDEX[document_id] = item
    return item


def get(document_id: str) -> StoredImage | None:
    sweep()
    item = _INDEX.get(document_id)
    if item and item.path.exists():
        return item
    _INDEX.pop(document_id, None)
    return None


def read(document_id: str) -> bytes | None:
    item = get(document_id)
    return item.path.read_bytes() if item else None


def purge(document_id: str) -> bool:
    item = _INDEX.pop(document_id, None)
    if not item:
        return False
    item.path.unlink(missing_ok=True)
    return True


def sweep() -> int:
    """Delete anything older than the TTL. Called on every access."""
    now = time.time()
    expired = [k for k, v in _INDEX.items() if now - v.created_at > config.UPLOAD_TTL_SECONDS]
    for k in expired:
        _INDEX[k].path.unlink(missing_ok=True)
        _INDEX.pop(k, None)

    # Also catch orphans left behind by an unclean shutdown.
    if config.UPLOAD_DIR.exists():
        for f in config.UPLOAD_DIR.iterdir():
            try:
                if now - f.stat().st_mtime > config.UPLOAD_TTL_SECONDS:
                    f.unlink(missing_ok=True)
            except OSError:
                pass
    return len(expired)


def purge_all() -> int:
    n = len(_INDEX)
    for k in list(_INDEX):
        purge(k)
    return n


def id_hash(value: str | None) -> str | None:
    """One-way hash of a document number.

    Enables cross-document matching (Phase 7) and duplicate detection without
    ever persisting the number itself.
    """
    if not value:
        return None
    normalised = "".join(ch for ch in value.upper() if ch.isalnum())
    return hashlib.sha256((config.ID_HASH_SALT + normalised).encode()).hexdigest()
