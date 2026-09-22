/**
 * Error Level Analysis — offline tamper screening.
 *
 * A JPEG that has been edited and re-saved carries regions whose recompression
 * error differs sharply from the rest of the frame. We re-encode the capture at
 * a known quality, measure the per-pixel delta, and look for blocks whose error
 * is a statistical outlier. The block statistics feed a small logistic
 * classifier over hand-chosen weights — NOT fitted on any labeled dataset of
 * clean vs. spliced IDs (no such dataset exists in this project). Treat the
 * output as a rough, uncalibrated heuristic: it reliably flags gross,
 * localised edits, and it will also flag ordinary genuine-document features
 * (photo/text boundaries, print artefacts, lamination glare) that happen to
 * compress differently. It is not a substitute for officer judgement, and the
 * verdict bands below are set conservatively (biased toward "inconclusive"
 * over a confident wrong call) precisely because there is no ground truth to
 * calibrate against yet.
 */

import { canvasToBlob, context, loadBitmap, toCanvas } from "./image";

export type TamperResult = {
  score: number; // 0-100 likelihood the frame was edited
  verdict: "clean" | "inconclusive" | "suspicious" | "likely_edited";
  headline: string;
  detail: string;
  hotspots: number;
  meanError: number;
  outlierRatio: number;
  edgeConcentration: number;
  heatmap: string; // data URL, in-memory only
};

const BLOCK = 16;

export async function analyseTamper(file: Blob): Promise<TamperResult> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const base = toCanvas(bitmap, scale);
  bitmap.close?.();

  const recompressed = await canvasToBlob(base, "image/jpeg", 0.9);
  const reBitmap = await loadBitmap(recompressed);
  const compared = toCanvas(reBitmap, 1);
  reBitmap.close?.();

  const w = base.width;
  const h = base.height;
  const a = context(base).getImageData(0, 0, w, h).data;
  const b = context(compared).getImageData(0, 0, w, h).data;

  const heat = context(compared).createImageData(w, h);
  const error = new Float32Array(w * h);
  let sum = 0;

  for (let i = 0, p = 0; i < a.length; i += 4, p += 1) {
    const d =
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    const e = d / 3;
    error[p] = e;
    sum += e;
    const amplified = Math.min(255, e * 14);
    heat.data[i] = amplified;
    heat.data[i + 1] = Math.min(255, amplified * 0.55);
    heat.data[i + 2] = Math.min(255, 40 + amplified * 0.2);
    heat.data[i + 3] = 255;
  }
  context(compared).putImageData(heat, 0, 0);

  const meanError = sum / (w * h);

  // Block statistics
  const blocks: number[] = [];
  const cols = Math.floor(w / BLOCK);
  const rows = Math.floor(h / BLOCK);
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      let acc = 0;
      for (let y = 0; y < BLOCK; y += 1) {
        const row = (by * BLOCK + y) * w + bx * BLOCK;
        for (let x = 0; x < BLOCK; x += 1) acc += error[row + x] ?? 0;
      }
      blocks.push(acc / (BLOCK * BLOCK));
    }
  }
  const blockMean = blocks.reduce((s, v) => s + v, 0) / Math.max(1, blocks.length);
  const blockStd = Math.sqrt(
    blocks.reduce((s, v) => s + (v - blockMean) ** 2, 0) / Math.max(1, blocks.length),
  );
  const threshold = blockMean + 3 * blockStd;
  let hotspots = 0;
  let interiorHotspots = 0;
  blocks.forEach((v, idx) => {
    if (v <= threshold || blockStd < 0.4) return;
    hotspots += 1;
    const bx = idx % cols;
    const by = Math.floor(idx / cols);
    const interior = bx > 1 && by > 1 && bx < cols - 2 && by < rows - 2;
    if (interior) interiorHotspots += 1;
  });
  const outlierRatio = hotspots / Math.max(1, blocks.length);
  const edgeConcentration = hotspots ? 1 - interiorHotspots / hotspots : 0;

  // Logistic classifier over the three descriptors. Weights are hand-chosen,
  // not fitted on labeled data (see the module comment) — kept deliberately
  // conservative so ordinary genuine-document edge artefacts don't cross the
  // "suspicious"/"likely_edited" lines on their own.
  const z =
    -3.6 +
    5.2 * Math.min(1, outlierRatio * 22) +
    2.0 * Math.min(1, (blockStd / Math.max(0.6, blockMean)) * 1.4) +
    1.4 * Math.min(1, interiorHotspots / 8) -
    1.6 * edgeConcentration;
  const probability = 1 / (1 + Math.exp(-z));
  const score = Math.round(probability * 100);

  // Bands widened on the high end: this heuristic has no measured false
  // positive rate, so "likely_edited" is reserved for the strongest possible
  // reading rather than a middling score that would previously have claimed it.
  const verdict: TamperResult["verdict"] =
    score >= 78
      ? "likely_edited"
      : score >= 55
        ? "suspicious"
        : score >= 30
          ? "inconclusive"
          : "clean";

  const headline = {
    clean: "No recompression anomaly found",
    inconclusive: "Inconclusive — capture quality limits the analysis",
    suspicious: "Localised recompression anomaly",
    likely_edited: "Strong evidence of a spliced or edited region",
  }[verdict];

  const detail =
    hotspots === 0
      ? "Compression error is uniform across the frame, which is what an unedited capture looks like."
      : `${hotspots} block${hotspots > 1 ? "s" : ""} (${interiorHotspots} inside the document body) show error levels above three standard deviations from the frame mean.`;

  return {
    score,
    verdict,
    headline,
    detail,
    hotspots,
    meanError: Math.round(meanError * 100) / 100,
    outlierRatio: Math.round(outlierRatio * 1000) / 1000,
    edgeConcentration: Math.round(edgeConcentration * 100) / 100,
    heatmap: compared.toDataURL("image/jpeg", 0.7),
  };
}
