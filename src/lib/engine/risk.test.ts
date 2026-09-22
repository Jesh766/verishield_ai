import { describe, expect, it } from "vitest";
import type { CheckItem } from "./checksum";
import type { TamperResult } from "./ela";
import type { FaceMatchResult } from "./face";
import { scoreRisk } from "./risk";

const passingChecks: CheckItem[] = [
  {
    check: "aadhaar_format",
    label: "12-digit format",
    passed: true,
    detail: "",
    kind: "deterministic",
  },
  { check: "aadhaar_verhoeff", label: "Verhoeff", passed: true, detail: "", kind: "deterministic" },
];

const cleanTamper: TamperResult = {
  score: 5,
  verdict: "clean",
  headline: "",
  detail: "",
  hotspots: 0,
  meanError: 0,
  outlierRatio: 0,
  edgeConcentration: 0,
  heatmap: "",
};

describe("scoreRisk", () => {
  it("bands a fully clean screening as 'clear'", () => {
    const result = scoreRisk({
      checks: passingChecks,
      ocrConfidence: 90,
      tamper: cleanTamper,
      face: null,
    });
    expect(result.band).toBe("clear");
    expect(result.score).toBeLessThan(22);
  });

  it("documents current behaviour: one failed critical checksum alone lands in 'review', not 'escalate'", () => {
    // FLAGGED FOR THE TEAM, NOT SILENTLY CHANGED: a Verhoeff failure on a
    // confident read means the number printed on the document cannot have
    // been legitimately issued - that is about as strong a single signal as
    // this system produces, yet it currently scores 45 points against a
    // 55-point escalate threshold and lands in "review" instead. Decide on
    // purpose whether that is the intended sensitivity before SIH judging;
    // if not, this is a one-line threshold change in risk.ts.
    const failing: CheckItem[] = [
      {
        check: "aadhaar_verhoeff",
        label: "Verhoeff",
        passed: false,
        detail: "",
        kind: "deterministic",
      },
    ];
    const result = scoreRisk({
      checks: failing,
      ocrConfidence: 90,
      tamper: cleanTamper,
      face: null,
    });
    expect(result.band).toBe("review");
    expect(result.score).toBe(45);
  });

  it("weights the same failed check down when OCR confidence was low", () => {
    // The whole point of this design: a failure behind a blurry read is more
    // likely a misread than a forgery, so it must never carry full weight.
    const failing: CheckItem[] = [
      {
        check: "aadhaar_verhoeff",
        label: "Verhoeff",
        passed: false,
        detail: "",
        kind: "deterministic",
      },
    ];
    const confident = scoreRisk({ checks: failing, ocrConfidence: 90, tamper: null, face: null });
    const unsure = scoreRisk({ checks: failing, ocrConfidence: 30, tamper: null, face: null });
    expect(unsure.score).toBeLessThan(confident.score);
  });

  it("documents current behaviour: a face mismatch alone also lands in 'review', not 'escalate'", () => {
    // Same finding as above - a face mismatch scores 35 points, still under
    // the 55-point escalate line. It takes two independent negative signals
    // together (e.g. a failed checksum AND a face mismatch) to escalate.
    // That may be exactly the right design (avoid single-signal false
    // escalations) - flagging it so it's a deliberate choice, not a surprise
    // in front of a judge who tests one signal at a time.
    const mismatch: FaceMatchResult = {
      score: 12,
      verdict: "mismatch",
      headline: "",
      detail: "",
      documentFaceFound: true,
      selfieFaceFound: true,
      method: "test",
    };
    const result = scoreRisk({
      checks: passingChecks,
      ocrConfidence: 90,
      tamper: cleanTamper,
      face: mismatch,
    });
    expect(result.band).toBe("review");
    expect(result.score).toBe(35);
  });

  it("does not let a below-threshold ELA reading count as evidence (avoids false positives on re-photographed printed cards)", () => {
    const noisyButClean: TamperResult = { ...cleanTamper, score: 30, hotspots: 1 };
    const result = scoreRisk({
      checks: passingChecks,
      ocrConfidence: 90,
      tamper: noisyButClean,
      face: null,
    });
    expect(result.contributions.find((c) => c.source === "ela_tamper")).toBeUndefined();
  });

  it("always returns a score in [0, 100] even with every negative signal at once", () => {
    const allFail: CheckItem[] = [
      { check: "aadhaar_verhoeff", label: "a", passed: false, detail: "", kind: "deterministic" },
      { check: "composite", label: "b", passed: false, detail: "", kind: "deterministic" },
      { check: "unreadable", label: "c", passed: null, detail: "", kind: "deterministic" },
    ];
    const badTamper: TamperResult = { ...cleanTamper, score: 95, hotspots: 10 };
    const badFace: FaceMatchResult = {
      score: 5,
      verdict: "mismatch",
      headline: "",
      detail: "",
      documentFaceFound: true,
      selfieFaceFound: true,
      method: "test",
    };
    const result = scoreRisk({
      checks: allFail,
      ocrConfidence: 15,
      tamper: badTamper,
      face: badFace,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("never throws when called with only the required fields (defensive default)", () => {
    expect(() => scoreRisk({ checks: [], ocrConfidence: 0 })).not.toThrow();
  });

  it("promotes the top contribution's specific reason into the headline, not just the band name", () => {
    // This is the fix for "can't tell what the main error is": the headline
    // must name the actual reason, not just say something generic like
    // "manual review recommended".
    const failing: CheckItem[] = [
      {
        check: "aadhaar_verhoeff",
        label: "Verhoeff check digit",
        passed: false,
        detail: "",
        kind: "deterministic",
      },
    ];
    const result = scoreRisk({
      checks: failing,
      ocrConfidence: 90,
      tamper: cleanTamper,
      face: null,
    });
    expect(result.headline).toContain("Verhoeff check digit failed");
    expect(result.primaryReason).toBe("Verhoeff check digit failed");
  });

  it("falls back to the generic band label only when there is genuinely nothing to point to", () => {
    const result = scoreRisk({
      checks: passingChecks,
      ocrConfidence: 90,
      tamper: cleanTamper,
      face: null,
    });
    expect(result.band).toBe("clear");
    expect(result.headline).toBe("No blocking anomalies detected");
    expect(result.primaryReason).toBeNull();
  });
});
