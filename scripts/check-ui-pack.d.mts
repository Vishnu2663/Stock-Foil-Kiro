export const LANGS: string[];
export function allStrings(): string[];
export function placeholders(s: string): string;
export function checkPack(lang: string, keys?: string[]): { lang: string; total: number; missing: string[]; broken: string[]; stale: string[] };
