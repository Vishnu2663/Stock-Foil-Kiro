// The pointer tilt helper (CSS variables, smooth reset on leave, off with reduced motion) and the Select filter.
import { describe, expect, it } from 'vitest';
import { tiltVars, applyTilt, initTilt } from '../src/ui/fx';
import { filterOptions } from '../src/ui/components/Select';

function fakeEl() {
  const props: Record<string, string> = {};
  const cls = new Set<string>();
  const el = {
    dataset: { tilt: '8' } as Record<string, string>,
    style: { setProperty: (k: string, v: string) => { props[k] = v; } },
    classList: { toggle: (c: string, on?: boolean) => { if (on ?? !cls.has(c)) cls.add(c); else cls.delete(c); }, contains: (c: string) => cls.has(c) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    closest: () => el,
    contains: () => false,
  };
  return { el: el as unknown as HTMLElement, props, cls };
}

describe('ui: pointer tilt', () => {
  it('tiltVars: centre is flat; a corner tilts up to max, the light follows and the shadow goes the other way', () => {
    expect(tiltVars({ left: 0, top: 0, width: 200, height: 100 }, 100, 50, 8)).toEqual({ rx: -0, ry: 0, mx: 50, my: 50, sx: -0, sy: 0 });
    const v = tiltVars({ left: 0, top: 0, width: 200, height: 100 }, 200, 0, 8);
    expect(v.ry).toBeCloseTo(4); expect(v.rx).toBeCloseTo(4);
    expect(v.mx).toBe(100); expect(v.my).toBe(0);
    expect(Math.sign(v.sx)).toBe(-Math.sign(v.ry));
  });
  it('applyTilt writes CSS variables and resets them on leave', () => {
    const { el, props, cls } = fakeEl();
    applyTilt(el, tiltVars({ left: 0, top: 0, width: 200, height: 100 }, 150, 25, 8));
    expect(props['--ry']).toBe('2.00deg');
    expect(cls.has('tilting')).toBe(true);
    applyTilt(el, null);
    expect(props['--rx']).toBe('0.00deg'); expect(props['--ry']).toBe('0.00deg'); expect(props['--mx']).toBe('50.0%');
    expect(cls.has('tilting')).toBe(false);
  });
  it('initTilt: one write per frame while moving, reset on pointer out, nothing with reduced motion or touch', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const doc = { addEventListener: (k: string, f: (e: unknown) => void) => { handlers[k] = f; }, removeEventListener: () => undefined } as unknown as Document;
    const bodyCls = new Set<string>();
    const body = { classList: { contains: (c: string) => bodyCls.has(c) } } as unknown as HTMLElement;
    const frames: (() => void)[] = [];
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (f: () => void) => { frames.push(f); return frames.length; };
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => undefined;
    const { el, props } = fakeEl();
    const stop = initTilt(doc, body);
    handlers.pointermove({ pointerType: 'mouse', target: el, clientX: 150, clientY: 25 });
    handlers.pointermove({ pointerType: 'mouse', target: el, clientX: 160, clientY: 25 });
    expect(frames.length).toBe(1); // coalesced
    frames.shift()!();
    expect(props['--ry']).toBe('2.40deg');
    handlers.pointerout({ relatedTarget: null });
    expect(props['--ry']).toBe('0.00deg');
    bodyCls.add('reduced');
    handlers.pointermove({ pointerType: 'mouse', target: el, clientX: 200, clientY: 0 });
    expect(frames.length).toBe(0);
    expect(props['--ry']).toBe('0.00deg');
    bodyCls.delete('reduced');
    handlers.pointermove({ pointerType: 'touch', target: el, clientX: 200, clientY: 0 });
    expect(frames.length).toBe(0);
    stop();
  });
});

describe('ui: Select', () => {
  it('search ignores case and accents and matches the code too', () => {
    const o = [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }];
    expect(filterOptions(o, 'espa').map((x) => x.value)).toEqual(['es']);
    expect(filterOptions(o, 'ESPAÑ').map((x) => x.value)).toEqual(['es']);
    expect(filterOptions(o, 'hi').map((x) => x.value)).toEqual(['hi']);
    expect(filterOptions(o, '').length).toBe(3);
  });
});
