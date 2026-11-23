// A small baseline JPEG encoder and decoder (ITU T.81), so the demo cards can be written and checked in Node with no
// dependency. Encoder: YCbCr 4:4:4, the standard quantisation tables scaled like IJG's quality setting, the standard
// Huffman tables (Annex K). Decoder: baseline Huffman files, 1 or 3 components, any sampling up to 2×2, restart
// markers. Pure, no DOM.
import type { RGBAImage } from '../vision/image';

const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const QY = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...Array(32).fill(99)];
export interface HuffSpec { bits: number[]; vals: number[] }
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** The standard tables of Annex K.3 (counts per code length 1..16, then the symbols). */
export const STD: { dcY: HuffSpec; acY: HuffSpec; dcC: HuffSpec; acC: HuffSpec } = {
  dcY: { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: range(12) },
  dcC: { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: range(12) },
  acY: {
    bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
    vals: [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1,
      0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26,
      0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56,
      0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85,
      0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,
      0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
      0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
  },
  acC: {
    bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
    vals: [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42,
      0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a,
      0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56,
      0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84,
      0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9,
      0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5,
      0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
  },
};

/** Codes (value → [code, length]) from a table spec (Annex C). */
function codesOf(t: HuffSpec): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < t.bits[len - 1]; i++) out.set(t.vals[k++], [code++, len]);
    code <<= 1;
  }
  return out;
}

/** IJG quality scaling of a quantisation table (quality 1..100). */
export function scaleQuant(base: number[], quality: number): number[] {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
}

const COS = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
const CU = (u: number) => (u ? 1 : Math.SQRT1_2);

function fdct(b: Float64Array, out: Float64Array) {
  const t = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += b[y * 8 + x] * COS[x * 8 + u]; t[y * 8 + u] = s * CU(u) / 2; }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += t[y * 8 + u] * COS[y * 8 + v]; out[v * 8 + u] = s * CU(v) / 2; }
}
function idct(c: Float64Array, out: Float64Array) {
  const t = new Float64Array(64);
  for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += CU(u) * c[v * 8 + u] * COS[x * 8 + u]; t[v * 8 + x] = s / 2; }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += CU(v) * t[v * 8 + x] * COS[y * 8 + v]; out[y * 8 + x] = s / 2; }
}

class BitWriter {
  buf: number[] = [];
  private acc = 0;
  private n = 0;
  write(code: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((code >> i) & 1);
      if (++this.n === 8) { this.buf.push(this.acc); if (this.acc === 0xff) this.buf.push(0); this.acc = 0; this.n = 0; }
    }
  }
  flush() { if (this.n) this.write(0xff >> this.n, 8 - this.n); }
}
const catOf = (v: number) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };
const bitsOf = (v: number, n: number) => (v < 0 ? v + (1 << n) - 1 : v);

/** Encode RGBA (alpha ignored) as a baseline JFIF JPEG at quality 1..100. Deterministic. */
export function encodeJpeg(img: RGBAImage, quality = 88): Uint8Array {
  const { width: W, height: H, data } = img;
  const qy = scaleQuant(QY, quality), qc = scaleQuant(QC, quality);
  const cdcY = codesOf(STD.dcY), cacY = codesOf(STD.acY), cdcC = codesOf(STD.dcC), cacC = codesOf(STD.acC);
  const out: number[] = [];
  const w16 = (v: number) => out.push((v >> 8) & 255, v & 255);
  const seg = (marker: number, body: number[]) => { out.push(0xff, marker); w16(body.length + 2); out.push(...body); };
  out.push(0xff, 0xd8);
  seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  seg(0xdb, [0, ...ZZ.map((k) => qy[k]), 1, ...ZZ.map((k) => qc[k])]);
  seg(0xc0, [8, (H >> 8) & 255, H & 255, (W >> 8) & 255, W & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = (cls: number, id: number, t: HuffSpec) => [(cls << 4) | id, ...t.bits, ...t.vals];
  seg(0xc4, [...dht(0, 0, STD.dcY), ...dht(1, 0, STD.acY), ...dht(0, 1, STD.dcC), ...dht(1, 1, STD.acC)]);
  seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const bw = new BitWriter();
  const pred = [0, 0, 0];
  const blk = new Float64Array(64), co = new Float64Array(64);
  const px = (x: number, y: number) => (Math.min(H - 1, y) * W + Math.min(W - 1, x)) * 4;
  const block = (c: number, bx: number, by: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = px(bx + x, by + y), r = data[i], g = data[i + 1], b = data[i + 2];
      blk[y * 8 + x] = c === 0 ? 0.299 * r + 0.587 * g + 0.114 * b - 128
        : c === 1 ? -0.168736 * r - 0.331264 * g + 0.5 * b : 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
    fdct(blk, co);
    const q = c === 0 ? qy : qc, dc = c === 0 ? cdcY : cdcC, ac = c === 0 ? cacY : cacC;
    const z = ZZ.map((k) => Math.round(co[k] / q[k]));
    const diff = z[0] - pred[c];
    pred[c] = z[0];
    const dn = catOf(diff), [dcode, dlen] = dc.get(dn)!;
    bw.write(dcode, dlen);
    if (dn) bw.write(bitsOf(diff, dn), dn);
    let run = 0;
    for (let k = 1; k < 64; k++) {
      if (z[k] === 0) { run++; continue; }
      while (run > 15) { const [c16, l16] = ac.get(0xf0)!; bw.write(c16, l16); run -= 16; }
      const n = catOf(z[k]), [code, len] = ac.get((run << 4) | n)!;
      bw.write(code, len);
      bw.write(bitsOf(z[k], n), n);
      run = 0;
    }
    if (run) { const [ce, le] = ac.get(0)!; bw.write(ce, le); }
  };
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) for (let c = 0; c < 3; c++) block(c, bx, by);
  bw.flush();
  for (const b of bw.buf) out.push(b);
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

// ---------------- decoder ----------------

interface Huff { lookup: Map<number, number>[] } // per length: code → value
function huffOf(bits: number[], vals: number[]): Huff {
  const lookup: Map<number, number>[] = [];
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    const m = new Map<number, number>();
    for (let i = 0; i < bits[len - 1]; i++) m.set(code++, vals[k++]);
    lookup[len] = m;
    code <<= 1;
  }
  return { lookup };
}

/** Decode a baseline JPEG to RGBA. Throws on progressive or arithmetic-coded files. */
export function decodeJpeg(bytes: Uint8Array): RGBAImage {
  let p = 2;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  const qt: number[][] = [];
  const dc: Huff[] = [], ac: Huff[] = [];
  let W = 0, H = 0, restart = 0;
  let comps: { id: number; h: number; v: number; q: number; td: number; ta: number; pred: number; data?: Float64Array; bw?: number; bh?: number }[] = [];
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  for (;;) {
    if (bytes[p] !== 0xff) throw new Error('bad marker');
    const m = bytes[p + 1];
    p += 2;
    if (m === 0xd9) break;
    const len = u16(p);
    const body = p + 2, end = p + len;
    if (m === 0xdb) {
      for (let i = body; i < end;) { const pq = bytes[i] >> 4, tq = bytes[i] & 15; i++; const t: number[] = []; for (let k = 0; k < 64; k++) { t[ZZ[k]] = pq ? u16(i + 2 * k) : bytes[i + k]; } qt[tq] = t; i += pq ? 128 : 64; }
    } else if (m === 0xc0 || m === 0xc1) {
      H = u16(body + 1); W = u16(body + 3);
      const n = bytes[body + 5];
      comps = [];
      for (let i = 0; i < n; i++) { const o = body + 6 + i * 3; comps.push({ id: bytes[o], h: bytes[o + 1] >> 4, v: bytes[o + 1] & 15, q: bytes[o + 2], td: 0, ta: 0, pred: 0 }); }
    } else if (m === 0xc2 || m === 0xc3 || (m >= 0xc5 && m <= 0xcf && m !== 0xc8 && m !== 0xcc)) {
      throw new Error('only baseline JPEG is supported');
    } else if (m === 0xc4) {
      for (let i = body; i < end;) {
        const tc = bytes[i] >> 4, th = bytes[i] & 15;
        const bits = Array.from(bytes.subarray(i + 1, i + 17));
        const n = bits.reduce((s, x) => s + x, 0);
        const vals = Array.from(bytes.subarray(i + 17, i + 17 + n));
        (tc ? ac : dc)[th] = huffOf(bits, vals);
        i += 17 + n;
      }
    } else if (m === 0xdd) {
      restart = u16(body);
    } else if (m === 0xda) {
      const ns = bytes[body];
      const scomp = [];
      for (let i = 0; i < ns; i++) {
        const c = comps.find((x) => x.id === bytes[body + 1 + i * 2])!;
        c.td = bytes[body + 2 + i * 2] >> 4; c.ta = bytes[body + 2 + i * 2] & 15;
        scomp.push(c);
      }
      p = end;
      p = decodeScan(bytes, p, W, H, comps, scomp, qt, dc, ac, restart);
      continue;
    }
    p = end;
  }
  // colour conversion with upsampling (nearest)
  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const out = new Uint8ClampedArray(W * H * 4);
  const at = (c: (typeof comps)[number], x: number, y: number) => c.data![Math.floor((y * c.v) / vmax) * c.bw! * 8 + Math.floor((x * c.h) / hmax)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (comps.length === 1) { const v = at(comps[0], x, y); out[o] = out[o + 1] = out[o + 2] = v; }
    else {
      const Y = at(comps[0], x, y), Cb = at(comps[1], x, y) - 128, Cr = at(comps[2], x, y) - 128;
      out[o] = Y + 1.402 * Cr; out[o + 1] = Y - 0.344136 * Cb - 0.714136 * Cr; out[o + 2] = Y + 1.772 * Cb;
    }
    out[o + 3] = 255;
  }
  return { width: W, height: H, data: out };
}

function decodeScan(bytes: Uint8Array, p: number, W: number, H: number, comps: { h: number; v: number; q: number; td: number; ta: number; pred: number; data?: Float64Array; bw?: number; bh?: number }[],
  scomp: typeof comps, qt: number[][], dc: Huff[], ac: Huff[], restart: number): number {
  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const mcux = Math.ceil(W / (8 * hmax)), mcuy = Math.ceil(H / (8 * vmax));
  for (const c of comps) { c.bw = mcux * c.h; c.bh = mcuy * c.v; c.data ??= new Float64Array(c.bw * 8 * c.bh * 8); c.pred = 0; }
  let acc = 0, nb = 0;
  const bit = () => {
    if (!nb) {
      let b = bytes[p++];
      if (b === 0xff) { const nx = bytes[p]; if (nx === 0) p++; else { b = 0; p--; } }
      acc = b; nb = 8;
    }
    nb--;
    return (acc >> nb) & 1;
  };
  const decode = (h: Huff) => { let code = 0; for (let len = 1; len <= 16; len++) { code = (code << 1) | bit(); const v = h.lookup[len].get(code); if (v !== undefined) return v; } throw new Error('bad Huffman code'); };
  const receive = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v; };
  const co = new Float64Array(64), px = new Float64Array(64);
  const block = (c: (typeof comps)[number], bx: number, by: number) => {
    co.fill(0);
    const t = decode(dc[c.td]);
    c.pred += t ? receive(t) : 0;
    const q = qt[c.q];
    co[0] = c.pred * q[0];
    for (let k = 1; k < 64;) {
      const rs = decode(ac[c.ta]), r = rs >> 4, s = rs & 15;
      if (!s) { if (r === 15) { k += 16; continue; } break; }
      k += r;
      co[ZZ[k]] = receive(s) * q[ZZ[k]];
      k++;
    }
    idct(co, px);
    const stride = c.bw! * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.data![(by * 8 + y) * stride + bx * 8 + x] = Math.max(0, Math.min(255, px[y * 8 + x] + 128));
  };
  const total = scomp.length === 1 ? Math.ceil((W * scomp[0].h) / hmax / 8) * Math.ceil((H * scomp[0].v) / vmax / 8) : mcux * mcuy;
  for (let n = 0; n < total; n++) {
    if (restart && n && n % restart === 0) {
      nb = 0;
      while (p < bytes.length && !(bytes[p] === 0xff && bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7)) p++;
      p += 2;
      for (const c of scomp) c.pred = 0;
    }
    if (scomp.length === 1) {
      const c = scomp[0], bpr = Math.ceil((W * c.h) / hmax / 8);
      block(c, n % bpr, Math.floor(n / bpr));
    } else {
      const mx = n % mcux, my = Math.floor(n / mcux);
      for (const c of scomp) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) block(c, mx * c.h + h, my * c.v + v);
    }
  }
  while (p < bytes.length - 1 && !(bytes[p] === 0xff && bytes[p + 1] !== 0 && !(bytes[p + 1] >= 0xd0 && bytes[p + 1] <= 0xd7))) p++;
  return p;
}
