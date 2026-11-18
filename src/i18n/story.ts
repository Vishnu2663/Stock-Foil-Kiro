// Story packs (§6.8). English is the source; other languages live in ./story/<lang>.ts.
// Translations are AI-drafted, native review recommended.
import { STORY_PACKS } from './story/packs';

export interface Chapter { title: string; short: string; text: string }

export const STORY_EN: Chapter[] = [
  {
    title: '1834 · The fire', short: 'The fire',
    text: "For about seven hundred years, England's Exchequer kept its accounts on tally sticks.\n\nIn October 1834, the old sticks were burned in the furnaces under the House of Lords. The chimneys caught fire, and the Houses of Parliament burned down.",
  },
  {
    title: 'Why a stick? It was split.', short: 'The split',
    text: 'A tally stick was a notched hazel stick, split lengthwise. The creditor kept one half, the stock. The debtor kept the other half, the foil.\n\nA cheat would have to match wood grain that nobody can copy.',
  },
  {
    title: 'It comes back from the dead', short: 'Resurrection',
    text: 'Millions of people who are paid daily in cash still get no record. Stock and Foil is a paper card, cut in two along a one-of-a-kind wavy line.\n\nThe worker keeps the stock. The employer keeps the foil. Both are punched together every day. The worker needs no phone, and does not need to read.',
  },
  {
    title: 'The claim', short: 'The claim',
    text: "It is payday. The contractor says Meena worked four days. Meena's half has five holes.\n\nThe phone scans both halves. The pairing code proves they were issued together, and the employer's half has the same five holes. Five days it is.",
  },
  {
    title: 'The sneaky hole', short: 'Extra hole',
    text: 'Someone punches one extra hole into one half only.\n\nThe scanner sees it on one side and not on the other. It is shown as disputed, and it is never paid.',
  },
  {
    title: 'A sloppy cut? No problem.', short: 'Sloppy cut',
    text: 'The scissors slipped, so the wavy edges do not fit perfectly.\n\nBut the secret pairing code inside the two QR codes proves the halves were printed together. The pay is safe.',
  },
  {
    title: 'The forgery that fits perfectly', short: 'The forgery',
    text: 'A forger copies the cut exactly and prints a new employer half with the same card code.\n\nBut the forger cannot know the secret inside the real half. Caught. The forged half burns.',
  },
  {
    title: 'Paid once. Only once.', short: 'Paid',
    text: 'When the money is handed over, the payment goes into a hash-chained ledger on the phone.\n\nScan the card again, and it says: already paid. Change one receipt, and the chain breaks.',
  },
  {
    title: 'Back from the dead', short: 'The end',
    text: 'The tally sticks that burned Parliament have come back from the dead.\n\nFree. Offline. No server. No account. Print a card, cut it, punch it, prove it.',
  },
];

export const STORY: Record<string, Chapter[]> = { en: STORY_EN, ...STORY_PACKS };

export const storyLangs = (): string[] => Object.keys(STORY);

export function storyFor(lang: string): Chapter[] {
  const b = lang.split('-')[0];
  return STORY[b] ?? STORY_EN;
}
