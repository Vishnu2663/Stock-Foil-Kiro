// demo-cards: the committed files in demo-cards/ give exactly the results written in expected.json (and in the judge's
// guide) with the REAL scanner: decode each JPEG, scanImage each half, verifyPair the pair. The punched-genuine pages
// are drawn from the same page geometry as the PDF and must read as set 1.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeJpeg } from '../src/render/jpeg';
import { scanImage } from '../src/vision/detect';
import { verifyPair, VERDICT_LABEL } from '../src/vision/pair';
import { disputedDays } from '../src/core/wages';
import { DEMO_SETS, expectedFor, punchedPageBitmap, CARD_MAIN, PAGE_ORIGIN, type Expected } from '../src/render/demoCards';
import { rasterSheet, inkFromBitmap } from '../src/render/rasterSvg';
import { renderHalf } from '../src/render/scene';
import { sheetSvg } from '../src/render/sheet';
import { STOCK_ORIGIN, FOIL_ORIGIN } from '../src/core/layout';
import type { Role } from '../src/core/card';

const DIR = join(__dirname, '..', 'demo-cards');
const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as { sets: Expected[] };
const scanFile = (folder: string, file: string) => {
  const bytes = readFileSync(join(DIR, folder, file));
  const img = decodeJpeg(new Uint8Array(bytes));
  return { img, size: bytes.length, half: scanImage(img).halves[0] };
};

describe('demo-cards: expected.json is the truth of the generator', () => {
  it('the committed expected.json equals what the demo sets define', () => {
    expect(expected.sets).toEqual(DEMO_SETS.map(expectedFor));
  });
  it('the story numbers: 22 × ₹700 − 2 × ₹100 = ₹15,200 and 20½ × ₹700 − ₹100 = ₹14,250', () => {
    expect(expected.sets[0]).toMatchObject({ days: 22, advances: 2, netMinor: 1520000, amount: '₹15,200' });
    expect(expected.sets[3]).toMatchObject({ days: 20.5, fullDays: 20, halfDays: 1, advances: 1, netMinor: 1425000, amount: '₹14,250' });
  });
});

describe('demo-cards: every set scans exactly as expected with the real scanner', () => {
  for (const e of expected.sets) {
    it(`${e.set}: ${VERDICT_LABEL[e.verdict]}`, () => {
      const s = scanFile(e.set, e.files.stock), f = scanFile(e.set, e.files.foil);
      for (const x of [s, f]) {
        expect(x.size).toBeLessThan(1.5 * 1024 * 1024);
        expect(Math.max(x.img.width, x.img.height)).toBeGreaterThan(1500);
        expect(Math.max(x.img.width, x.img.height)).toBeLessThan(1700);
        expect(x.half).toBeDefined();
        expect(x.half!.pose.fiducialsFound).toBe(4);
        expect(x.half!.cells.filter((c) => c.unsure)).toEqual([]);
      }
      expect(s.half!.decoded.role).toBe('S');
      expect(f.half!.decoded.role).toBe('F');
      const r = verifyPair(s.half, f.half);
      expect(r.verdict).toBe(e.verdict);
      if (e.verdict === 'pair-mismatch') {
        expect(r.checks.find((c) => c.id === 'id')!.ok).toBe(false);
        expect(r.pay).toBeNull();
        return;
      }
      const v = r.pay!.agreed;
      expect(v.days).toBe(e.days);
      expect(v.fullDays).toBe(e.fullDays);
      expect(v.halfDays).toBe(e.halfDays);
      expect(v.advCount).toBe(e.advances);
      expect(v.net).toBe(e.netMinor);
      expect(r.pay!.disputed).toBe(e.disputedMinor);
      expect(disputedDays(r.comparison!)).toEqual({ stock: e.stockOnlyDays, foil: e.foilOnlyDays });
      expect(r.edge!.status).toBe('match');
      expect(r.pairing).toBe('verified');
    });
  }
});

describe('demo-cards: print/punched-genuine.pdf', () => {
  const set1 = DEMO_SETS[0];
  const sheet = rasterSheet(sheetSvg(CARD_MAIN), 10);
  const ink = (role: Role) => inkFromBitmap(sheet, role === 'S' ? STOCK_ORIGIN.x : FOIL_ORIGIN.x, role === 'S' ? STOCK_ORIGIN.y : FOIL_ORIGIN.y);
  const page = (role: Role) => punchedPageBitmap(CARD_MAIN, role, role === 'S' ? set1.stock.keys : set1.foil.keys, ink(role), 5);
  const exp = expected.sets[0];
  const check = (S: ReturnType<typeof scanImage>, F: ReturnType<typeof scanImage>) => {
    const r = verifyPair(S.halves[0], F.halves[0]);
    expect(r.verdict).toBe('genuine-consistent');
    expect(r.pay!.agreed.days).toBe(exp.days);
    expect(r.pay!.agreed.advCount).toBe(exp.advances);
    expect(r.pay!.agreed.net).toBe(exp.netMinor);
    expect(r.edge!.status).toBe('match');
    expect(r.comparison!.unsureCount).toBe(0);
  };
  it('its two pages, rendered to pixels from the same page geometry, read as set 1 (cut checked)', () => {
    check(scanImage(page('S')), scanImage(page('F')));
  });
  it('and they still read as set 1 when photographed (a phone over a screen or print: 7° rotation, tilt, blur)', () => {
    const shot = (role: Role) => {
      const p = page(role), o = PAGE_ORIGIN[role];
      // the page as the printed surface of a half; the simulator cuts it on the same wave over a dark table
      const pageInk = (x: number, y: number) => {
        const px = Math.floor((x + o.x) * 5), py = Math.floor((y + o.y) * 5);
        return px < 0 || py < 0 || px >= p.width || py >= p.height ? 1 : p.data[(py * p.width + px) * 4] / 255;
      };
      const sc = renderHalf({ spec: CARD_MAIN, role, punched: [], ink: pageInk }, { seed: role === 'S' ? 5 : 6, pxPerMm: 4, rotationDeg: role === 'S' ? 7 : -7, tiltXDeg: 3, tiltYDeg: -2, blur: 1, noise: 0.01, light: 0.15, background: 0.08 });
      return scanImage({ width: sc.width, height: sc.height, data: sc.data });
    };
    check(shot('S'), shot('F'));
  });
});
