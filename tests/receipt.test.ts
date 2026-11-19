// The RECEIVED box and the worker's received mark: printed layout, old and new payloads, the detector's
// rules, no interference with punches/corners/QR/edge, and the payday flows (pure parts).
import { describe, expect, it } from 'vitest';
import { makeCard, encodePayload, decodePayload, cardCode, formatCode, type CardSpec } from '../src/core/card';
import { RECEIVED_BOX, RECEIPT_AREA, INFO_BOX, FIDUCIALS, FID_SIZE, QR_BOX, GRID, ADV, FRAME_H, FRAME_W, THUMB_GUIDE } from '../src/core/layout';
import { PANEL_TEXT, infoBoxSvg, receivedBoxSvg, textWidth, RECEIPT_GUIDE } from '../src/render/sheet';
import { scanImage } from '../src/vision/detect';
import { verifyPair } from '../src/vision/pair';
import { markState, markText, alreadyMarked, receiptStep, paidMark, paidWithMark, applyPaidMark, type ReceiptCapture } from '../src/core/received';
import { appendReceipt, verifyChain, buildHistory, type ReceiptData } from '../src/core/history';
import type { ReceiptRead } from '../src/vision/receipt';
import { receiptPhoto, rSpec, rBmp } from './receiptSim';
import { recordedCard, sheetWithText } from './cameraPhotos';

const gap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
const rb = { x0: RECEIVED_BOX.x, y0: RECEIVED_BOX.y, x1: RECEIVED_BOX.x + RECEIVED_BOX.w, y1: RECEIVED_BOX.y + RECEIVED_BOX.h };

describe('received-mark: the printed box', () => {
  it('keeps ≥ 4 mm from the bottom-right corner square, the QR, the grid, the advances and the footer text', () => {
    const [bx, by] = FIDUCIALS[3];
    const br = { x0: bx - FID_SIZE / 2, y0: by - FID_SIZE / 2, x1: bx + FID_SIZE / 2, y1: by + FID_SIZE / 2 };
    expect(br.x0).toBe(176); expect(br.y0).toBe(110);
    expect(gap(rb, br)).toBeGreaterThanOrEqual(4);
    expect(gap(rb, { x0: QR_BOX.x, y0: QR_BOX.y, x1: QR_BOX.x + QR_BOX.size, y1: QR_BOX.y + QR_BOX.size })).toBeGreaterThanOrEqual(4);
    expect(gap(rb, { x0: GRID.x, y0: GRID.y, x1: GRID.x + GRID.cw * GRID.cols, y1: GRID.y + GRID.ch * GRID.rows })).toBeGreaterThanOrEqual(4);
    expect(gap(rb, { x0: ADV.x, y0: ADV.y, x1: ADV.x + ADV.w * ADV.n, y1: ADV.y + ADV.h })).toBeGreaterThanOrEqual(4);
    // footer lines sit at y ≥ FRAME_H − 7.4 − 2.4 (text height): the box ends ≥ 4 mm above them
    expect(FRAME_H - 7.4 - 2.4 - rb.y1).toBeGreaterThanOrEqual(4);
    // the info box text (two lines inside y 55–69) is ≥ 3 mm above the box and inside the panel
    expect(RECEIVED_BOX.y - (INFO_BOX.y + INFO_BOX.h)).toBeGreaterThanOrEqual(3);
    expect(INFO_BOX.x + INFO_BOX.w).toBeLessThanOrEqual(FRAME_W - 8);
    // the inner area: 2 mm in from the frame, big enough for a 10 × 12 mm thumb
    expect(RECEIPT_AREA.x0 - RECEIVED_BOX.x).toBe(2);
    expect(RECEIPT_AREA.x1 - RECEIPT_AREA.x0).toBeGreaterThanOrEqual(30);
    expect(RECEIPT_AREA.y1 - RECEIPT_AREA.y0).toBeGreaterThanOrEqual(20);
    expect(THUMB_GUIDE.ry * 2).toBeLessThanOrEqual(RECEIPT_AREA.y1 - RECEIPT_AREA.y0);
  });
  it('the dotted guide is light (≥ 0.85 of paper) so the detector ignores it', () => {
    const v = parseInt(RECEIPT_GUIDE.slice(1, 3), 16) * 0.299 + parseInt(RECEIPT_GUIDE.slice(3, 5), 16) * 0.587 + parseInt(RECEIPT_GUIDE.slice(5, 7), 16) * 0.114;
    expect(v / 255).toBeGreaterThanOrEqual(0.85);
  });
  it('the merged info box and the RECEIVED box text fit in every language and currency', () => {
    let checked = 0;
    for (const lang of Object.keys(PANEL_TEXT)) for (const currency of ['INR', 'KES', 'USD', 'BDT', 'EUR']) {
      const spec = makeCard({ worker: 'A', employer: 'B', year: 2026, month: 11, rateMinor: 1234500, advMinor: 99900, currency, lang }, 'K7M2Q9XA');
      for (const svg of [infoBoxSvg(spec, formatCode(cardCode(spec)), lang), receivedBoxSvg('S', lang), receivedBoxSvg('F', lang)]) {
        for (const m of svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="([\d.]+)"( textLength="([\d.]+)")?[^>]*>([^<]*)<\/text>/g)) {
          const width = m[4] ? Number(m[4]) : textWidth(m[5].replace(/&amp;/g, '&'), Number(m[2]));
          expect(width).toBeLessThanOrEqual(INFO_BOX.w - 3);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(6 * 5 * 6);
  });
});

describe('received-mark: payloads', () => {
  it('new cards carry the RECEIVED box flag, and it round-trips', () => {
    const spec = makeCard({ worker: 'Ramesh', employer: 'Vishnu', year: 2026, month: 11 }, 'K7M2Q9XA');
    expect(spec.receiptBox).toBe(true);
    const d = decodePayload(encodePayload(spec, 'S'))!;
    expect(d.spec.receiptBox).toBe(true);
    expect(d.codeOk).toBe(true);
    expect(encodePayload(spec, 'S').split('|')[0]).toMatch(/r$/);
  });
  it('old cards still decode and say "received mark not available"', () => {
    const old: CardSpec = { ...makeCard({ worker: 'Ravi', employer: 'Mehta', year: 2025, month: 3, pairing: false }, 'K7M2Q9XA') };
    delete old.receiptBox;
    const d = decodePayload(`SF1|F|K7M2Q9XA|202503|50000|10000|INR|en|${cardCode(old)}|Ravi|Mehta`)!;
    expect(d.codeOk).toBe(true);
    expect(d.spec.receiptBox).toBeUndefined();
    expect(markText(markState(false)).text).toBe('Received mark not available on this card');
  });
});

describe('received-mark: the detector does not disturb anything else', () => {
  it('a heavy mark flooding the box: punch reads, corners, QR and edge are unchanged', () => {
    const spec = rSpec(), bmp = rBmp();
    for (const role of ['S', 'F'] as const) {
      const base = { role, ink: 'black' as const, seed: 4, rot: 6, ppm: 3.6, blur: 1.2, light: 0.2, jpeg: false };
      const a = scanImage(receiptPhoto(spec, bmp, { ...base, kind: 'empty' }).img).halves[0];
      const b = scanImage(receiptPhoto(spec, bmp, { ...base, kind: 'smudge' }).img).halves[0];
      const c = scanImage(receiptPhoto(spec, bmp, { ...base, kind: 'thumb' }).img).halves[0];
      for (const h of [b, c]) {
        expect(h.decoded.raw).toBe(a.decoded.raw);
        expect(h.cells.map((x) => [x.key, x.punched, x.unsure])).toEqual(a.cells.map((x) => [x.key, x.punched, x.unsure]));
        expect(h.pose.fiducialsFound).toBe(a.pose.fiducialsFound);
        h.pose.fiducials.forEach((p, i) => { if (p && a.pose.fiducials[i]) expect(Math.hypot(p[0] - a.pose.fiducials[i]![0], p[1] - a.pose.fiducials[i]![1])).toBeLessThan(0.5); });
        const de = h.edge.map((v, i) => Math.abs(v - a.edge[i])).filter(Number.isFinite);
        expect(Math.max(...de)).toBeLessThan(0.05);
      }
      expect(a.receipt?.status).toBe('absent');
      expect(b.receipt).toMatchObject({ status: 'present', kind: 'smudge' });
      expect(c.receipt).toMatchObject({ status: 'present', kind: 'thumb' });
    }
  });
  it('a pair with the mark on both halves: the verdict is unchanged and the checks row says so', () => {
    const spec = recordedCard({ pairing: false }), bmp = sheetWithText(spec);
    const base = { ink: 'violet' as const, seed: 8, rot: 4, ppm: 3.6, blur: 1.2, light: 0.2, jpeg: false };
    const s0 = scanImage(receiptPhoto(spec, bmp, { ...base, role: 'S', kind: 'empty' }).img).halves[0];
    const f0 = scanImage(receiptPhoto(spec, bmp, { ...base, role: 'F', kind: 'empty' }).img).halves[0];
    const s1 = scanImage(receiptPhoto(spec, bmp, { ...base, role: 'S', kind: 'thumb' }).img).halves[0];
    const f1 = scanImage(receiptPhoto(spec, bmp, { ...base, role: 'F', kind: 'thumb' }).img).halves[0];
    const before = verifyPair(s0, f0), after = verifyPair(s1, f1);
    expect(after.verdict).toBe(before.verdict);
    expect(before.checks.find((c) => c.id === 'receipt')!.detail).toBe('Received mark: not yet');
    expect(after.checks.find((c) => c.id === 'receipt')!.detail).toBe('Received mark on both halves ✓ (thumb)');
    expect(alreadyMarked(after.mark!)).toBe(true);
    expect(verifyPair(s1, f0).checks.find((c) => c.id === 'receipt')!.detail).toBe('Received mark only on the worker half');
  });
});

const read = (status: ReceiptRead['status'], kind: ReceiptRead['kind'] = null): ReceiptRead => ({ status, kind, coverage: 0.2, centre: null, quality: 1 });
const base: ReceiptData = { at: '2026-11-30T10:00:00Z', cardId: 'K7M2Q9XA', month: '2026-11', worker: 'Ramesh', employer: 'Vishnu', verdict: 'paid', agreedDays: [3, 4], stockOnlyDays: [], foilOnlyDays: [], agreedAdv: 0, netMinor: 140000, disputedMinor: 0, currency: 'INR' };

describe('received-mark: payday flows', () => {
  it('receipt camera: 2 matching reads per half; another card is refused', () => {
    let cap: ReceiptCapture = { streak: { role: '', key: '', n: 0 } };
    let r = receiptStep(cap, 'K7M2Q9XA', { id: 'OTHER123', role: 'S', read: read('present', 'thumb') });
    expect(r.step.kind).toBe('wrong-card');
    cap = r.cap;
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'S', read: read('present', 'thumb') }); expect(r.step.kind).toBe('wait'); cap = r.cap;
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'S', read: read('unclear') }); expect(r.step.kind).toBe('wait'); cap = r.cap; // a flip starts again
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'S', read: read('present', 'thumb') }); cap = r.cap;
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'S', read: read('present', 'thumb') }); expect(r.step.kind).toBe('got'); cap = r.cap;
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'F', read: read('present', 'thumb') }); cap = r.cap;
    r = receiptStep(cap, 'K7M2Q9XA', { id: 'K7M2Q9XA', role: 'F', read: read('present', 'thumb') }); cap = r.cap;
    expect(cap.S?.kind).toBe('thumb'); expect(cap.F?.kind).toBe('thumb');
  });
  it('the payment record keeps the mark, the chain still verifies, and History shows it', () => {
    const mark = paidMark({ S: read('present', 'thumb'), F: read('present', 'thumb') }, '2026-11-30T10:05:00Z');
    let chain = appendReceipt([], { ...base, verdict: 'genuine-consistent' });
    chain = appendReceipt(chain, { ...base, at: '2026-11-30T10:05:00Z', ...mark });
    expect(verifyChain(chain)).toBe(-1);
    expect(chain[1].receipt).toEqual({ stock: 'thumb', foil: 'thumb', checkedAt: '2026-11-30T10:05:00Z' });
    expect(paidWithMark(chain[1])).toBe(true);
    // editing the mark breaks the chain
    const forged = chain.map((r, i) => (i === 1 ? { ...r, receipt: { ...r.receipt!, foil: 'none' as const } } : r));
    expect(verifyChain(forged)).toBe(1);
    expect(buildHistory(chain, { status: 'nomark' })).toEqual([]);
  });
  it('pay without a received mark saves the reason and shows under "Paid without received mark"', () => {
    let chain = appendReceipt([], { ...base, verdict: 'genuine-consistent' });
    chain = appendReceipt(chain, { ...base, at: '2026-11-30T10:06:00Z', noMark: { reason: 'no-ink' } });
    expect(chain[1].noMark).toEqual({ reason: 'no-ink' });
    expect(verifyChain(chain)).toBe(-1);
    expect(paidWithMark(chain[1])).toBe(false);
    expect(buildHistory(chain, { status: 'nomark' }).flatMap((m) => m.rows).length).toBe(1);
  });
  it('the already-paid warning appears only when both halves carry the mark', () => {
    expect(alreadyMarked(markState(true, read('present', 'thumb'), read('present', 'thumb')))).toBe(true);
    expect(alreadyMarked(markState(true, read('present', 'thumb'), read('absent')))).toBe(false);
    expect(alreadyMarked(markState(false))).toBe(false);
    expect(markText(markState(true, read('unclear'), read('present', 'thumb'))).text).toBe('Received mark unclear: tilt or keep fingers off');
  });
  it('after Mark as paid with a receipt, the checks row shows the saved mark and agrees with the paid banner', () => {
    const spec = rSpec(), bmp = rBmp();
    const base0 = { ink: 'violet' as const, seed: 8, rot: 4, ppm: 3.6, blur: 1.2, light: 0.2, jpeg: false, kind: 'empty' as const };
    const s0 = scanImage(receiptPhoto(spec, bmp, { ...base0, role: 'S' }).img).halves[0];
    const f0 = scanImage(receiptPhoto(spec, bmp, { ...base0, role: 'F' }).img).halves[0];
    const before = verifyPair(s0, f0); // photographed before the thumb was pressed
    expect(before.checks.find((c) => c.id === 'receipt')).toMatchObject({ ok: null, detail: 'Received mark: not yet' });
    const saved = paidMark({ S: read('present', 'thumb'), F: read('present', 'thumb') }, '2026-11-30T10:05:00Z');
    const shown = applyPaidMark(before, saved);
    expect(shown.checks.find((c) => c.id === 'receipt')).toMatchObject({ ok: true, detail: 'Received mark on both halves ✓ (thumb)' });
    expect(shown.mark).toEqual({ state: 'both', kind: 'thumb' });
    expect(shown.verdict).toBe(before.verdict);
    expect(shown.checks.filter((c) => c.ok === true).length).toBe(before.checks.filter((c) => c.ok === true).length + 1);
    // paid without a mark, or a signature: no thumb claim
    expect(applyPaidMark(before, { noMark: { reason: 'no-ink' } } as never)).toBe(before);
    expect(applyPaidMark(before, paidMark({ S: read('present', 'signature'), F: read('present', 'signature') }, 'x', true)).checks.find((c) => c.id === 'receipt')!.detail)
      .toBe('Received mark on both halves ✓ (signature)');
  });
  it('old receipts (no mark fields) hash exactly as before', () => {
    const a = appendReceipt([], base)[0];
    expect('receipt' in a).toBe(false);
    expect('noMark' in a).toBe(false);
  });
});
