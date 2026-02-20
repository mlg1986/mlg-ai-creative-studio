import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logger } from './logger.js';

type Slot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NormalizedSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_5_SLOT_LAYOUT: NormalizedSlot[] = [
  { x: 0.08, y: 0.18, width: 0.16, height: 0.54 },
  { x: 0.26, y: 0.18, width: 0.16, height: 0.54 },
  { x: 0.44, y: 0.18, width: 0.16, height: 0.54 },
  { x: 0.62, y: 0.18, width: 0.16, height: 0.54 },
  { x: 0.80, y: 0.18, width: 0.16, height: 0.54 },
];

export type ComposeMotifsInput = {
  backgroundImageBase64: string;
  motifPaths: string[];
  publicRoot: string;
  normalizedSlots?: NormalizedSlot[];
  edgeBlend?: boolean;
};

export type ComposeMotifsResult = {
  imageBase64: string;
  mimeType: 'image/png';
  usedMotifs: number;
};

function toPixelSlots(width: number, height: number, layout: NormalizedSlot[]): Slot[] {
  return layout.map((s) => {
    const x = Math.max(0, Math.round(s.x * width));
    const y = Math.max(0, Math.round(s.y * height));
    const w = Math.max(1, Math.round(s.width * width));
    const h = Math.max(1, Math.round(s.height * height));
    return { x, y, width: Math.min(w, width - x), height: Math.min(h, height - y) };
  });
}

async function loadMotifBuffer(publicRoot: string, motifPath: string): Promise<Buffer> {
  const rel = motifPath.startsWith('/') ? motifPath.slice(1) : motifPath;
  const fullPath = path.join(publicRoot, rel);
  return fs.promises.readFile(fullPath);
}

/** Fit motif aspect ratio inside slot: return { effW, effH } so motif is not cropped and not forced to square/portrait. */
function fitMotifInSlot(motifW: number, motifH: number, slotW: number, slotH: number): { effW: number; effH: number } {
  if (motifW <= 0 || motifH <= 0) return { effW: slotW, effH: slotH };
  const motifAspect = motifW / motifH;
  const slotAspect = slotW / slotH;
  let effW: number;
  let effH: number;
  if (motifAspect >= slotAspect) {
    effW = slotW;
    effH = Math.round(slotW / motifAspect);
    if (effH > slotH) {
      effH = slotH;
      effW = Math.round(slotH * motifAspect);
    }
  } else {
    effH = slotH;
    effW = Math.round(slotH * motifAspect);
    if (effW > slotW) {
      effW = slotW;
      effH = Math.round(slotW / motifAspect);
    }
  }
  return { effW: Math.max(1, effW), effH: Math.max(1, effH) };
}

export async function composeMotifsOntoBackground(input: ComposeMotifsInput): Promise<ComposeMotifsResult> {
  const motifCount = input.motifPaths.length;
  if (motifCount === 0) {
    return { imageBase64: input.backgroundImageBase64, mimeType: 'image/png', usedMotifs: 0 };
  }

  const background = Buffer.from(input.backgroundImageBase64, 'base64');
  const backgroundMeta = await sharp(background).metadata();
  const width = backgroundMeta.width;
  const height = backgroundMeta.height;
  if (!width || !height) {
    throw new Error('Compositing failed: background image dimensions could not be read.');
  }

  const baseLayout = input.normalizedSlots && input.normalizedSlots.length > 0
    ? input.normalizedSlots
    : DEFAULT_5_SLOT_LAYOUT;
  const slots = toPixelSlots(width, height, baseLayout);
  const useCount = Math.min(motifCount, slots.length);

  const overlays: { input: Buffer; left: number; top: number }[] = [];
  let used = 0;
  for (let i = 0; i < useCount; i++) {
    const slot = slots[i];
    const motifPath = input.motifPaths[i];
    try {
      const motif = await loadMotifBuffer(input.publicRoot, motifPath);
      const motifMeta = await sharp(motif).metadata();
      const mW = motifMeta.width ?? slot.width;
      const mH = motifMeta.height ?? slot.height;
      const { effW, effH } = fitMotifInSlot(mW, mH, slot.width, slot.height);
      const left = slot.x + Math.round((slot.width - effW) / 2);
      const top = slot.y + Math.round((slot.height - effH) / 2);
      const fitted = await sharp(motif)
        .resize(effW, effH, { fit: 'fill' })
        .png()
        .toBuffer();
      overlays.push({ input: fitted, left, top });
      used += 1;
      logger.debug('compositing', `Motif ${i + 1} aspect preserved`, { motifW: mW, motifH: mH, effW, effH, slotW: slot.width, slotH: slot.height });
    } catch (error: any) {
      logger.warn('compositing', `Skipping motif (could not load/resize): ${motifPath}`, { error: error?.message });
    }
  }

  const composed = overlays.length > 0
    ? await sharp(background).composite(overlays).png().toBuffer()
    : await sharp(background).png().toBuffer();

  if (input.edgeBlend) {
    // Phase 2 hook: optional edge blending/inpainting can run here in a later iteration.
    logger.info('compositing', 'edgeBlend requested but not implemented yet; returning sharp composite output.');
  }

  return {
    imageBase64: composed.toString('base64'),
    mimeType: 'image/png',
    usedMotifs: used,
  };
}

