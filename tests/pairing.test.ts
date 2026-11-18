import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { sha256Hex, pairTag, verifyPairing, newPairing, type PairingHalf } from '../src/core/pairing';
import { encodePayload, decodePayload, makeCard } from '../src/core/card';
import { base32, runs } from './helpers';

describe('card-core: SHA-256 (property 5)', () => {
  it('matches the NIST vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('equals Node crypto for any string', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300, unit: 'grapheme' }), (s) => {
        expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
      }),
      runs(200),
    );
  });
});

const half = (role: 'S' | 'F', id: string, secret?: string, tag?: string): PairingHalf =>
  ({ role, id, paired: secret !== undefined, secret, tag });

describe('card-core: pairing (property 6)', () => {
  it('an honest pair verifies; fabricated partner, swapped roles, foreign half or edited tag never verify', () => {
    fc.assert(
      fc.property(base32(8), base32(8), base32(12), fc.integer({ min: 0, max: 11 }), (id, otherId, fake, pos) => {
        const { sa, sf } = newPairing();
        const tag = pairTag(id, sa, sf);
        expect(verifyPairing(half('S', id, sa, tag), half('F', id, sf, tag))).toBe('verified');
        // fabricated partner: someone with the stock invents a foil secret
        if (fake !== sf) expect(verifyPairing(half('S', id, sa, tag), half('F', id, fake, tag))).toBe('failed');
        if (fake !== sa) expect(verifyPairing(half('S', id, fake, tag), half('F', id, sf, tag))).toBe('failed');
        // swapped roles
        expect(verifyPairing(half('F', id, sa, tag), half('S', id, sf, tag))).toBe('failed');
        // foreign half from another card
        if (otherId !== id) {
          const o = newPairing();
          const ot = pairTag(otherId, o.sa, o.sf);
          expect(verifyPairing(half('S', id, sa, tag), half('F', otherId, o.sf, ot))).toBe('failed');
          expect(verifyPairing(half('S', id, sa, tag), half('F', id, o.sf, ot))).toBe('failed');
        }
        // edited tag
        const ch = tag[pos] === '0' ? '1' : '0';
        const t2 = tag.slice(0, pos) + ch + tag.slice(pos + 1);
        expect(verifyPairing(half('S', id, sa, t2), half('F', id, sf, t2))).toBe('failed');
        expect(verifyPairing(half('S', id, sa, tag), half('F', id, sf, t2))).toBe('failed');
        // one paired, one legacy
        expect(verifyPairing(half('S', id, sa, tag), half('F', id))).toBe('failed');
        expect(verifyPairing(half('S', id), half('F', id))).toBe('legacy');
      }),
      runs(Math.max(40, 15 * 3)),
    );
  });

  it("one half's QR never reveals the other secret", () => {
    fc.assert(
      fc.property(base32(8), fc.constantFrom('S' as const, 'F' as const), (id, role) => {
        const spec = makeCard({ worker: 'W', employer: 'E', year: 2026, month: 5 }, id);
        const p = encodePayload(spec, role);
        const other = role === 'S' ? spec.pairing!.sf : spec.pairing!.sa;
        const mine = role === 'S' ? spec.pairing!.sa : spec.pairing!.sf;
        expect(p.includes(other)).toBe(false);
        expect(p.includes(mine)).toBe(true);
        const d = decodePayload(p)!;
        expect(d.spec.pairing).toBeUndefined();
      }),
      runs(),
    );
  });
});
