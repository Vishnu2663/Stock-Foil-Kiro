// Camera-like photos of the REAL printed sheet, made to match the laptop-webcam recording of a worker half:
// about 3 px/mm, tilted, a little perspective, 1.5 px blur, uneven light, the card filling the frame with
// fingers over the side margins, and a white or dark background behind it (seen through the holes too).
import { makeCard, type CardSpec, type Role } from '../src/core/card';
import { sheetSvg } from '../src/render/sheet';
import { rasterSheet, inkFromBitmap, type Bitmap } from '../src/render/rasterSvg';
import { renderHalf, type PhotoOpts, type Scene } from '../src/render/scene';
import { STOCK_ORIGIN, FOIL_ORIGIN, FRAME_W, FRAME_H } from '../src/core/layout';

export const RECORDED_PUNCHES = ['d4', 'd5', 'd6', 'a1', 'a2'];

/** The Node rasteriser skips text, so the printed text lines are added back as ink bands of their real size. */
export function textBands(spec: CardSpec, role: Role): { x: number; y: number; w: number; h: number; lum: number }[] {
  void spec;
  return [
    { x: 14, y: 7.4, w: role === 'S' ? 30 : 24, h: 4.8, lum: 0.2 }, // bold role word, 4 mm right of the corner square
    { x: role === 'S' ? 46 : 40, y: 9.6, w: 26, h: 2.4, lum: 0.45 }, // italic "who keeps it"
    { x: 103, y: 8.4, w: 28, h: 9, lum: 0.55 }, // red date stamp
    { x: 14, y: 16.6, w: 83, h: 2.4, lum: 0.45 }, // names line
    { x: 14, y: 22.7, w: 112, h: 2.2, lum: 0.3 }, // weekday labels
    { x: 14, y: 95.2, w: 70, h: 2.2, lum: 0.3 }, // advances label
    { x: 14, y: 114.8, w: 95, h: 2, lum: 0.5 }, // footer left
  ];
}

export function sheetWithText(spec: CardSpec): Bitmap {
  const bmp = rasterSheet(sheetSvg(spec), 6);
  for (const [role, o] of [['S', STOCK_ORIGIN], ['F', FOIL_ORIGIN]] as const) {
    for (const b of textBands(spec, role)) {
      const x0 = Math.round((b.x + o.x) * bmp.pxPerMm), x1 = Math.round((b.x + b.w + o.x) * bmp.pxPerMm);
      const y0 = Math.round((b.y + o.y) * bmp.pxPerMm), y1 = Math.round((b.y + b.h + o.y) * bmp.pxPerMm);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bmp.data[y * bmp.width + x] = Math.min(bmp.data[y * bmp.width + x], b.lum);
    }
  }
  return bmp;
}

export interface CameraCase { rotationDeg: number; background: number; bend?: number; seed?: number; fill?: boolean; pxPerMm?: number; blur?: number }

/** Fingers on the left and right paper margins, at mid-height (frame mm). */
export const FINGERS: PhotoOpts['fingers'] = [
  { x: -9, y: 45, r: 8, lum: 0.55 }, { x: -9, y: 62, r: 8, lum: 0.55 },
  { x: FRAME_W + 9, y: 50, r: 8, lum: 0.55 }, { x: FRAME_W + 9, y: 67, r: 8, lum: 0.55 },
];

export function cameraPhoto(spec: CardSpec, role: Role, punched: string[], c: CameraCase, bmp = sheetWithText(spec)): Scene {
  const origin = role === 'S' ? STOCK_ORIGIN : FOIL_ORIGIN;
  return renderHalf(
    { spec, role, punched, ink: inkFromBitmap(bmp, origin.x, origin.y) },
    {
      seed: c.seed ?? 11,
      pxPerMm: c.pxPerMm ?? 3,
      rotationDeg: c.rotationDeg,
      tiltXDeg: 4, // a small perspective skew
      tiltYDeg: -3,
      blur: c.blur ?? 1.5,
      noise: 0.01,
      light: 0.25, // one corner about 30% brighter than the opposite one
      lightAngleDeg: 45,
      background: c.background,
      bend: c.bend ?? 0,
      fingers: FINGERS,
      // the card fills most of the frame: only ~5 mm of paper margin shows around the printed frame
      view: c.fill === false ? undefined : { x0: -5, y0: -5, x1: FRAME_W + 5, y1: FRAME_H + (role === 'S' ? 26 : 5) },
    },
  );
}

export function recordedCard(over: Partial<Parameters<typeof makeCard>[0]> = {}): CardSpec {
  const spec = makeCard({ worker: 'Ramesh', employer: 'Vishnu', year: 2026, month: 11, rateMinor: 70000, advMinor: 10000, ...over }, 'REC0RD01');
  if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' };
  return spec;
}
