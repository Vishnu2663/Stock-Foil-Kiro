// Phase 1 properties: routes, splash parser, t() formatting.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseHash, parseSplash, ROUTES, ROUTE_IDS } from '../src/ui/routes';
import { format } from '../src/i18n/uiPack';
import { runs } from './helpers';

describe('foundation', () => {
  it('P1: any hash parses to a known route; every known route parses to itself', () => {
    fc.assert(fc.property(fc.string(), (s) => { expect(ROUTE_IDS).toContain(parseHash(s)); }), runs(300));
    for (const id of ROUTE_IDS) expect(parseHash('#/' + id)).toBe(id);
    expect(parseHash('')).toBe('home');
    expect(parseHash('#/nope')).toBe('home');
  });

  it('P5: exactly the 15 routes, with Records and More in the brief order', () => {
    expect(ROUTE_IDS).toHaveLength(15);
    expect(ROUTES.filter((r) => r.group === 'main').map((r) => r.title)).toEqual(['Home', 'New card', 'Members', 'Payday scan', 'Crew', 'Story']);
    expect(ROUTES.filter((r) => r.group === 'records').map((r) => r.title)).toEqual(['History', 'Ledger', 'Income proof']);
    expect(ROUTES.filter((r) => r.group === 'more').map((r) => r.title)).toEqual(['Punch guide', 'Demo', 'Test lab', 'Calibrate', 'About & security']);
  });

  it('P6: ?splash= is an integer in 0..10000, default 1500', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const v = parseSplash('?splash=' + encodeURIComponent(s));
      expect(Number.isInteger(v) && v >= 0 && v <= 10000).toBe(true);
    }), runs(300));
    expect(parseSplash('')).toBe(1500);
    expect(parseSplash('?splash=300')).toBe(300);
    expect(parseSplash('?splash=99999')).toBe(10000);
  });

  it('P4: t() fills every {n} that has an argument and leaves the others', () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.string(), fc.integer()), { maxLength: 4 }), (args) => {
      const out = format('a {0} b {1} c {2} d {3}', ...args);
      args.forEach((a) => expect(out).toContain(String(a)));
      for (let i = args.length; i < 4; i++) expect(out).toContain(`{${i}}`);
    }), runs(200));
  });
});
