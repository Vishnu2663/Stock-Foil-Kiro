// Seeded hashing and random numbers. Pure, no DOM.

export const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const BASE32_RE = /^[0-9A-HJKMNP-TV-Z]+$/;

/** cyrb53: a seeded 53-bit string hash. */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 PRNG: returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lowest `len` base32 digits of a non-negative integer, most significant first. */
export function toBase32(n: number, len: number): string {
  let v = Math.floor(Math.abs(n));
  let s = '';
  for (let i = 0; i < len; i++) {
    s = BASE32[v % 32] + s;
    v = Math.floor(v / 32);
  }
  return s;
}

/** Cryptographically random base32 string (falls back to Math.random only if crypto is missing). */
export function randomBase32(len: number): string {
  const bytes = new Uint8Array(len);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (let i = 0; i < len; i++) s += BASE32[bytes[i] & 31];
  return s;
}

/** Standard normal sample from a uniform PRNG (Box-Muller). */
export function gaussian(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-12);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
