import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  encodePayload, decodePayload, cardCode, clampAmount, clampCarry, cleanName, makeCard, formatCode, parseMajor,
  type CardSpec,
} from '../src/core/card';
import { specArb, runs } from './helpers';

describe('card-core: payload (property 1)', () => {
  it('encode → decode round-trips every spec, role and flag combination', () => {
    fc.assert(
      fc.property(specArb, fc.constantFrom('S' as const, 'F' as const), (spec, role) => {
        const d = decodePayload(encodePayload(spec, role))!;
        expect(d).not.toBeNull();
        expect(d.codeOk).toBe(true);
        expect(d.role).toBe(role);
        expect(d.paired).toBe(!!spec.pairing);
        const { pairing, ...rest } = spec;
        expect(d.spec).toEqual(rest);
        if (pairing) expect(d.secret).toBe(role === 'S' ? pairing.sa : pairing.sf);
      }),
      runs(Math.max(50, 15 * 5)),
    );
  });

  it('editing any field covered by the code makes codeOk false', () => {
    fc.assert(
      fc.property(specArb, fc.constantFrom('S' as const, 'F' as const), fc.constantFrom('id', 'yyyymm', 'rate', 'adv', 'cur', 'lang', 'carry', 'worker', 'employer'), (spec, role, field) => {
        const f = encodePayload(spec, role).split('|');
        const two = spec.carryMinor !== 0;
        const p = spec.pairing ? 2 : 0;
        const idx: Record<string, number> = {
          id: 2, yyyymm: 3, rate: 4, adv: 5, cur: 6, lang: 7, carry: two ? 8 : -1,
          worker: (two ? 10 : 9) + p, employer: (two ? 11 : 10) + p,
        };
        const i = idx[field];
        if (i < 0) return;
        const edits: Record<string, (s: string) => string> = {
          id: (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1),
          yyyymm: (s) => s.slice(0, 4) + (s.slice(4) === '01' ? '02' : '01'),
          rate: (s) => String((Number(s) + 1) % 200001),
          adv: (s) => String((Number(s) + 1) % 200001),
          cur: (s) => (s === 'USD' ? 'GBP' : 'USD'),
          lang: (s) => (s === 'fr' ? 'de' : 'fr'),
          carry: (s) => String(Number(s) > 0 ? Number(s) - 1 || 2 : Number(s) + 1 || -2),
          worker: (s) => s + 'x',
          employer: (s) => s + 'x',
        };
        f[i] = edits[field](f[i]);
        const d = decodePayload(f.join('|'));
        if (d) expect(d.codeOk).toBe(false);
      }),
      runs(Math.max(60, 15 * 5)),
    );
  });
});

describe('card-core: SF1 compatibility (property 2)', () => {
  it('a card with no carry, halves or discs encodes to exactly the SF1 form', () => {
    fc.assert(
      fc.property(specArb, (s0) => {
        const spec: CardSpec = { ...s0, carryMinor: 0 };
        delete spec.halves; delete spec.discs; delete spec.pairing;
        const p = encodePayload(spec, 'S');
        const ym = `${spec.year}${String(spec.month).padStart(2, '0')}`;
        expect(p).toBe(['SF1', 'S', spec.id, ym, spec.rateMinor, spec.advMinor, spec.currency, spec.lang, cardCode(spec), spec.worker, spec.employer].join('|'));
      }),
      runs(),
    );
  });

  it('old SF1 payloads still decode (fixed vector)', () => {
    const spec = makeCard({ worker: 'Ravi', employer: 'Mehta & Sons', year: 2025, month: 3, pairing: false }, 'K7M2Q9XA');
    const raw = `SF1|F|K7M2Q9XA|202503|50000|10000|INR|en|${cardCode(spec)}|Ravi|Mehta & Sons`;
    const d = decodePayload(raw)!;
    expect(d.codeOk).toBe(true);
    expect(d.spec.month).toBe(3);
    expect(d.spec.employer).toBe('Mehta & Sons');
  });

  it('rejects bad version, role, month and numbers', () => {
    for (const bad of [
      'SF3|S|K7M2Q9XA|202503|1|1|INR|en|ABCDEF|a|b', 'SF1|X|K7M2Q9XA|202503|1|1|INR|en|ABCDEF|a|b',
      'SF1|S|K7M2Q9XA|202513|1|1|INR|en|ABCDEF|a|b', 'SF1|S|K7M2Q9XA|202503|-1|1|INR|en|ABCDEF|a|b',
      'SF1|S|K7M2Q9XA|202503|1.5|1|INR|en|ABCDEF|a|b', 'SF1|S|K7M2Q9IL|202503|1|1|INR|en|ABCDEF|a|b',
      'SF1dh|S|K7M2Q9XA|202503|1|1|INR|en|ABCDEF|a|b', 'hello',
    ]) expect(decodePayload(bad)).toBeNull();
  });

  it('the employer name may contain the rest of the fields', () => {
    const spec = makeCard({ worker: 'A', employer: 'B', year: 2026, month: 1, pairing: false }, 'K7M2Q9XA');
    const d = decodePayload(encodePayload(spec, 'S') + '|extra')!;
    expect(d.spec.employer).toBe('B|extra');
    expect(d.codeOk).toBe(false);
  });
});

describe('card-core: amounts (property 4)', () => {
  it('amounts never exceed 2,000 major units, even for NaN or ±Infinity', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity, 1e300, -0)), (x) => {
        const v = clampAmount(x);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(200000);
        if (Number.isNaN(x)) expect(v).toBe(0);
      }),
      runs(200),
    );
    expect(clampAmount(Infinity)).toBe(200000);
    expect(clampAmount(-Infinity)).toBe(0);
  });

  it('a hand-typed carry is capped at ±100,000 major', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double(), fc.constantFrom(NaN, Infinity, -Infinity)), (x) => {
        const v = clampCarry(x);
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(10_000_000);
      }),
      runs(200),
    );
  });

  it('cleanName removes | and newlines, trims and caps at 18', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const c = cleanName(s);
        expect(c.length).toBeLessThanOrEqual(18);
        expect(/[|\r\n]/.test(c)).toBe(false);
        expect(c).toBe(c.trim());
        expect(cleanName(c)).toBe(c);
      }),
      runs(200),
    );
  });

  it('formats the code as XXX-XXX and parses typed amounts exactly', () => {
    expect(formatCode('ABC123')).toBe('ABC-123');
    expect(parseMajor('500')).toBe(50000);
    expect(parseMajor('500.5')).toBe(50050);
    expect(parseMajor('0.07')).toBe(7);
    expect(parseMajor('1,250.25')).toBe(125025);
    expect(Number.isNaN(parseMajor('abc'))).toBe(true);
  });
});
