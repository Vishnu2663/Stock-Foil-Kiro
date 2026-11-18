// Read-aloud with Web Speech (§6.9). The chunking and voice scoring are pure and tested.

export interface Chunk { text: string; pause: number }

export const PAUSE = { paragraph: 650, sentence: 280, comma: 160 };
export const MAX_CHUNK = 170;

function splitLong(s: string): string[] {
  if (s.length <= MAX_CHUNK) return [s];
  const out: string[] = [];
  const parts = s.split(/(?<=[,،،;:])\s+/);
  let cur = '';
  for (const p of parts) {
    if (!cur) cur = p;
    else if ((cur + ' ' + p).length <= MAX_CHUNK) cur += ' ' + p;
    else { out.push(cur); cur = p; }
  }
  if (cur) out.push(cur);
  // still too long: break at spaces
  return out.flatMap((x) => {
    if (x.length <= MAX_CHUNK) return [x];
    const words = x.split(/\s+/);
    const res: string[] = [];
    let c = '';
    for (const w of words) {
      if (!c) c = w;
      else if ((c + ' ' + w).length <= MAX_CHUNK) c += ' ' + w;
      else { res.push(c); c = w; }
    }
    if (c) res.push(c);
    return res.flatMap((r) => (r.length <= MAX_CHUNK ? [r] : r.match(new RegExp(`.{1,${MAX_CHUNK}}`, 'gu')) ?? []));
  });
}

/** Sentence chunks of ≤170 characters with pauses: 650ms paragraph, 280ms sentence, 160ms comma. */
export function chunkText(text: string): Chunk[] {
  const out: Chunk[] = [];
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  paras.forEach((p, pi) => {
    const sentences = p.split(/(?<=[.!?।॥።؟。])\s+/).filter(Boolean);
    sentences.forEach((s, si) => {
      const pieces = splitLong(s);
      pieces.forEach((piece, ki) => {
        const lastPiece = ki === pieces.length - 1;
        const lastSentence = si === sentences.length - 1;
        const pause = !lastPiece ? PAUSE.comma : !lastSentence ? PAUSE.sentence : pi < paras.length - 1 ? PAUSE.paragraph : 0;
        out.push({ text: piece, pause });
      });
    });
  });
  return out;
}

export interface VoiceLike { name: string; lang: string; localService?: boolean; voiceURI?: string; default?: boolean }

const ROBOTIC = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|espeak|robot|novelty|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed)/i;
const NATURAL = /(neural|enhanced|premium|natural)/i;

export const baseLang = (l: string) => l.toLowerCase().split(/[-_]/)[0];

/** Language fallbacks: Marathi falls back to a Hindi voice. */
export const voiceLangs = (lang: string): string[] => (baseLang(lang) === 'mr' ? ['mr', 'hi'] : [baseLang(lang)]);

export function scoreVoice(v: VoiceLike, lang: string): number {
  const want = lang.toLowerCase().replace('_', '-');
  const vl = v.lang.toLowerCase().replace('_', '-');
  let s = 0;
  if (vl === want || baseLang(vl) === want) s += 30;
  else if (baseLang(vl) === baseLang(want)) s += 20;
  if (NATURAL.test(v.name)) s += 40;
  if (/google/i.test(v.name)) s += 25;
  if (/siri/i.test(v.name)) s += 20;
  if (v.localService === false) s += 6;
  if (ROBOTIC.test(v.name)) s -= 60;
  return s;
}

export const isRobotic = (v: VoiceLike) => ROBOTIC.test(v.name);

export function rankVoices<V extends VoiceLike>(voices: V[], lang: string, broken: Set<string> = new Set()): V[] {
  const langs = voiceLangs(lang);
  for (const l of langs) {
    const c = voices.filter((v) => baseLang(v.lang) === l && !broken.has(v.voiceURI ?? v.name));
    if (c.length) return [...c].sort((a, b) => scoreVoice(b, l) - scoreVoice(a, l));
  }
  return [];
}

// ---------------- the speaker (browser only) ----------------

const BROKEN_KEY = 'sf.brokenVoices';
function loadBroken(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BROKEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function saveBroken(s: Set<string>) {
  try { localStorage.setItem(BROKEN_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

export const speechSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function getVoices(): SpeechSynthesisVoice[] {
  try { return speechSupported() ? window.speechSynthesis.getVoices() : []; } catch { return []; }
}

export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const v = getVoices();
    if (v.length) return resolve(v);
    const done = () => resolve(getVoices());
    window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

export interface SpeakOptions {
  lang: string;
  rate?: number;
  voiceURI?: string;
  onChunk?: (i: number, n: number) => void;
  onEnd?: () => void;
}

const live = new Set<SpeechSynthesisUtterance>(); // keep references (Chrome garbage-collects them mid-speech)
const fastEnds = new Map<string, number>();
let session = 0;

export function stopSpeaking() {
  session++;
  try { if (speechSupported()) window.speechSynthesis.cancel(); } catch { /* ignore */ }
  live.clear();
}

export function pickVoice(lang: string, voiceURI?: string): { voice: SpeechSynthesisVoice | null; robotic: boolean } {
  const all = getVoices();
  const broken = loadBroken();
  if (voiceURI) {
    const v = all.find((x) => x.voiceURI === voiceURI && !broken.has(x.voiceURI));
    if (v) return { voice: v, robotic: isRobotic(v) };
  }
  const ranked = rankVoices(all, lang, broken);
  const voice = ranked[0] ?? null;
  return { voice, robotic: !!voice && ranked.every(isRobotic) };
}

/** Speak a text chunk by chunk with pauses, a watchdog and broken-voice detection. */
export function speak(text: string, opts: SpeakOptions): () => void {
  stopSpeaking();
  const my = ++session;
  if (!speechSupported()) { opts.onEnd?.(); return () => undefined; }
  const chunks = chunkText(text);
  const { voice } = pickVoice(opts.lang, opts.voiceURI);
  const rate = opts.rate ?? 0.9;
  let i = 0;
  const next = () => {
    if (my !== session) return;
    if (i >= chunks.length) { opts.onEnd?.(); return; }
    const c = chunks[i];
    opts.onChunk?.(i, chunks.length);
    const u = new SpeechSynthesisUtterance(c.text);
    u.lang = voice?.lang ?? opts.lang;
    if (voice) u.voice = voice;
    u.rate = rate;
    live.add(u);
    const started = Date.now();
    let finished = false;
    const expected = (c.text.length * 55) / rate;
    const watchdog = setTimeout(() => finish(), Math.max(4000, expected * 3 + 2500));
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      live.delete(u);
      const took = Date.now() - started;
      if (voice && c.text.length > 25 && took < c.text.length * 12) {
        const n = (fastEnds.get(voice.voiceURI) ?? 0) + 1;
        fastEnds.set(voice.voiceURI, n);
        if (n >= 2) { const b = loadBroken(); b.add(voice.voiceURI); saveBroken(b); }
      }
      i++;
      setTimeout(next, c.pause);
    }
    u.onend = finish;
    u.onerror = finish;
    try { window.speechSynthesis.speak(u); } catch { finish(); }
  };
  next();
  return stopSpeaking;
}
