"""AI Chatbot API — Officer Screening Assistant & Intelligence Decision Support."""

from __future__ import annotations

import re
from typing import Any
from fastapi import APIRouter
from ..models.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Knowledge base definitions for offline decision support
KNOWLEDGE_BASE = {
    "mrz": """**Passport MRZ (Machine Readable Zone) Rules:**
- Line 1: Document code (P), Type, Issuing Country (3 letters), Surname<<Given Names.
- Line 2: Passport Number (9 chars + check digit), Nationality (3 letters), Date of Birth (YYMMDD + check digit), Sex (M/F/<), Expiration Date (YYMMDD + check digit), Personal Number (+ check digit), Composite check digit.
- All check digits use **7-3-1 weight algorithm** (modulo 10).
- If MRZ checksum fails, verify optical alignment, font consistency (OCR-B font), and physical UV/microprint features.""",

    "verhoeff": """**Aadhaar Verhoeff Checksum Standard:**
- 12-digit UID ends with a mandatory Verhoeff check digit calculated using D5 dihedral group operations.
- Deterministic check: Validates typing/transmission errors and single-digit transposition.
- **Privacy mandate:** Raw 12-digit UID must NEVER be logged or stored in cloud databases. VeriShield automatically masks the first 8 digits (e.g. `XXXX-XXXX-1234`).""",

    "ela": """**Error Level Analysis (ELA) & Tamper Scoring:**
- ELA detects inconsistent JPEG compression artifacts across image surfaces.
- **Tamper Score < 25%:** Low risk (Clean document surface).
- **Tamper Score 25-60%:** Moderate risk (Possible font overlay, compression anomaly, or photo edit).
- **Tamper Score > 60%:** High risk (Likely digital tampering / copy-paste forgery). Re-examine physical document under UV / raking light.""",

    "face": """**Biometric Face Match Protocols:**
- **Match Score >= 75%:** Clear match confidence.
- **Match Score 50% - 74%:** Borderline / Review band. Inspect age difference, lighting, or glasses/headwear.
- **Match Score < 50%:** Mismatch / Escalate band. Require secondary identity document or biometric lookup.""",

    "bands": """**Risk Band Definitions & Protocol Actions:**
1. **CLEAR (Green):** All deterministic checksums pass, face match >= 75%, tamper score < 25%. Proceed with standard clearance.
2. **REVIEW (Yellow):** Minor OCR confidence drop, checksum warning, or face score 50-74%. Officer manual inspection recommended.
3. **ESCALATE (Red):** Checksum failure, document number mismatch, high tamper score (>60%), or face mismatch (<50%). Mandatory supervisor review and secondary screening."""
}

@router.post("", response_model=ChatResponse)
@router.post("/", response_model=ChatResponse)
def handle_chat(req: ChatRequest) -> ChatResponse:
    query = req.message.lower().strip()
    
    # Analyze query keywords
    reply_lines: list[str] = []
    sources: list[str] = []
    suggestions: list[str] = []
    
    if any(k in query for k in ["mrz", "passport", "machine readable"]):
        reply_lines.append(KNOWLEDGE_BASE["mrz"])
        sources.append("ICAO Doc 9303 Standard")
        suggestions.extend(["How to check Aadhaar Verhoeff?", "What are Escalate Risk Band rules?"])
        
    if any(k in query for k in ["aadhaar", "verhoeff", "uid", "uidai"]):
        reply_lines.append(KNOWLEDGE_BASE["verhoeff"])
        sources.append("UIDAI Verhoeff Algorithm Specs")
        suggestions.extend(["Explain ELA Tamper Detection", "What to do on Face Mismatch?"])
        
    if any(k in query for k in ["ela", "tamper", "forgery", "fake", "edited", "manipulat"]):
        reply_lines.append(KNOWLEDGE_BASE["ela"])
        sources.append("VeriShield Forensic Vision Module")
        suggestions.extend(["Biometric Face Match rules", "Risk Band protocol actions"])
        
    if any(k in query for k in ["face", "match", "biometric", "photo", "face score"]):
        reply_lines.append(KNOWLEDGE_BASE["face"])
        sources.append("VeriShield Face Embedder Specs")
        suggestions.extend(["Explain ELA Tamper Detection", "How to verify Passport MRZ?"])
        
    if any(k in query for k in ["risk", "band", "escalate", "review", "clear", "protocol"]):
        reply_lines.append(KNOWLEDGE_BASE["bands"])
        sources.append("VeriShield Field SOP Directives")
        suggestions.extend(["MRZ Checksum rules", "Aadhaar Verhoeff checksums"])
        
    if any(k in query for k in [
        "admin", "passcode", "password", "secret", "login", "access",
        "signing key", "private key", "device key", "api key", "token",
        "credential", "signing", "hmac", "ecdsa key",
    ]):
        reply_lines.append("🛡️ **HQ Admin Access Security Notice:**\nAdministrative credentials are protected and cannot be disclosed. Use the authorized HQ authentication method.")
        suggestions.append("Explain Risk Band rules")

    if not reply_lines:
        reply_lines.append(
            f"🤖 **VeriShield AI Field Assistant**\n\n"
            f"I am ready to assist with checkpoint verification guidelines, forgery analysis, and screening protocols.\n\n"
            f"**You can ask me about:**\n"
            f"• **Passport MRZ Checksums:** Rules for 7-3-1 modulo 10 verification.\n"
            f"• **Aadhaar Verhoeff Algorithm:** Dihedral D5 check digit math & UID masking.\n"
            f"• **ELA Tamper Scoring:** Spotting image compression anomalies and photo edits.\n"
            f"• **Face Match Criteria:** Confidence bands for biometric verification.\n"
            f"• **Risk Bands:** Protocols for CLEAR, REVIEW, and ESCALATE decisions."
        )
        suggestions = [
            "Explain MRZ Checksum rules",
            "How to detect ELA forgery?",
            "What triggers Escalate status?",
            "Aadhaar Verhoeff rules"
        ]
        sources = ["VeriShield AI Assistant Engine"]

    return ChatResponse(
        reply="\n\n".join(reply_lines),
        suggested_actions=suggestions[:4],
        sources=sources
    )
