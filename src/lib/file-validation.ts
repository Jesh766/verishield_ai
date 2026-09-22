/**
 * File validation utilities for upload security.
 * Validates file size, MIME type, and magic bytes before processing.
 */

const MAX_FILE_SIZE_MB = 50; // 50 MB limit for images
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * File magic bytes signatures for verification.
 * These are the first few bytes of each file type.
 */
const MAGIC_SIGNATURES: Record<string, Uint8Array> = {
  // JPEG: FF D8 FF
  jpeg: new Uint8Array([0xff, 0xd8, 0xff]),
  // PNG: 89 50 4E 47
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  // WEBP: 52 49 46 46 ... 57 45 42 50
  webp_start: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  // HEIC/HEIF: starts with ftyp box
  heic_start: new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
};

export interface FileValidationResult {
  valid: boolean;
  error?: string | undefined;
  fileSize?: number | undefined;
  mimeType?: string | undefined;
  detectedType?: string | undefined;
}

/**
 * Validate a file for upload.
 * Checks: size, MIME type, and magic bytes.
 */
export async function validateUploadFile(file: Blob): Promise<FileValidationResult> {
  // Size check
  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_MB} MB.`,
      fileSize: file.size,
    };
  }

  // MIME type check
  const mimeType = file.type.toLowerCase();
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `File type ${mimeType} is not supported. Use JPEG, PNG, WebP, or HEIC.`,
      mimeType,
    };
  }

  // Magic bytes check (verify file integrity)
  const magicResult = await checkMagicBytes(file);
  if (!magicResult.valid) {
    return magicResult;
  }

  return {
    valid: true,
    fileSize: file.size,
    mimeType: mimeType || "unknown",
    detectedType: magicResult.detectedType || undefined,
  };
}

/**
 * Check file magic bytes to verify file integrity.
 * Prevents MIME spoofing attacks.
 */
async function checkMagicBytes(file: Blob): Promise<FileValidationResult> {
  try {
    // Read first 32 bytes to check magic bytes
    const header = await file.slice(0, 32).arrayBuffer();
    const bytes = new Uint8Array(header);

    // Check JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { valid: true, detectedType: "jpeg" };
    }

    // Check PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { valid: true, detectedType: "png" };
    }

    // Check WEBP (RIFF header + WEBP signature)
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return { valid: true, detectedType: "webp" };
    }

    // Check HEIC/HEIF (ftyp box)
    if (file.size >= 8) {
      const isHeic = [
        // ftyp heic
        bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
      ][0];
      if (isHeic) {
        return { valid: true, detectedType: "heic" };
      }
    }

    // File doesn't match known signatures
    return {
      valid: false,
      error:
        "File header does not match expected format. The file may be corrupted or MIME spoofed.",
    };
  } catch {
    return {
      valid: false,
      error: "Could not validate file integrity.",
    };
  }
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
