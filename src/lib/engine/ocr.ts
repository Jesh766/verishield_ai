/**
 * On-device text recognition: Tesseract LSTM compiled to WebAssembly.
 *
 * Two things happen here beyond plain OCR:
 *  1. The document type is recognised automatically from the text — the officer
 *     never picks Aadhaar / Passport / Visa / Licence by hand.
 *  2. The page is read more than once (contrast-stretched and binarised). The
 *     variant whose extracted numbers survive their own published check digits
 *     wins. That is what stops a genuine document from being condemned by a
 *     single misread glyph, while a digit that was actually altered fails in
 *     every variant and is reported as a failure.
 */

import { classifyDocument, type Classification } from "./classify";
import {
  aadhaarChecks,
  consistencyChecks,
  dlChecks,
  passportChecks,
  verhoeffValid,
  visaChecks,
  type CheckItem,
} from "./checksum";
import type { DocumentType } from "./extract";
import { extractFields, repairAadhaarNumber } from "./extract";
import { binariseForOcr, loadBitmap, preprocessForOcr } from "./image";

export type OcrResult = {
  text: string;
  confidence: number;
  wordCount: number;
  fields: Record<string, string>;
  repairs: string[];
  engine: string;
  documentType: DocumentType;
  classification: Classification;
  passes: number;
};

type WorkerLike = {
  recognize: (input: unknown) => Promise<{ data: { text: string; confidence: number } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
};

let workerPromise: Promise<WorkerLike> | null = null;

async function getWorker(onStatus?: (s: string) => void): Promise<WorkerLike> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      onStatus?.("Loading the recognition model onto this device…");
      const worker = await createWorker("eng");
      return worker as unknown as WorkerLike;
    })();
  }
  return workerPromise;
}

/** Warm the model up so the first capture is not slowed by the download. */
export const warmOcr = (onStatus?: (s: string) => void) =>
  getWorker(onStatus)
    .then(() => true)
    .catch(() => false);

export function checksFor(type: DocumentType, fields: Record<string, string>): CheckItem[] {
  const base =
    type === "aadhaar"
      ? aadhaarChecks(fields)
      : type === "passport"
        ? passportChecks(fields)
        : type === "visa"
          ? visaChecks(fields)
          : dlChecks(fields);
  const consistency = consistencyChecks(fields);
  return [...base, ...consistency];
}

/** How trustworthy a reading is: check digits that hold are the strongest signal. */
function readingScore(checks: CheckItem[], confidence: number, fieldCount: number) {
  const passed = checks.filter((c) => c.passed === true).length;
  const failed = checks.filter((c) => c.passed === false).length;
  const unknown = checks.filter((c) => c.passed === null).length;
  return passed * 12 - failed * 3 - unknown * 6 + fieldCount * 2 + confidence * 0.12;
}

export async function recogniseDocument(
  file: Blob,
  forcedType: DocumentType | null,
  onStatus?: (s: string) => void,
): Promise<OcrResult> {
  const worker = await getWorker(onStatus);
  const bitmap = await loadBitmap(file);

  onStatus?.("Reading the document (Tesseract LSTM, on this device)…");
  const variants = [
    { name: "contrast", canvas: preprocessForOcr(bitmap) },
    { name: "binarised", canvas: binariseForOcr(bitmap) },
  ];
  bitmap.close?.();

  let best: OcrResult | null = null;
  let bestScore = -Infinity;
  let pass = 0;

  for (const variant of variants) {
    pass += 1;
    onStatus?.(
      pass === 1
        ? "Recognising text and identifying the document…"
        : "Second reading pass — cross-checking the numbers…",
    );
    await worker.setParameters({ tessedit_char_whitelist: "" });
    const { data } = await worker.recognize(variant.canvas);
    const text = data.text ?? "";
    const classification = forcedType
      ? { type: forcedType, confidence: 100, evidence: ["Officer override"], alternatives: [] }
      : classifyDocument(text);
    const type = classification.type;

    let { fields, repairs } = extractFields(type, text);

    // MRZ documents get a dedicated constrained pass — the alphabet is known.
    if ((type === "passport" || type === "visa") && !fields["mrz_line2"]) {
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      });
      const mrzPass = await worker.recognize(variant.canvas);
      const merged = extractFields(type, mrzPass.data.text ?? "");
      if (merged.fields["mrz_line2"]) {
        fields = { ...fields, ...merged.fields };
        repairs = [...repairs, ...merged.repairs];
      }
    }

    // A failing Aadhaar number is far more often a misread digit than a forgery,
    // so it earns a digit-only re-read before it is called a failure.
    if (type === "aadhaar") {
      const current = (fields["aadhaar_number"] ?? "").replace(/\D/g, "");
      if (!current || !verhoeffValid(current)) {
        // Sparse page segmentation on a digit-only alphabet: the number block
        // is read far more reliably than in a full-page pass.
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789 ",
          tessedit_pageseg_mode: "11",
        });
        const digitPass = await worker.recognize(variant.canvas);
        const candidates = [
          ...(digitPass.data.text ?? "").matchAll(/(\d{4})\s?(\d{4})\s?(\d{4})/g),
        ].map((m) => `${m[1]}${m[2]}${m[3]}`);
        await worker.setParameters({ tessedit_pageseg_mode: "3" });
        const confirmed = candidates.find(verhoeffValid);
        if (confirmed) {
          fields = { ...fields, aadhaar_number: confirmed };
          repairs = [...repairs, "number confirmed on a digit-only re-read"];
        } else {
          const base = current || candidates[0] || "";
          const fix = repairAadhaarNumber(base, verhoeffValid);
          if (fix) {
            fields = { ...fields, aadhaar_number: fix.value };
            repairs = [...repairs, `${fix.note} (uniquely confirmed by the Verhoeff check digit)`];
          } else if (!current && candidates[0]) {
            fields = { ...fields, aadhaar_number: candidates[0] };
          }
        }
      }
    }

    const confidence = Math.round((data.confidence ?? 0) * 10) / 10;
    const checks = checksFor(type, fields);
    const score = readingScore(checks, confidence, Object.keys(fields).length);

    if (score > bestScore) {
      bestScore = score;
      best = {
        text,
        confidence,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        fields,
        repairs,
        engine: `Tesseract 5 LSTM (WebAssembly), ${variants.length} reading passes, executed locally`,
        documentType: type,
        classification,
        passes: variants.length,
      };
    }
  }

  if (!best) throw new Error("The capture could not be read");
  return best;
}
