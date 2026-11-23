// The browser's own QR detector (BarcodeDetector, format qr_code) where it exists, used only to LOCATE codes in a
// live frame: their text and a box. The exact corners are always measured by jsQR inside that box (detect.ts
// liveQRs), so the pose means the same on every browser. Without BarcodeDetector, jsQR does all of it.
import type { LocatedQR } from './detect';

interface Detected { rawValue: string; boundingBox: { x: number; y: number; width: number; height: number } }
interface Detector { detect(src: unknown): Promise<Detected[]> }
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

let cached: Detector | null | undefined;

/** The detector, created once; null when the browser has none or it cannot read QR codes. */
export async function qrDetector(g: { BarcodeDetector?: DetectorCtor } = globalThis as never): Promise<Detector | null> {
  if (cached !== undefined) return cached;
  const C = g.BarcodeDetector;
  if (!C) return (cached = null);
  try {
    const formats = C.getSupportedFormats ? await C.getSupportedFormats() : ['qr_code'];
    cached = formats.includes('qr_code') ? new C({ formats: ['qr_code'] }) : null;
  } catch { cached = null; }
  return cached;
}
/** Forget the cached detector (tests). */
export const resetQrDetector = () => { cached = undefined; };

/**
 * QR codes the browser located in a frame, scaled by `scale` (detector px → frame px). An empty list when there is
 * no detector or it fails, so the caller always falls back to jsQR.
 */
export async function locateQRs(src: unknown, scale = 1, g?: { BarcodeDetector?: DetectorCtor }): Promise<LocatedQR[]> {
  const d = await qrDetector(g);
  if (!d) return [];
  try {
    const found = await d.detect(src);
    return found.filter((f) => f.rawValue).map((f) => ({
      data: f.rawValue,
      box: { x: f.boundingBox.x * scale, y: f.boundingBox.y * scale, w: f.boundingBox.width * scale, h: f.boundingBox.height * scale },
    }));
  } catch { return []; }
}
