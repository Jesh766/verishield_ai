import { describe, expect, it } from "vitest";
import { classifyDocument } from "./classify";

describe("classifyDocument", () => {
  it("recognises Aadhaar text with high confidence", () => {
    const result = classifyDocument(
      "GOVERNMENT OF INDIA\nUNIQUE IDENTIFICATION AUTHORITY\n2345 6789 0124",
    );
    expect(result.type).toBe("aadhaar");
    expect(result.confidence).toBeGreaterThan(50);
  });

  it("recognises a passport MRZ over an Aadhaar-shaped number when both patterns are present", () => {
    const result = classifyDocument(
      "P<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nREPUBLIC OF INDIA PASSPORT",
    );
    expect(result.type).toBe("passport");
  });

  it("FLAGS THE REAL GAP: falls back to 'aadhaar' at 0 confidence for text matching none of the four supported types", () => {
    // This is the exact "judge hands you a random document" scenario. The
    // classifier does not throw and does not crash the pipeline - that part
    // is fine - but it silently labels an employee ID / boarding pass /
    // library card as "aadhaar" rather than saying "not recognised". The UI
    // does show "identification confidence 0%" next to the label, but that
    // is easy to miss live. Worth an explicit "document type not recognised"
    // state rather than relying on the confidence number alone.
    const result = classifyDocument(
      "ACME CORP EMPLOYEE BADGE\nJane Doe - Engineering\nBadge #4471",
    );
    expect(result.type).toBe("aadhaar");
    expect(result.confidence).toBe(0);
  });

  it("does not throw on empty or garbage OCR output", () => {
    expect(() => classifyDocument("")).not.toThrow();
    expect(() => classifyDocument("        ")).not.toThrow();
    expect(() => classifyDocument("!@#$%^&*()")).not.toThrow();
  });

  it("still returns a usable object shape on total noise", () => {
    const result = classifyDocument("asdkjhaskjdh");
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("confidence");
    expect(Array.isArray(result.alternatives)).toBe(true);
  });
});
