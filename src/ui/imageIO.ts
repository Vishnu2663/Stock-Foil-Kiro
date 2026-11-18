// Browser image helpers: files and video frames to RGBA, SVG to canvas, PDF and printing.
import type { RGBAImage } from '../vision/image';
import { makePdf, type PdfPage } from '../render/pdf';
import type { Bitmap } from '../render/rasterSvg';

export async function fileToImage(file: Blob, maxDim = 1800): Promise<RGBAImage> {
  let w = 0, h = 0;
  let source: CanvasImageSource;
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(file);
    w = bmp.width; h = bmp.height; source = bmp;
  } else {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read the photo')); img.src = url; });
    w = img.naturalWidth; h = img.naturalHeight; source = img;
    URL.revokeObjectURL(url);
  }
  const s = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * s), ch = Math.round(h * s);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch);
  return { width: cw, height: ch, data: d.data };
}

let frameCanvas: HTMLCanvasElement | null = null;
export function videoFrame(video: HTMLVideoElement, maxDim = 960): { img: RGBAImage; scale: number } | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * s), ch = Math.round(h * s);
  frameCanvas ??= document.createElement('canvas');
  frameCanvas.width = cw; frameCanvas.height = ch;
  const g = frameCanvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(video, 0, 0, cw, ch);
  return { img: { width: cw, height: ch, data: g.getImageData(0, 0, cw, ch).data }, scale: s };
}

export function imageToDataURL(img: RGBAImage, maxDim = 480): string {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  if (Math.max(img.width, img.height) <= maxDim) return c.toDataURL('image/jpeg', 0.85);
  const s = maxDim / Math.max(img.width, img.height);
  const d = document.createElement('canvas');
  d.width = Math.round(img.width * s); d.height = Math.round(img.height * s);
  d.getContext('2d')!.drawImage(c, 0, 0, d.width, d.height);
  return d.toDataURL('image/jpeg', 0.85);
}

export async function svgToCanvas(svg: string, pxPerMm: number): Promise<HTMLCanvasElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not render the sheet')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(210 * pxPerMm); c.height = Math.round(297 * pxPerMm);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function sheetBitmap(svg: string, pxPerMm = 6): Promise<Bitmap> {
  const c = await svgToCanvas(svg, pxPerMm);
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const data = new Float32Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  return { width: c.width, height: c.height, data, pxPerMm };
}

export async function sheetsToPdf(svgs: string[]): Promise<Blob> {
  const pages: PdfPage[] = [];
  for (const svg of svgs) {
    const c = await svgToCanvas(svg, 7.874); // 200 dpi
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('JPEG failed'))), 'image/jpeg', 0.92));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height });
  }
  const bytes = makePdf(pages);
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
}

/** Print HTML (sheets or a slip) at 100%: the print CSS hides the app chrome. */
export function printHTML(html: string, kind: 'sheet' | 'slip' = 'sheet') {
  let area = document.getElementById('print-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'print-area';
    document.body.appendChild(area);
  }
  area.className = 'print-' + kind;
  area.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    area!.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
  setTimeout(done, 60000);
}
