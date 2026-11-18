// Phase 10: packs complete with intact placeholders; every story chapter has text; the translator compiles templates.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allStrings, checkPack, LANGS } from '../scripts/check-ui-pack.mjs';
import { STORY, STORY_EN } from '../src/i18n/story';
import { compile, translateWith } from '../src/i18n/uiPack';
import { SLIP, VERDICTS, PROMPTS, EXPLAIN, UI_LANGS } from '../src/i18n/index';
import { runs } from './helpers';

describe('languages-and-voice: packs', () => {
  it.each(LANGS)('the %s pack has every string and keeps every placeholder', (lang) => {
    const r = checkPack(lang, allStrings());
    expect(r.missing).toEqual([]);
    expect(r.broken).toEqual([]);
  });

  it('every story language has all 9 chapters with text', () => {
    const langs = Object.keys(STORY);
    for (const l of ['en', 'hi', 'bn', 'ta', 'es', 'sw', 'te', 'mr', 'fr', 'pt', 'ar']) expect(langs).toContain(l);
    for (const [l, ch] of Object.entries(STORY)) {
      expect(ch.length, l).toBe(STORY_EN.length);
      for (const c of ch) {
        expect(c.title.trim().length, l).toBeGreaterThan(0);
        expect(c.short.trim().length, l).toBeGreaterThan(0);
        expect(c.text.trim().length, l).toBeGreaterThan(20);
      }
    }
  });

  it('slip, verdict, prompt and explanation dictionaries exist for every UI language with the same placeholders', () => {
    const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
    for (const { code } of UI_LANGS) {
      for (const [dict, en] of [[SLIP[code], SLIP.en], [VERDICTS[code], VERDICTS.en], [PROMPTS[code], PROMPTS.en], [EXPLAIN[code], EXPLAIN.en]] as const) {
        expect(dict, code).toBeDefined();
        for (const k of Object.keys(en)) expect(ph((dict as Record<string, string>)[k]), `${code}.${k}`).toBe(ph((en as Record<string, string>)[k]));
      }
    }
  });

  it('templates translate with their arguments in place', () => {
    const c = compile({ 'Paid on {0}': 'Pagado el {0}', '{0} of {1} done': '{1} में से {0}', Home: 'Inicio' });
    expect(translateWith(c, 'Home')).toBe('Inicio');
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !/\s/.test(s)), fc.nat(), fc.nat(), (d, a, b) => {
        expect(translateWith(c, `Paid on ${d}`)).toBe(`Pagado el ${d}`);
        expect(translateWith(c, `${a} of ${b} done`)).toBe(`${b} में से ${a}`);
      }),
      runs(100),
    );
    expect(translateWith(c, 'Nothing like this')).toBeNull();
  });
});
