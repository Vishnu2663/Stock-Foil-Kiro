// Promise wrapper around the scanner Web Worker, so the UI never blocks.
import type { ScanOptions, ScanResult } from '../vision/detect';
import type { RGBAImage } from '../vision/image';
import type { PairInput } from '../render/scene';
import type { Bitmap } from '../render/rasterSvg';
import type { WorkerRequest, WorkerResponse, SimOutput } from '../vision/worker';

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
    if (req.kind === 'scan') return { id, ok: true, results: req.images.map((i) => det.scanImage(i, req.opts)) };
    const sc = await import('../render/scene');
    const p = sc.renderPair(req.input);
    const stock = { width: p.stock.width, height: p.stock.height, data: p.stock.data };
    const foil = { width: p.foil.width, height: p.foil.height, data: p.foil.data };
    return { id, ok: true, sim: { stock, foil, scans: [det.scanImage(stock, req.opts), det.scanImage(foil, req.opts)], truth: { stock: p.stock.truth.punched, foil: p.foil.truth.punched } } };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as WorkerRequest);
  });
}

let busy = false;
export const isBusy = () => busy;

export async function scanImages(images: RGBAImage[], opts?: ScanOptions): Promise<ScanResult[]> {
  busy = true;
  try {
    const r = await call({ kind: 'scan', images, opts });
    if (!r.ok) throw new Error(r.error);
    return r.results ?? [];
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
