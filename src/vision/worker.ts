/// <reference lib="webworker" />
// The scanner (and the photo simulator for Demo, Story and Test lab) run here so the UI never blocks.
import { scanImage, scanLive, type ScanOptions, type ScanResult } from './detect';
import { sharpness } from './quality';
import { locateQRs } from './qr';
import { renderPair, renderHalf, type PairInput } from '../render/scene';
import { inkFromBitmap, type Bitmap } from '../render/rasterSvg';
import { STOCK_ORIGIN, FOIL_ORIGIN } from '../core/layout';
import type { RGBAImage } from './image';

export type WorkerRequest =
  | { id: number; kind: 'scan'; images: RGBAImage[]; opts?: ScanOptions }
  | { id: number; kind: 'scanBitmap'; bitmap: ImageBitmap; maxDim: number; opts?: ScanOptions; blurMin?: number }
  | { id: number; kind: 'sim'; input: PairInput; opts?: ScanOptions }
  | { id: number; kind: 'roundtrip'; input: PairInput; sheet: Bitmap; opts?: ScanOptions };

export interface SimOutput { stock: RGBAImage; foil: RGBAImage; scans: ScanResult[]; truth: { stock: string[]; foil: string[] } }

/** What the worker did with one live camera frame. */
export interface FrameInfo { width: number; height: number; scale: number; sharp?: number; blurred?: boolean; draw: number; blur: number }
export type WorkerResponse =
  | { id: number; ok: true; results?: ScanResult[]; sim?: SimOutput; frame?: FrameInfo }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const strip = (s: { width: number; height: number; data: Uint8ClampedArray }): RGBAImage => ({ width: s.width, height: s.height, data: s.data });

let canvas: OffscreenCanvas | null = null;
const clock = () => performance.now();

/** A live frame as an ImageBitmap: drawn to one reused OffscreenCanvas, checked for blur, located, scanned. */
async function scanBitmap(req: Extract<WorkerRequest, { kind: 'scanBitmap' }>): Promise<WorkerResponse> {
  const b = req.bitmap;
  const t0 = clock();
  const s = Math.min(1, req.maxDim / Math.max(b.width, b.height));
  const w = Math.round(b.width * s), h = Math.round(b.height * s);
  canvas ??= new OffscreenCanvas(w, h);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  g.drawImage(b, 0, 0, w, h);
  b.close();
  const img: RGBAImage = { width: w, height: h, data: g.getImageData(0, 0, w, h).data };
  const t1 = clock();
  const frame: FrameInfo = { width: w, height: h, scale: s, draw: t1 - t0, blur: 0 };
  if (req.blurMin !== undefined) {
    frame.sharp = sharpness(img);
    frame.blur = clock() - t1;
    if (frame.sharp < req.blurMin) return { id: req.id, ok: true, results: [], frame: { ...frame, blurred: true } };
  }
  const located = await locateQRs(canvas, 1);
  return { id: req.id, ok: true, results: [scanLive(img, { ...req.opts, located: located.length ? located : undefined })], frame };
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'scanBitmap') { ctx.postMessage(await scanBitmap(req) satisfies WorkerResponse); return; }
    if (req.kind === 'scan') {
      const results = req.images.map((img) => (req.opts?.live ? scanLive(img, req.opts) : scanImage(img, req.opts)));
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
