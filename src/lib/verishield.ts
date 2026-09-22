/**
 * VeriShield Field Mode — on-device screening pipeline.
 *
 * Everything below runs inside the officer's browser: no server, no upload, no
 * network call. That is what makes the system work at a checkpoint with no
 * signal, and why a raw identity image never leaves the handset.
 */

import { DISCLAIMER, type CheckItem } from "./engine/checksum";
import type { Classification } from "./engine/classify";
import { analyseTamper, type TamperResult } from "./engine/ela";
import {
  DOC_LABEL,
  FIELD_LABEL,
  HIDDEN_FIELDS,
  maskNumber,
  type DocumentType,
} from "./engine/extract";
import { matchFaces, type FaceMatchResult } from "./engine/face";
import {
  getSession,
  listSessions,
  markSynced,
  newSessionId,
  pendingSyncCount,
  saveSession,
  updateSession,
  type StoredSession,
} from "./engine/ledger";
import { checksFor, recogniseDocument, warmOcr, type OcrResult } from "./engine/ocr";
import { scoreRisk, type RiskBand, type RiskResult } from "./engine/risk";

export type {
  CheckItem,
  Classification,
  DocumentType,
  FaceMatchResult,
  OcrResult,
  RiskBand,
  RiskResult,
  StoredSession,
  TamperResult,
};
export {
  DISCLAIMER,
  DOC_LABEL,
  FIELD_LABEL,
  HIDDEN_FIELDS,
  getSession,
  listSessions,
  markSynced,
  maskNumber,
  pendingSyncCount,
  updateSession,
  warmOcr,
  analyseTamper,
  matchFaces,
};

export const OFFICER_ID = "OFF-DEMO-01";

export const DOC_TYPES: DocumentType[] = ["aadhaar", "passport", "visa", "dl"];

const MASKED = new Set(["aadhaar_number", "passport_number", "visa_number", "dl_number"]);

export { checksFor };

export function maskFields(fields: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (HIDDEN_FIELDS.has(k)) continue;
    out[k] = MASKED.has(k) ? maskNumber(v) : v;
  }
  return out;
}

export type ScreeningResult = {
  sessionId: string;
  documentType: DocumentType;
  ocr: OcrResult;
  checks: CheckItem[];
  maskedFields: Record<string, string>;
  tamper: TamperResult;
  tamperUnavailable: boolean;
  face: FaceMatchResult | null;
  risk: RiskResult;
  createdAt: string;
};

/** A neutral placeholder shown when the ELA stage itself throws (as opposed to
 * completing with a low/uncertain score). This keeps the officer's decision
 * options intact — OCR and checksum results, the load-bearing evidence, are
 * never lost because a secondary module had a bad frame. */
function tamperUnavailableResult(reason: string): TamperResult {
  return {
    score: 0,
    verdict: "inconclusive",
    headline: "Tamper analysis could not run",
    detail: reason,
    hotspots: 0,
    meanError: 0,
    outlierRatio: 0,
    edgeConcentration: 0,
    heatmap: "",
  };
}

/**
 * Full screening pass. `selfie` is optional — the face module only runs when
 * the officer captures the holder's face.
 */
export async function screen(
  documentImage: Blob,
  selfie: Blob | null,
  onStatus?: (s: string) => void,
  forcedType: DocumentType | null = null,
  officerId: string = OFFICER_ID,
): Promise<ScreeningResult> {
  onStatus?.("Preparing the on-device engine…");
  // OCR and checksum are load-bearing: if these fail, the officer genuinely
  // has nothing to work with, so that failure is allowed to propagate and the
  // caller shows a recapture prompt. Everything after this point is
  // supplementary evidence and is isolated so a bad frame in one module never
  // costs the officer the results that DID work.
  const ocr = await recogniseDocument(documentImage, forcedType, onStatus);
  const documentType = ocr.documentType;

  onStatus?.("Running deterministic structural checks…");
  const checks = checksFor(documentType, ocr.fields);

  onStatus?.("Error Level Analysis — screening for edited regions…");
  let tamper: TamperResult;
  let tamperUnavailable = false;
  try {
    tamper = await analyseTamper(documentImage);
  } catch {
    tamper = tamperUnavailableResult(
      "The recompression analysis could not run on this capture. This does not affect the OCR or checksum results above — recapture in better light to get a tamper reading.",
    );
    tamperUnavailable = true;
  }

  let face: FaceMatchResult | null = null;
  if (selfie) {
    onStatus?.("Comparing the live face with the document portrait…");
    try {
      face = await matchFaces(documentImage, selfie);
    } catch {
      face = {
        score: 0,
        verdict: "no_face",
        headline: "Face comparison could not run",
        detail:
          "The face module hit an error on this pair of captures. OCR and checksum results are unaffected — retake the live photo and try again if you need a face match.",
        documentFaceFound: false,
        selfieFaceFound: false,
        method: "unavailable",
      };
    }
  }

  onStatus?.("Aggregating advisory risk…");
  const risk = scoreRisk({ checks, ocrConfidence: ocr.confidence, tamper, face });

  const session: StoredSession = {
    id: newSessionId(),
    documentType,
    createdAt: new Date().toISOString(),
    officerId,
    maskedFields: maskFields(ocr.fields),
    checks,
    ocrConfidence: ocr.confidence,
    tamperScore: tamper.score,
    tamperVerdict: tamper.verdict,
    faceScore: face && face.verdict !== "no_face" ? face.score : null,
    faceVerdict: face?.verdict ?? null,
    risk,
    decision: null,
    note: "",
    synced: false,
  };
  saveSession(session);

  return {
    sessionId: session.id,
    documentType,
    ocr,
    checks,
    maskedFields: session.maskedFields,
    tamperUnavailable,
    tamper,
    face,
    risk,
    createdAt: session.createdAt,
  };
}

export const recordDecision = (
  sessionId: string,
  decision: "cleared" | "referred" | "rejected",
  note: string,
) => updateSession(sessionId, { decision, note });

export const DECISION_LABEL: Record<string, string> = {
  cleared: "Cleared",
  referred: "Referred for secondary inspection",
  rejected: "Rejected",
};
