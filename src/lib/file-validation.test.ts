import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateUploadFile, formatFileSize } from "./file-validation";

describe("validateUploadFile", () => {
  it("rejects empty files", async () => {
    const empty = new Blob([], { type: "image/jpeg" });
    const result = await validateUploadFile(empty);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects oversized files", async () => {
    // Create a blob larger than 50 MB
    const oversized = new Blob([new ArrayBuffer(51 * 1024 * 1024)], {
      type: "image/jpeg",
    });
    const result = await validateUploadFile(oversized);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("rejects unsupported MIME types", async () => {
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const result = await validateUploadFile(pdf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not supported");
  });

  it("validates JPEG magic bytes", async () => {
    // JPEG: FF D8 FF
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const jpeg = new Blob([jpegHeader], { type: "image/jpeg" });
    const result = await validateUploadFile(jpeg);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("jpeg");
  });

  it("validates PNG magic bytes", async () => {
    // PNG: 89 50 4E 47
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = new Blob([pngHeader], { type: "image/png" });
    const result = await validateUploadFile(png);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("png");
  });

  it("validates WebP magic bytes", async () => {
    // WEBP: 52 49 46 46 ... 57 45 42 50
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const webp = new Blob([webpHeader], { type: "image/webp" });
    const result = await validateUploadFile(webp);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("webp");
  });

  it("rejects MIME spoofing (wrong magic bytes)", async () => {
    // PDF bytes but claiming to be JPEG
    const spoofed = new Blob(["%PDF-1.4"], { type: "image/jpeg" });
    const result = await validateUploadFile(spoofed);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not match");
  });

  it("validates file integrity with correct magic bytes", async () => {
    // JPEG: FF D8 FF
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const jpeg = new Blob([jpegBytes], { type: "image/jpeg" });
    const result = await validateUploadFile(jpeg);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("jpeg");
  });
});

describe("formatFileSize", () => {
  it("formats bytes correctly", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1023)).toBe("1023.00 B");
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
  });
});
