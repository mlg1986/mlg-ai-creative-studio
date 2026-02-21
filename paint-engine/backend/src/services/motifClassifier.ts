import sharp from 'sharp';
import path from 'path';
import { logger } from './logger.js';

/** Fraction of image width/height treated as border (each edge). */
const BORDER_FRACTION = 0.10;
/** Pixel is "white" if R, G, B are all >= this (0–255). */
const WHITE_THRESHOLD = 230;
/** If this fraction of border pixels is white or brighter, classify as painting template. */
const WHITE_BORDER_RATIO_THRESHOLD = 0.55;
/** Resize longest side to this before sampling (keeps memory low). */
const MAX_SAMPLE_SIZE = 400;

export type MotifDisplayMode = 'template' | 'stretched';

/**
 * Heuristic: detect if the image has a clear white border around it (painting template / Malvorlage).
 * Samples top, bottom, left, right border bands; if a high fraction of pixels are white → 'template',
 * else 'stretched' (canvas on Keilrahmen).
 * @param fullPath - Absolute path to the image file (e.g. from resolveMotifFullPath).
 * @returns 'template' = unrolled Malvorlage on table, 'stretched' = canvas on frame.
 */
export async function detectMotifDisplayMode(fullPath: string): Promise<MotifDisplayMode> {
  try {
    const resized = await sharp(fullPath)
      .resize(MAX_SAMPLE_SIZE, MAX_SAMPLE_SIZE, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const { width: w, height: h, channels } = info;
    const ch = channels >= 3 ? 3 : 1;

    const top = Math.max(1, Math.floor(h * BORDER_FRACTION));
    const bottom = Math.max(top + 1, h - Math.floor(h * BORDER_FRACTION));
    const left = Math.max(1, Math.floor(w * BORDER_FRACTION));
    const right = Math.max(left + 1, w - Math.floor(w * BORDER_FRACTION));

    let whiteCount = 0;
    let totalCount = 0;

    const isWhite = (i: number) => {
      if (ch === 1) return data[i] >= WHITE_THRESHOLD;
      return data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inTop = y < top;
        const inBottom = y >= bottom;
        const inLeft = x < left;
        const inRight = x >= right;
        if (!inTop && !inBottom && !inLeft && !inRight) continue;
        totalCount++;
        const idx = (y * w + x) * channels;
        if (isWhite(idx)) whiteCount++;
      }
    }

    if (totalCount === 0) return 'stretched';
    const ratio = whiteCount / totalCount;
    const result: MotifDisplayMode = ratio >= WHITE_BORDER_RATIO_THRESHOLD ? 'template' : 'stretched';
    logger.info('motifClassifier', 'detect', { path: path.basename(fullPath), whiteRatio: Math.round(ratio * 100) / 100, result });
    return result;
  } catch (err) {
    logger.warn('motifClassifier', 'detect failed', { path: fullPath, error: (err as Error)?.message });
    return 'stretched';
  }
}

/**
 * For multiple motif paths: if any is classified as 'template', return 'template' (scene shows at least one Malvorlage).
 * Otherwise return 'stretched'.
 */
export async function detectMotifDisplayModeFromPaths(
  resolveFullPath: (relPath: string) => string,
  motifPaths: string[]
): Promise<MotifDisplayMode> {
  if (motifPaths.length === 0) return 'stretched';
  for (const relPath of motifPaths) {
    const full = resolveFullPath(relPath);
    try {
      const mode = await detectMotifDisplayMode(full);
      if (mode === 'template') return 'template';
    } catch {
      // skip failed, try next
    }
  }
  return 'stretched';
}
