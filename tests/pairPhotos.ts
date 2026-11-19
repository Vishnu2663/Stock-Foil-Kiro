// Shared helpers for the simulated-photo pair tests (split across two files so they run in parallel).
import fc from 'fast-check';
import { makeCard, type CardSpec } from '../src/core/card';
import { verifyPair } from '../src/vision/pair';
import { renderPair, type PairInput } from '../src/render/scene';
import { scanImage } from '../src/vision/detect';
import { base32 } from './helpers';

// ---------------- simulated photos (property 4) ----------------

export function scanPair(input: PairInput) {
  const p = renderPair(input);
  const s = scanImage(p.stock).halves[0];
  const f = scanImage(p.foil).halves[0];
  return { s, f, result: verifyPair(s, f) };
}

export const photoCase = fc.record({
  id: base32(8), month: fc.integer({ min: 1, max: 12 }), seed: fc.integer({ min: 1, max: 1e6 }),
  rot1: fc.double({ min: -20, max: 20, noNaN: true }), rot2: fc.double({ min: -20, max: 20, noNaN: true }),
  blur: fc.double({ min: 0, max: 1, noNaN: true }),
  stack: fc.record({ dx: fc.double({ min: -0.5, max: 0.5, noNaN: true }), dy: fc.double({ min: -0.5, max: 0.5, noNaN: true }), rotDeg: fc.double({ min: -0.3, max: 0.3, noNaN: true }) }),
});

export function cardFor(c: { id: string; month: number }, paired = true, extra: Partial<CardSpec> = {}): CardSpec {
  const spec = { ...makeCard({ worker: 'Asha Devi', employer: 'Kumar Builders', year: 2026, month: c.month, pairing: paired }, c.id), ...extra };
  if (spec.pairing) spec.pairing = { sa: '7K3QX9ZT2M4B', sf: 'P8D2W6HN5RCA' }; // deterministic photos
  return spec;
}

export const days = (n: number, seed: number) => Array.from({ length: n }, (_, i) => `d${1 + ((seed + i * 3) % 27)}`).filter((v, i, a) => a.indexOf(v) === i);
