// Amount in words for the pay slip. English only; other languages fall back to digits (null).
// INR uses Indian grouping (thousand, lakh, crore); other currencies use thousand, million, billion.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''));
  return parts.join(' ');
}

/** Whole number in English words (integers ≥ 0). */
export function wordsEn(n: number, indian = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const out: string[] = [];
  if (indian) {
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(`${wordsEn(crore, true)} crore`);
    if (lakh) out.push(`${below1000(lakh)} lakh`);
    if (th) out.push(`${below1000(th)} thousand`);
    if (n) out.push(below1000(n));
  } else {
    for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
      const k = Math.floor(n / v); n %= v;
      if (k) out.push(`${below1000(k)} ${name}`);
    }
    if (n) out.push(below1000(n));
  }
  return out.join(' ');
}

const UNIT: Record<string, [string, string, string, string]> = {
  INR: ['rupee', 'rupees', 'paisa', 'paise'], USD: ['dollar', 'dollars', 'cent', 'cents'], EUR: ['euro', 'euros', 'cent', 'cents'],
  GBP: ['pound', 'pounds', 'penny', 'pence'], KES: ['shilling', 'shillings', 'cent', 'cents'], BDT: ['taka', 'taka', 'poisha', 'poisha'],
};

/** "One thousand nine hundred rupees only"; null when the language has no words yet (show digits). */
export function amountInWords(minor: number, currency: string, lang = 'en'): string | null {
  if (!/^en\b/.test(lang)) return null;
  const m = Math.abs(Math.trunc(minor));
  const major = Math.floor(m / 100), cents = m % 100;
  const u = UNIT[currency] ?? [currency, currency, 'cent', 'cents'];
  let s = `${wordsEn(major, currency === 'INR')} ${major === 1 ? u[0] : u[1]}`;
  if (cents) s += ` and ${wordsEn(cents)} ${cents === 1 ? u[2] : u[3]}`;
  s += ' only';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
