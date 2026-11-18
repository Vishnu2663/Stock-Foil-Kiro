// Phase 11 and §6.9: anonymised prompts, offline explanation, fallback; speech chunking and voice scoring.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildPrompt, offlineExplain, explain, sumLine, type PayFacts } from '../src/ai/index';
import { chunkText, scoreVoice, rankVoices, MAX_CHUNK, PAUSE } from '../src/ai/speech';
import { DEFAULT_SETTINGS } from '../src/store/index';
import { formatMoney } from '../src/core/card';
import { factsFromResult } from './factsHelper';
import { base32, runs, name } from './helpers';

const daysArb = fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 4 });
const factsArb: fc.Arbitrary<PayFacts> = fc.record({
  verdict: fc.constantFrom('genuine-consistent', 'genuine-disputed', 'review'),
  currency: fc.constantFrom('INR', 'KES', 'USD'),
  fullDays: fc.integer({ min: 0, max: 31 }), halfDays: fc.integer({ min: 0, max: 5 }), days: fc.integer({ min: 0, max: 31 }),
  rateMinor: fc.integer({ min: 0, max: 200000 }), advCount: fc.integer({ min: 0, max: 10 }), advMinor: fc.integer({ min: 0, max: 200000 }),
  carryMinor: fc.integer({ min: -100000, max: 0 }), netMinor: fc.integer({ min: -100000, max: 6_000_000 }), disputedMinor: fc.integer({ min: 0, max: 100000 }),
  stockOnlyDays: daysArb, foilOnlyDays: daysArb,
}) as fc.Arbitrary<PayFacts>;

describe('optional-ai', () => {
  it('the cloud prompt never contains names or ids', () => {
    fc.assert(
      fc.property(name.filter((n) => n.length >= 4), name.filter((n) => n.length >= 4), base32(8), factsArb, (worker, employer, id, f) => {
        const facts = factsFromResult(f, { worker, employer, id });
        const p = buildPrompt(facts, 'hi');
        expect(p.includes(worker)).toBe(false);
        expect(p.includes(employer)).toBe(false);
        expect(p.includes(id)).toBe(false);
      }),
      runs(200),
    );
  });

  it('the offline text always contains the sum and the disputed days', () => {
    fc.assert(
      fc.property(factsArb, fc.constantFrom('en', 'hi', 'bn', 'ta', 'es', 'sw', 'fr'), (f, lang) => {
        const txt = offlineExplain(f, lang);
        expect(txt).toContain(sumLine(f));
        expect(txt).toContain(formatMoney(f.netMinor, f.currency));
        for (const d of [...f.stockOnlyDays, ...f.foilOnlyDays]) expect(txt).toMatch(new RegExp(`(^|\\D)${d}(\\D|$)`));
      }),
      runs(200),
    );
  });

  it('a failure falls back to the offline explanation', async () => {
    await fc.assert(
      fc.asyncProperty(factsArb, fc.constantFrom('throw', 'http500', 'empty'), async (f, how) => {
        const fetchImpl = async () => {
          if (how === 'throw') throw new Error('network down');
          return { ok: how !== 'http500', status: how === 'http500' ? 500 : 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
        };
        const r = await explain({ ...DEFAULT_SETTINGS, aiProvider: 'custom' }, f, 'en', fetchImpl);
        expect(r.source).toBe('offline');
        expect(r.text).toBe(offlineExplain(f, 'en'));
      }),
      runs(),
    );
    const f = fc.sample(factsArb, 1)[0];
    const ok = await explain({ ...DEFAULT_SETTINGS, aiProvider: 'custom' }, f, 'en', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'AI says hi' } }] }) }));
    expect(ok.source).toBe('ai');
    expect(ok.text).toContain(sumLine(f)); // the calculated sum is always shown under AI text
    const off = await explain({ ...DEFAULT_SETTINGS, aiProvider: 'off' }, f, 'en');
    expect(off.source).toBe('offline');
  });
});

describe('speech (§6.9)', () => {
  it('chunks are at most 170 characters, keep every word, and pause 650/280/160ms', () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.lorem({ maxCount: 40, mode: 'sentences' }), { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 3 }), (paras) => {
        const text = paras.map((p) => p.join(' ')).join('\n\n');
        const chunks = chunkText(text);
        for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK);
        expect(chunks.map((c) => c.text).join(' ').split(/\s+/).filter(Boolean)).toEqual(text.split(/\s+/).filter(Boolean));
        for (const c of chunks) expect([0, PAUSE.paragraph, PAUSE.sentence, PAUSE.comma]).toContain(c.pause);
        expect(chunks[chunks.length - 1].pause).toBe(0);
      }),
      runs(100),
    );
    const c = chunkText('One. Two.\n\nThree, ' + 'word '.repeat(60) + 'end.');
    expect(c[0]).toEqual({ text: 'One.', pause: PAUSE.sentence });
    expect(c[1]).toEqual({ text: 'Two.', pause: PAUSE.paragraph });
  });

  it('voice scoring prefers natural voices and penalises robotic ones; Marathi falls back to Hindi', () => {
    expect(scoreVoice({ name: 'Microsoft Swara Online (Natural)', lang: 'hi-IN', localService: false }, 'hi')).toBeGreaterThan(scoreVoice({ name: 'Lekha', lang: 'hi-IN', localService: true }, 'hi'));
    expect(scoreVoice({ name: 'Google हिन्दी', lang: 'hi-IN' }, 'hi')).toBeGreaterThan(scoreVoice({ name: 'Lekha', lang: 'hi-IN', localService: true }, 'hi'));
    expect(scoreVoice({ name: 'Zarvox', lang: 'en-US' }, 'en')).toBeLessThan(scoreVoice({ name: 'Samantha', lang: 'en-US' }, 'en'));
    const voices = [{ name: 'Lekha', lang: 'hi-IN', voiceURI: 'lekha' }, { name: 'Alex', lang: 'en-US', voiceURI: 'alex' }];
    expect(rankVoices(voices, 'mr')[0].voiceURI).toBe('lekha');
    expect(rankVoices(voices, 'mr', new Set(['lekha']))).toEqual([]);
  });
});
