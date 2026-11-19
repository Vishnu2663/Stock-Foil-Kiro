// Route table and hash parsing (pure).
export type RouteId =
  | 'home' | 'issue' | 'scan' | 'members' | 'crew' | 'story' | 'history' | 'ledger' | 'income'
  | 'punch' | 'demo' | 'lab' | 'calibrate' | 'about' | 'settings';

export type IconName =
  | 'lock' | 'receipt' | 'sparkle' | 'help'
  | 'home' | 'card' | 'users' | 'scan' | 'crew' | 'flame' | 'clock' | 'chain' | 'certificate' | 'punch'
  | 'play' | 'flask' | 'sliders' | 'shield' | 'gear' | 'more' | 'chevron' | 'down' | 'close' | 'torch'
  | 'camera' | 'image' | 'print' | 'pdf' | 'speaker' | 'check' | 'x' | 'plus' | 'trash' | 'edit' | 'download' | 'upload';

export interface RouteDef { id: RouteId; title: string; hint?: string; icon: IconName; group: 'main' | 'records' | 'more' | 'settings' }

export const ROUTES: RouteDef[] = [
  { id: 'home', title: 'Home', icon: 'home', group: 'main' },
  { id: 'issue', title: 'New card', icon: 'card', group: 'main' },
  { id: 'members', title: 'Members', icon: 'users', group: 'main' },
  { id: 'scan', title: 'Payday scan', icon: 'scan', group: 'main' },
  { id: 'crew', title: 'Crew', icon: 'crew', group: 'main' },
  { id: 'story', title: 'Story', icon: 'flame', group: 'main' },
  { id: 'history', title: 'History', hint: 'All scans: paid or yet to pay', icon: 'clock', group: 'records' },
  { id: 'ledger', title: 'Ledger', hint: 'Receipts, saved cards, chain check', icon: 'chain', group: 'records' },
  { id: 'income', title: 'Income proof', hint: 'Certificate for a loan or rent', icon: 'certificate', group: 'records' },
  { id: 'punch', title: 'Punch guide', hint: 'How to punch each day', icon: 'punch', group: 'more' },
  { id: 'demo', title: 'Demo', hint: 'The 4 vs 5 days story', icon: 'play', group: 'more' },
  { id: 'lab', title: 'Test lab', hint: 'Simulate, forge, stress-test', icon: 'flask', group: 'more' },
  { id: 'calibrate', title: 'Calibrate', hint: 'Tune to your paper and punch', icon: 'sliders', group: 'more' },
  { id: 'about', title: 'About & security', hint: 'How it is protected, and its limits', icon: 'shield', group: 'more' },
  { id: 'settings', title: 'Settings', icon: 'gear', group: 'settings' },
];

export const ROUTE_IDS = ROUTES.map((r) => r.id);
export const routeDef = (id: RouteId): RouteDef => ROUTES.find((r) => r.id === id)!;

export function parseHash(hash: string): RouteId {
  const seg = String(hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return (ROUTE_IDS as string[]).includes(seg) ? (seg as RouteId) : 'home';
}

export function parseSplash(search: string): number {
  try {
    const v = new URLSearchParams(search).get('splash');
    if (v === null || !/^\d+$/.test(v)) return 1500;
    return Math.min(10000, Number(v));
  } catch {
    return 1500;
  }
}

/** The phone tab bar: Home · New card · Payday scan · Members · More. */
export const TABS: RouteId[] = ['home', 'issue', 'scan', 'members'];

/** Set by Settings → "Scan another": the scan page opens fully reset (halves, overrides, result). */
export const SCAN_RESET = 'sf.scanReset';
