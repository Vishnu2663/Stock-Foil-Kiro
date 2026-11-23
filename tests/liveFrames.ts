// Live camera frames for the speed benchmark and the live-path tests: a 1600×900 frame (a 1920×1080 camera frame
// downscaled to 1600) with a half of the REAL printed sheet at ~5 px/mm, or the table with no card.
import { renderHalf } from '../src/render/scene';
import { inkFromBitmap } from '../src/render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN, FRAME_W, FRAME_H } from '../src/core/layout';
import type { Role } from '../src/core/card';
import type { RGBAImage } from '../src/vision/image';
import { FINGERS, recordedCard, sheetWithText, RECORDED_PUNCHES } from './cameraPhotos';

const W = 1600, H = 900, BG = 31;

/** A half rendered at ppm, pasted into a 1600×900 frame of dark table at (ox, oy). */
export function liveFrame(role: Role, o: { rot: number; ppm: number; blur: number; seed: number; ox: number; oy: number }): RGBAImage {
  const spec = recordedCard({ pairing: false });
  const bmp = sheetWithText(spec);
  const org = role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN;
  const sc = renderHalf({ spec, role, punched: RECORDED_PUNCHES, ink: inkFromBitmap(bmp, org.x, org.y) }, {
    seed: o.seed, pxPerMm: o.ppm, rotationDeg: o.rot, tiltXDeg: 4, tiltYDeg: -3, blur: o.blur, noise: 0.01, light: 0.25,
    lightAngleDeg: 45, background: BG / 255, fingers: FINGERS,
    view: { x0: -14, y0: -14, x1: FRAME_W + 14, y1: FRAME_H + (role === 'S' ? 28 : 14) },
  });
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = BG; data[i * 4 + 1] = BG * 0.97; data[i * 4 + 2] = BG * 0.9; data[i * 4 + 3] = 255; }
  for (let y = 0; y < sc.height; y++) {
    const Y = y + o.oy;
    if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < sc.width; x++) {
      const X = x + o.ox;
      if (X < 0 || X >= W) continue;
      const s = (y * sc.width + x) * 4, d = (Y * W + X) * 4;
      data[d] = sc.data[s]; data[d + 1] = sc.data[s + 1]; data[d + 2] = sc.data[s + 2];
    }
  }
  return { width: W, height: H, data };
}

/** The table with no card: a little noise, so the QR search and the square count do real work. */
export function emptyFrame(seed: number): RGBAImage {
  const data = new Uint8ClampedArray(W * H * 4);
  let r = seed;
  for (let i = 0; i < W * H; i++) { r = (r * 1103515245 + 12345) >>> 0; const v = BG + ((r >>> 24) % 9) - 4; data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return { width: W, height: H, data };
}

