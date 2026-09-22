/**
 * Browser-only image helpers. Never imported at module scope by SSR code paths.
 *
 * loadBitmap() is the single entry point every capture passes through before
 * OCR, ELA or face matching ever touch it. Everything defensive lives here on
 * purpose: a judge's phone is not a controlled input, and a decode failure at
 * this point must never surface as a raw crash mid-demo.
 */

/** Hard ceiling on the long edge, applied immediately after decode. A modern
 * phone photo (12-108MP) decoded at full resolution can stall getImageData on
 * a mid-range demo laptop; nothing downstream needs more than this. */
const MAX_LONG_EDGE = 2400;

export class UnreadableImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableImageError";
  }
}

function looksLikeHeic(blob: Blob): boolean {
  const type = (blob.type || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || type === "image/heic-sequence";
}

async function sniffHeicByMagicBytes(blob: Blob): Promise<boolean> {
  // Some pickers hand back HEIC files with an empty/incorrect MIME type, so a
  // type check alone is not reliable. HEIC/HEIF containers are ISO-BMFF: the
  // 'ftyp' box sits at byte offset 4, with a brand of heic/heix/hevc/mif1 etc.
  try {
    const head = await blob.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(head);
    const ascii = String.fromCharCode(...bytes.slice(4, 12));
    return ascii.startsWith("ftyp") && /he(i|v)|mif1|msf1/.test(ascii);
  } catch {
    return false;
  }
}

/** Convert a HEIC/HEIF blob to JPEG using a bundled WASM decoder (no network
 * call — the decoder ships inside the app bundle, so this works offline). */
async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
  const result = Array.isArray(out) ? out[0] : out;
  if (!result) throw new Error("HEIC conversion returned no output.");
  return result;
}

/**
 * Decode any capture to an ImageBitmap, transparently handling the formats
 * that actually show up at a checkpoint:
 *  - Standard JPEG/PNG/WebP from the in-app camera: fast path, no conversion.
 *  - iPhone gallery photos saved as HEIC/HEIF: Chrome and most non-Apple
 *    browsers cannot decode these natively, so this is the single most likely
 *    "judge hands you a real file and it errors" failure mode. Converted
 *    transparently before decode.
 *  - Empty, truncated, or non-image files: rejected with a message the
 *    officer can act on, never a raw exception.
 */
export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  if (!blob || blob.size === 0) {
    throw new UnreadableImageError("The capture was empty. Retake the photo and try again.");
  }
  if (blob.size > 40 * 1024 * 1024) {
    throw new UnreadableImageError(
      "That image is unusually large (over 40MB). Retake at normal camera resolution.",
    );
  }

  let workingBlob = blob;

  try {
    return await downscaleIfNeeded(await createImageBitmap(workingBlob));
  } catch (firstError) {
    const isHeic = looksLikeHeic(workingBlob) || (await sniffHeicByMagicBytes(workingBlob));
    if (!isHeic) {
      throw new UnreadableImageError(
        "This image format could not be read. Use the in-app camera, or export the photo as JPEG and try again.",
      );
    }
    try {
      workingBlob = await convertHeicToJpeg(workingBlob);
      return await downscaleIfNeeded(await createImageBitmap(workingBlob));
    } catch {
      throw new UnreadableImageError(
        "This looks like an iPhone HEIC photo that could not be converted. " +
          'Use the in-app camera instead, or set the phone to save photos as "Most Compatible" (JPEG) in Settings > Camera > Formats.',
      );
    }
  }
}

/** Downscale in-place if the decoded bitmap exceeds the safety ceiling, so
 * one oversized capture can't stall the pipeline on slower demo hardware. */
async function downscaleIfNeeded(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= MAX_LONG_EDGE) return bitmap;
  const scale = MAX_LONG_EDGE / long;
  const canvas = toCanvas(bitmap, scale);
  bitmap.close?.();
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  return createImageBitmap(blob);
}

export function toCanvas(source: ImageBitmap | HTMLCanvasElement, scale = 1) {
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable on this device.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

export function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable on this device.");
  return ctx;
}

/** Grayscale + local contrast stretch — improves recognition on phone captures. */
export function preprocessForOcr(bitmap: ImageBitmap) {
  // Glyph x-height must reach roughly 30px for the LSTM to be reliable, so a
  // phone frame is upscaled until its short side clears ~1600px.
  const short = Math.min(bitmap.width, bitmap.height);
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(3.5, 3400 / long, Math.max(1, 1700 / short));
  const canvas = toCanvas(bitmap, scale);
  const ctx = context(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, g = 0; i < px.length; i += 4, g += 1) {
    const v = (0.299 * (px[i] ?? 0) + 0.587 * (px[i + 1] ?? 0) + 0.114 * (px[i + 2] ?? 0)) | 0;
    gray[g] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, g = 0; i < px.length; i += 4, g += 1) {
    const v = (((gray[g] ?? 0) - min) * 255) / range;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), type, quality);
  });

/** Otsu binarisation — a second recognition variant for hard captures. */
export function binariseForOcr(bitmap: ImageBitmap) {
  const canvas = preprocessForOcr(bitmap);
  const ctx = context(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < px.length; i += 4) hist[px[i] ?? 0] = (hist[px[i] ?? 0] ?? 0) + 1;
  const total = px.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * (hist[t] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t] ?? 0;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] ?? 0) > threshold ? 255 : 0;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
