// Promise wrapper around the scanner Web Worker, so the UI never blocks.
import type { ScanOptions, ScanResult } from '../vision/detect';
import type { RGBAImage } from '../vision/image';
import type { PairInput } from '../render/scene';
import type { Bitmap } from '../render/rasterSvg';
import type { WorkerRequest, WorkerResponse, SimOutput, FrameInfo } from '../vision/worker';

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('../vision/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Scanner worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

async function call(req: Req): Promise<WorkerResponse> {
  const w = getWorker();
  if (!w) {
    // Fallback: run on the main thread.
    const det = await import('../vision/detect');
    const id = ++seq;
    if (req.kind === 'scan') return { id, ok: true, results: req.images.map((i) => (req.opts?.live ? det.scanLive(i, req.opts) : det.scanImage(i, req.opts))) };
    if (req.kind === 'scanBitmap') throw new Error('no worker');
    const sc = await import('../render/scene');
    const p = sc.renderPair(req.input);
    const stock = { width: p.stock.width, height: p.stock.height, data: p.stock.data };
    const foil = { width: p.foil.width, height: p.foil.height, data: p.foil.data };
    return { id, ok: true, sim: { stock, foil, scans: [det.scanImage(stock, req.opts), det.scanImage(foil, req.opts)], truth: { stock: p.stock.truth.punched, foil: p.foil.truth.punched } } };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // an ImageBitmap is transferred, not copied
    const transfer = req.kind === 'scanBitmap' ? [req.bitmap] : [];
    w.postMessage({ ...req, id } as WorkerRequest, transfer);
  });
}

let busy = false;
export const isBusy = () => busy;

/** Scan on the main thread after 30 ms (used when the worker is missing, crashes or reports an error). */
async function scanHere(images: RGBAImage[], opts?: ScanOptions): Promise<ScanResult[]> {
  await new Promise((r) => setTimeout(r, 30));
  const det = await import('../vision/detect');
  return images.map((i) => (opts?.live ? det.scanLive(i, opts) : det.scanImage(i, opts)));
}

/** Can a live frame go to the worker as an ImageBitmap (no pixels on the main thread)? */
let bitmapOk: boolean | null = null;
export const canScanBitmap = () => (bitmapOk ??= typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined' && !!getWorker());
/** Stop using the ImageBitmap path (the worker could not use it); the caller falls back to pixels. */
export const disableBitmap = () => { bitmapOk = false; };

/**
 * One live camera frame through the worker: createImageBitmap on the main thread (fast, no pixel copy), then the
 * worker draws, checks blur, locates and scans it. null when this path is not available or failed (use scanImages).
 */
export async function scanVideoFrame(video: HTMLVideoElement, maxDim: number, opts: ScanOptions, blurMin?: number):
  Promise<{ result?: ScanResult; frame: FrameInfo; grab: number; total: number } | null> {
  if (!canScanBitmap()) return null;
  busy = true;
  try {
    const t0 = performance.now();
    const bitmap = await createImageBitmap(video);
    const grab = performance.now() - t0;
    const r = await call({ kind: 'scanBitmap', bitmap, maxDim, opts, blurMin });
    if (!r.ok || !r.frame) { disableBitmap(); return null; }
    return { result: r.results?.[0], frame: r.frame, grab, total: performance.now() - t0 };
  } catch {
    disableBitmap();
    return null;
  } finally {
    busy = false;
  }
}
export async function scanImages(images: RGBAImage[], opts?: ScanOptions): Promise<ScanResult[]> {
  busy = true;
  try {
    try {
      const r = await call({ kind: 'scan', images, opts });
      if (r.ok) return r.results ?? [];
    } catch { /* worker crashed: fall through */ }
    return await scanHere(images, opts);
  } finally {
    busy = false;
  }
}

export async function simulate(input: PairInput, opts?: ScanOptions): Promise<SimOutput> {
  const r = await call({ kind: 'sim', input, opts });
  if (!r.ok) throw new Error(r.error);
  return r.sim!;
}

export async function roundTrip(input: PairInput, sheet: Bitmap, opts?: ScanOptions): Promise<SimOutput> {
  const r = await call({ kind: 'roundtrip', input, sheet, opts });
  if (!r.ok) throw new Error(r.error);
  return r.sim!;
}
