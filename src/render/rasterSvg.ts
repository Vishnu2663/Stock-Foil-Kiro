// A minimal rasteriser for the SVG sheet we generate (rect, circle, path with M/L/h/v/z), used by the
// print round-trip in Node. Text is skipped (the browser round-trip in the Test lab includes it).

export interface Bitmap { width: number; height: number; data: Float32Array; pxPerMm: number } // luminance 0..1

const lum = (fill: string): number => {
  const f = fill.trim().toLowerCase();
  if (f === 'none') return -1;
  if (f === '#000' || f === 'black') return 0;
  if (f === '#fff' || f === 'white') return 1;
  const m = /^#([0-9a-f]{6})$/.exec(f);
  if (m) {
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  return 0.13; // inherited ink
};

export function rasterSheet(svg: string, pxPerMm = 6): Bitmap {
  const width = Math.round(210 * pxPerMm), height = Math.round(297 * pxPerMm);
  const data = new Float32Array(width * height).fill(1);
  const fillRect = (x: number, y: number, w: number, h: number, v: number) => {
    const x0 = Math.max(0, Math.round(x * pxPerMm)), x1 = Math.min(width, Math.round((x + w) * pxPerMm));
    const y0 = Math.max(0, Math.round(y * pxPerMm)), y1 = Math.min(height, Math.round((y + h) * pxPerMm));
    for (let yy = y0; yy < y1; yy++) data.fill(v, yy * width + x0, yy * width + x1);
  };
  const strokeRect = (x: number, y: number, w: number, h: number, sw: number, v: number) => {
    fillRect(x - sw / 2, y - sw / 2, w + sw, sw, v);
    fillRect(x - sw / 2, y + h - sw / 2, w + sw, sw, v);
    fillRect(x - sw / 2, y - sw / 2, sw, h + sw, v);
    fillRect(x + w - sw / 2, y - sw / 2, sw, h + sw, v);
  };
  const circle = (cx: number, cy: number, r: number, v: number, sw: number) => {
    const R = r + sw;
    const x0 = Math.max(0, Math.floor((cx - R) * pxPerMm)), x1 = Math.min(width - 1, Math.ceil((cx + R) * pxPerMm));
    const y0 = Math.max(0, Math.floor((cy - R) * pxPerMm)), y1 = Math.min(height - 1, Math.ceil((cy + R) * pxPerMm));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot((x + 0.5) / pxPerMm - cx, (y + 0.5) / pxPerMm - cy);
      if (sw > 0 ? Math.abs(d - r) <= sw / 2 : d <= r) data[y * width + x] = v;
    }
  };
  // Track group translations: we only generate translate(x y) groups one level deep.
  const re = /<g transform="translate\(([\d.]+) ([\d.]+)\)">|<\/g>|<rect ([^>]*)\/>|<circle ([^>]*)\/>|<path ([^>]*)\/>|<text[\s\S]*?<\/text>/g;
  const attr = (s: string, k: string) => { const m = new RegExp(`${k}="([^"]*)"`).exec(s); return m ? m[1] : undefined; };
  const stack: [number, number][] = [[0, 0]];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const [ox, oy] = stack[stack.length - 1];
    if (m[1] !== undefined) { stack.push([ox + Number(m[1]), oy + Number(m[2])]); continue; }
    if (m[0] === '</g>') { if (stack.length > 1) stack.pop(); continue; }
    if (m[3] !== undefined) {
      const a = m[3];
      const x = Number(attr(a, 'x') ?? 0) + ox, y = Number(attr(a, 'y') ?? 0) + oy;
      const w = Number(attr(a, 'width')), h = Number(attr(a, 'height'));
      const fill = attr(a, 'fill') ?? '#000';
      const stroke = attr(a, 'stroke');
      if (lum(fill) >= 0) fillRect(x, y, w, h, lum(fill));
      if (stroke) strokeRect(x, y, w, h, Number(attr(a, 'stroke-width') ?? 0.3), lum(stroke));
      continue;
    }
    if (m[4] !== undefined) {
      const a = m[4];
      const cx = Number(attr(a, 'cx')) + ox, cy = Number(attr(a, 'cy')) + oy, r = Number(attr(a, 'r'));
      const fill = attr(a, 'fill') ?? '#000';
      if (lum(fill) >= 0) circle(cx, cy, r, lum(fill), 0);
      const stroke = attr(a, 'stroke');
      if (stroke) circle(cx, cy, r, lum(stroke), Number(attr(a, 'stroke-width') ?? 0.3));
      continue;
    }
    if (m[5] !== undefined) {
      const a = m[5];
      const d = attr(a, 'd') ?? '';
      const fill = attr(a, 'fill') ?? '#000';
      if (lum(fill) < 0) continue; // stroked paths (the cut line) are skipped: the cut removes them
      const v = lum(fill);
      // our QR path: M x y h a v b h -a z
      const sq = /M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-?[\d.]+z/g;
      let s: RegExpExecArray | null;
      while ((s = sq.exec(d))) fillRect(Number(s[1]) + ox, Number(s[2]) + oy, Number(s[3]), Number(s[4]), v);
    }
  }
  return { width, height, data, pxPerMm };
}

/** Printed luminance sampler for one half (frame mm), from the sheet bitmap. */
export function inkFromBitmap(b: Bitmap, originX: number, originY: number): (x: number, y: number) => number {
  return (x, y) => {
    const px = Math.floor((x + originX) * b.pxPerMm), py = Math.floor((y + originY) * b.pxPerMm);
    if (px < 0 || py < 0 || px >= b.width || py >= b.height) return 1;
    return b.data[py * b.width + px];
  };
}
