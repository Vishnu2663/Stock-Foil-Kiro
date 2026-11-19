// Who is who, on every screen: the WORKER (gets paid, keeps the STOCK half) has a round ID badge with a
// hard-hat; the EMPLOYER (pays, keeps the FOIL half) has a square company seal with a briefcase. Different
// shapes, so the roles are clear without colour or reading.
import { useApp } from '../ctx';

export type PartyRole = 'worker' | 'employer';

/** A stable hue from a name (FNV-1a), tinted towards sepia so it fits the theme. */
export function partyColor(name: string): { hue: number; fill: string; ink: string; ring: string } {
  let h = 2166136261;
  const s = (name || '?').trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const hue = (h >>> 0) % 360;
  return { hue, fill: `hsl(${hue} 38% 78%)`, ink: `hsl(${hue} 45% 22%)`, ring: `hsl(${hue} 35% 45%)` };
}

export const initials = (name: string): string => {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? [...w[0]].slice(0, 2).join('') : [...w[0]][0] + [...w[w.length - 1]][0]).toUpperCase();
};

/** Labels for a party (pure; translated by the caller's t). */
export function partyText(role: PartyRole, name: string, t: (s: string, ...a: (string | number)[]) => string) {
  const shown = name || (role === 'worker' ? t('the worker') : t('the employer'));
  return role === 'worker'
    ? { label: t('WORKER'), aria: t('Worker: {0}', shown), caption: t('gets paid · keeps STOCK half'), name: shown, owner: t('{0} (worker)', shown) }
    : { label: t('EMPLOYER'), aria: t('Employer: {0}', shown), caption: t('pays · keeps FOIL half'), name: shown, owner: t('{0} (employer)', shown) };
}

export function Avatar({ role, name, size = 40 }: { role: PartyRole; name: string; size?: number }) {
  const { t } = useApp();
  const c = partyColor(name);
  const txt = partyText(role, name, t);
  const ini = initials(name);
  return (
    <svg className={`avatar avatar-${role}`} width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={txt.aria}>
      {role === 'worker' ? (
        <>
          <circle cx="20" cy="20" r="18" fill={c.fill} stroke={c.ring} strokeWidth="2" />
          <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill={c.ink} fontFamily="'Courier Prime','Courier New',monospace">{ini}</text>
          <g transform="translate(25 -1)"><path d="M1 9a7 7 0 0 1 14 0z" fill="#e9b949" stroke="#7a5a1e" strokeWidth="1.2" /><rect x="0" y="8.5" width="16" height="2.6" rx="1" fill="#d9a441" stroke="#7a5a1e" strokeWidth="1" /></g>
        </>
      ) : (
        <>
          <rect x="2" y="2" width="36" height="36" rx="4" fill={c.fill} stroke={c.ring} strokeWidth="2" />
          <rect x="5.5" y="5.5" width="29" height="29" rx="2" fill="none" stroke={c.ring} strokeWidth="1" strokeDasharray="2 1.5" />
          <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill={c.ink} fontFamily="'Courier Prime','Courier New',monospace">{ini}</text>
          <g transform="translate(26 26)"><rect x="0" y="3" width="13" height="9" rx="1.5" fill="#7a4a2a" stroke="#2e2014" strokeWidth="1" /><path d="M4 3V1.5h5V3" fill="none" stroke="#2e2014" strokeWidth="1.2" /></g>
        </>
      )}
    </svg>
  );
}

/** Avatar + name + role label (+ caption). */
export function Party({ role, name, size = 40, caption = false, compact = false }: { role: PartyRole; name: string; size?: number; caption?: boolean; compact?: boolean }) {
  const { t } = useApp();
  const txt = partyText(role, name, t);
  return (
    <span className={`party party-${role}` + (compact ? ' compact' : '')}>
      <Avatar role={role} name={name} size={size} />
      <span className="party-txt">
        <span className="party-role">{txt.label}</span>
        <span className="party-name" data-notranslate>{txt.name}</span>
        {caption && <span className="party-cap">{txt.caption}</span>}
      </span>
    </span>
  );
}
