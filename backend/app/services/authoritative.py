"""Authoritative Government Verification Provider Abstraction.

IMPORTANT ARCHITECTURAL PRINCIPLE:
This prototype performs LOCAL SCREENING ONLY.
Live government APIs (UIDAI, Passport Seva, Parivahan) are NOT currently connected or configured.

This abstraction enables future production integration of authoritative verification APIs
without modifying core backend session logic or replacing offline workflows.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class AuthoritativeResult:
    status: str  # NOT_CONFIGURED, UNAVAILABLE, PENDING, VERIFIED, NOT_VERIFIED, ERROR
    provider: str
    detail: str
    is_authoritative: bool = False
    timestamp: str | None = None

    def dict(self) -> dict[str, Any]:
        return asdict(self)


class AuthoritativeProvider:
    name: str = "none"

    def verify(self, document_type: str, fields: dict[str, Any]) -> AuthoritativeResult:
        raise NotImplementedError


class LocalOnlyVerificationProvider(AuthoritativeProvider):
    name: str = "local_screening_only"

    def verify(self, document_type: str, fields: dict[str, Any]) -> AuthoritativeResult:
        return AuthoritativeResult(
            status="NOT_CONFIGURED",
            provider="none",
            detail="Authoritative government verification is NOT currently configured or connected in this prototype. Screening is local-only.",
            is_authoritative=False,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


_CURRENT_PROVIDER: AuthoritativeProvider = LocalOnlyVerificationProvider()


def get_authoritative_provider() -> AuthoritativeProvider:
    return _CURRENT_PROVIDER


def check_authoritative_verification(document_type: str, fields: dict[str, Any]) -> dict[str, Any]:
    return get_authoritative_provider().verify(document_type, fields).dict()
