// The demo cards' JPEG codec (src/render/jpeg.ts): complete standard tables, deterministic output, and a round trip
// within normal JPEG error; the scanner reads a card the same after a round trip.
import { describe, expect, it } from 'vitest';
import { encodeJpeg, decodeJpeg, STD, scaleQuant } from '../src/render/jpeg';
import { scanImage } from '../src/vision/detect';
import { cameraPhoto, recordedCard, sheetWithText, RECORDED_PUNCHES } from './cameraPhotos';

describe('demo-cards: JPEG codec', () => {
  it('the standard Huffman tables are complete (162 AC and 12 DC symbols each)', () => {
    for (const t of [STD.dcY, STD.dcC]) { expect(t.vals).toHaveLength(12); expect(t.bits.reduce((a, b) => a + b, 0)).toBe(12); }
    for (const t of [STD.acY, STD.acC]) { expect(t.vals).toHaveLength(162); expect(t.bits.reduce((a, b) => a + b, 0)).toBe(162); expect(new Set(t.vals).size).toBe(162); }
    expect(scaleQuant([16, 255], 50)).toEqual([16, 255]);
    expect(scaleQuant([16, 255], 100)).toEqual([1, 1]);
  });
  it('round trip: same size, small error, deterministic bytes', () => {
    const W = 37, H = 21, data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; data[i] = (x * 7) % 256; data[i + 1] = (y * 11) % 256; data[i + 2] = ((x + y) * 5) % 256; data[i + 3] = 255; }
    const a = encodeJpeg({ width: W, height: H, data }, 95), b = encodeJpeg({ width: W, height: H, data }, 95);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const d = decodeJpeg(a);
    expect([d.width, d.height]).toEqual([W, H]);
    let err = 0;
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) err += Math.abs(d.data[i + c] - data[i + c]);
    expect(err / (W * H * 3)).toBeLessThan(4);
  });
  it('a simulated card photo reads the same after JPEG quality 88', () => {
    const spec = recordedCard({ pairing: false });
    const img = cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 4, background: 0.12, pxPerMm: 3.6, blur: 1.2 }, sheetWithText(spec));
    const back = decodeJpeg(encodeJpeg(img, 88));
    const key = (r: ReturnType<typeof scanImage>) => r.halves[0].cells.map((c) => c.key + (c.punched ? 'P' : '') + (c.unsure ? 'U' : '')).join(',');
    expect(key(scanImage(back))).toBe(key(scanImage(img)));
  });
});
