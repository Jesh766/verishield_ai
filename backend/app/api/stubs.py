"""Declared-but-unbuilt endpoints.

These return an explicit 501 naming the phase they land in. They exist so the
API surface is honest: nothing here pretends to work, and nothing silently
returns a fabricated score.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["not implemented"])


def _not_yet(component: str, phase: int):
    raise HTTPException(
        501,
        detail=f"{component} is not implemented yet (planned for Phase {phase}). "
               "This endpoint returns no score by design — VeriShield never "
               "fabricates a result.",
    )


@router.post("/documents/{document_id}/face-match")
def face_match(document_id: str):
    _not_yet("Server-side face match (dlib/DeepFace embeddings)", 3)


@router.post("/documents/{document_id}/tamper")
def tamper(document_id: str):
    _not_yet("Server-side tamper detection", 3)


@router.post("/documents/{document_id}/risk")
def risk(document_id: str):
    _not_yet("Server-side risk score model", 3)


@router.post("/assistant/query")
def assistant():
    raise HTTPException(
        410,
        detail="The Officer Assistant runs entirely on-device (client-side intent "
               "matching over the current session) and never calls this backend. "
               "This endpoint is intentionally unused.",
    )


@router.post("/sync")
def sync_stub():
    _not_yet("Deprecated generic sync endpoint (use POST /sync/session)", 2)