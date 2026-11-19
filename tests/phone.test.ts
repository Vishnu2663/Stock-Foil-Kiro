// Phone scan accuracy: the frame gates (blur, motion, fill), the 3-in-a-row streak key and the 4-of-5 vote,
// a 12 MP still downscaled to 1600 px, and glare. The 200 random frames run in tests/phone.p1..p4.test.ts.
import { describe, expect, it } from 'vitest';
import { scanImage, type HalfScan, type CellReading } from '../src/vision/detect';
import { sharpness, BLUR_MIN, fillRatio, FILL_MIN, isFastMotion, readKey, voteReads, LIVE } from '../src/vision/quality';
import { cameraPhoto, RECORDED_PUNCHES } from './cameraPhotos';
import { downTo } from './phoneSim';
import { phoneBmp, phoneSpec, phoneFrame, runPhoneCase, type PhoneCase } from './phoneCase';
import { sorted } from './helpers';

const base: PhoneCase = { role: 'S', punched: ['d4', 'd5', 'd6', 'a1', 'a2'], rot: 6, tx: 4, ty: -3, ppm: 3.5, blur: 1.3, bg: 0.12, jpeg: true, motion: true, dim: false, glare: null, seed: 5 };

function fake(id: string, punched: string[], unsure: string[] = []): HalfScan {
  const cells: CellReading[] = ['d1', 'd2', 'd3', 'a1'].map((k) => ({ key: k, kind: k[0] === 'a' ? 'adv' : 'day', n: Number(k.slice(1)), half: null, ratio: 0.5, punched: punched.includes(k), unsure: unsure.includes(k) }));
  return { decoded: { role: 'S', spec: { id } }, cells } as unknown as HalfScan;
}

describe('phone-scan: live gates', () => {
  it('timing: 300 ms and 3 reads in a row on phones, 450 ms and 2 on desktops', () => {
    expect(LIVE.phone).toEqual({ tick: 300, streak: 3 });
    expect(LIVE.desktop).toEqual({ tick: 450, streak: 2 });
  });
  it('a heavily blurred frame is skipped; the same frame sharp is not', () => {
    const spec = phoneSpec(), bmp = phoneBmp();
    for (const bg of [0.12, 0.3]) {
      const sharp = cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 5, background: bg, pxPerMm: 3.6, blur: 1.5 }, bmp);
      const soft = cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: 5, background: bg, pxPerMm: 3.6, blur: 4.5 }, bmp);
      expect(sharpness(sharp)).toBeGreaterThanOrEqual(BLUR_MIN);
      expect(sharpness(soft)).toBeLessThan(BLUR_MIN);
    }
  });
  it('fast motion and a small card are recognised', () => {
    expect(isFastMotion({ alpha: 80, beta: 0, gamma: 0 }, null)).toBe(true);
    expect(isFastMotion({ alpha: 5, beta: 3, gamma: 1 }, { x: 0.2, y: 0.1, z: 0.1 })).toBe(false);
    expect(fillRatio([[0, 0], [50, 0], [50, 50], [0, 50]], 100, 100)).toBeCloseTo(0.25);
    expect(fillRatio([[0, 0], [50, 0], [50, 50], [0, 50]], 100, 100)).toBeLessThan(FILL_MIN);
  });
  it('the streak key changes when any punch flips or the card changes', () => {
    expect(readKey(fake('A', ['d1']))).toBe(readKey(fake('A', ['d1'])));
    expect(readKey(fake('A', ['d1']))).not.toBe(readKey(fake('A', ['d1', 'd2'])));
    expect(readKey(fake('A', ['d1']))).not.toBe(readKey(fake('B', ['d1'])));
  });
  it('vote over 5: punched only when 4 of 5 agree, otherwise unsure', () => {
    const r = [fake('A', ['d1', 'd2']), fake('A', ['d1', 'd2']), fake('A', ['d1']), fake('A', ['d1', 'd2']), fake('A', ['d1', 'd2', 'd3'])];
    const v = voteReads(r);
    const c = (k: string) => v.cells.find((x) => x.key === k)!;
    expect(c('d1')).toMatchObject({ punched: true, unsure: false }); // 5/5
    expect(c('d2')).toMatchObject({ punched: true, unsure: false }); // 4/5
    expect(c('d3')).toMatchObject({ punched: false, unsure: false }); // 4/5 blank
    const w = voteReads([fake('A', ['d1']), fake('A', []), fake('A', ['d1']), fake('A', []), fake('A', ['d1'])]);
    expect(w.cells.find((x) => x.key === 'd1')).toMatchObject({ unsure: true }); // 3/5
    // reads of another card are not mixed in
    expect(voteReads([fake('B', []), fake('B', []), fake('A', ['d1'])]).cells.find((x) => x.key === 'd1')!.punched).toBe(true);
  });
});

describe('phone-scan: photos', () => {
  it('a 12 MP still downscaled to 1600 px reads exactly', () => {
    const spec = phoneSpec(), bmp = phoneBmp();
    const big = cameraPhoto(spec, 'S', RECORDED_PUNCHES, { rotationDeg: -8, background: 0.12, pxPerMm: 14, blur: 3 }, bmp);
    const { img } = downTo(big, 1600);
    expect(Math.max(img.width, img.height)).toBe(1600);
    const h = scanImage(img).halves[0];
    expect(sorted(h.cells.filter((c) => c.punched).map((c) => c.key))).toEqual(sorted(RECORDED_PUNCHES));
    expect(h.cells.filter((c) => c.unsure)).toEqual([]);
    expect(sharpness(img)).toBeGreaterThanOrEqual(BLUR_MIN);
  });
  it('motion blur 3 px + JPEG 0.6 + ±12° tilt + perspective + fingers: exact', () => {
    for (const rot of [-12, 12]) {
      const o = runPhoneCase(phoneSpec(), phoneBmp(), { ...base, rot });
      expect(o.read).toBe(true);
      expect(o.wrongSure).toEqual([]);
      expect(o.unsure).toEqual([]);
    }
  });
  it('40% light still reads', () => {
    const o = runPhoneCase(phoneSpec(), phoneBmp(), { ...base, dim: true });
    expect(o.read).toBe(true);
    expect(o.wrongSure).toEqual([]);
  });
  it('a glare spot over a punched hole makes that spot unsure (it would read blank without the rule) and warns', () => {
    const spec = phoneSpec(), bmp = phoneBmp();
    const c: PhoneCase = { ...base, motion: false, jpeg: false, glare: 4 }; // targets[4] is day 5 (punched)
    const { img, glareKey } = phoneFrame(spec, bmp, c);
    expect(c.punched).toContain(glareKey);
    const h = scanImage(img).halves[0];
    const cell = h.cells.find((x) => x.key === glareKey)!;
    expect(cell.unsure).toBe(true);
    expect(h.warnings).toContain('glare');
    expect(runPhoneCase(spec, bmp, c, false).wrongSure).toContain(glareKey);
  });
});
