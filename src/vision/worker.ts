/// <reference lib="webworker" />
// The scanner (and the photo simulator for Demo, Story and Test lab) run here so the UI never blocks.
import { scanImage, type ScanOptions, type ScanResult } from './detect';
import { renderPair, renderHalf, type PairInput } from '../render/scene';
import { inkFromBitmap, type Bitmap } from '../render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN } from '../core/layout';
import type { RGBAImage } from './image';

export type WorkerRequest =
  | { id: number; kind: 'scan'; images: RGBAImage[]; opts?: ScanOptions }
  | { id: number; kind: 'sim'; input: PairInput; opts?: ScanOptions }
  | { id: number; kind: 'roundtrip'; input: PairInput; sheet: Bitmap; opts?: ScanOptions };

export interface SimOutput { stock: RGBAImage; foil: RGBAImage; scans: ScanResult[]; truth: { stock: string[]; foil: string[] } }

export type WorkerResponse =
  | { id: number; ok: true; results?: ScanResult[]; sim?: SimOutput }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const strip = (s: { width: number; height: number; data: Uint8ClampedArray }): RGBAImage => ({ width: s.width, height: s.height, data: s.data });

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'scan') {
      const results = req.images.map((img) => scanImage(img, req.opts));
      ctx.postMessage({ id: req.id, ok: true, results } satisfies WorkerResponse);
      return;
    }
    let stock: RGBAImage, foil: RGBAImage, truthS: string[], truthF: string[];
    if (req.kind === 'sim') {
      const p = renderPair(req.input);
      stock = strip(p.stock); foil = strip(p.foil);
      truthS = p.stock.truth.punched; truthF = p.foil.truth.punched;
    } else {
      const inp = req.input;
      const s = renderHalf({ spec: inp.spec, role: 'S', punched: inp.stockPunched, ink: inkFromBitmap(req.sheet, STOCK_ORIGIN.x, STOCK_ORIGIN.y) }, { seed: inp.seed, ...inp.photoStock });
      const f = renderHalf({ spec: inp.spec, role: 'F', punched: inp.foilPunched, ink: inkFromBitmap(req.sheet, FOIL_ORIGIN.x, FOIL_ORIGIN.y) }, { seed: inp.seed + 1, ...inp.photoFoil });
      stock = strip(s); foil = strip(f);
      truthS = s.truth.punched; truthF = f.truth.punched;
    }
    const scans = [scanImage(stock, req.opts), scanImage(foil, req.opts)];
    ctx.postMessage({ id: req.id, ok: true, sim: { stock, foil, scans, truth: { stock: truthS, foil: truthF } } } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: String((err as Error)?.message ?? err) } satisfies WorkerResponse);
  }
};
