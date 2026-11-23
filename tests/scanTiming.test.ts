// scanner-speed R1: every scan reports its time per stage, and the debug line shows them.
import { describe, expect, it } from 'vitest';
import { scanImage } from '../src/vision/detect';
import { timingLine } from '../src/vision/capture';
import { cameraPhoto, recordedCard, sheetWithText, RECORDED_PUNCHES } from './cameraPhotos';

describe('scanner-speed: timing breakdown', () => {
  it('a scan reports gray, qr, pose, cells, edge, receipt and a total that covers them', () => {
    const spec = recordedCard({ pairing: false });
    const r = scanImage(cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 4, background: 0.12 }, sheetWithText(spec)));
    expect(r.halves.length).toBe(1);
    const t = r.timing!;
    for (const k of ['gray', 'qr', 'squares', 'pose', 'cells', 'edge', 'receipt', 'total'] as const) expect(t[k]).toBeGreaterThanOrEqual(0);
    expect(t.qr).toBeGreaterThan(0); expect(t.pose).toBeGreaterThan(0);
    const parts = t.gray + t.qr + t.squares + t.pose + t.cells + t.edge + t.receipt;
    expect(t.total).toBeGreaterThanOrEqual(parts - 0.5);
    expect(r.ms).toBe(Math.round(t.total));
  });
  it('the debug line lists every stage and adds the main-thread stages to the worker total', () => {
    const s = timingLine({ grab: 9.4, blur: 4, transfer: 6.6 }, { gray: 6, qr: 41, squares: 0, pose: 12, cells: 18, edge: 5, receipt: 3, total: 85 });
    expect(s).toBe('grab 9 · blur 4 · xfer 7 · gray 6 · qr 41 · sq 0 · pose 12 · cells 18 · edge 5 · mark 3 · total 105 ms');
    expect(timingLine({ grab: 3, blur: 5 })).toBe('grab 3 · blur 5 · xfer 0 · gray 0 · qr 0 · sq 0 · pose 0 · cells 0 · edge 0 · mark 0 · total 8 ms');
  });
});
