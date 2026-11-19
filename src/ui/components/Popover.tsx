// One floating panel for every menu and dropdown: a glass popover on desktop and a bottom sheet with a drag
// handle on phones. Closes on outside tap, Esc, route change and page scroll; only one is open at a time;
// stays inside the viewport. Items are any [role=menuitem] or [role=option] inside; one highlight slides
// between them. Animations are CSS only and switch off with reduced motion.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

let closeOpen: (() => void) | null = null;
/** Close whichever popover or sheet is open (used on route change, too). */
export const closeAllPopovers = () => { const c = closeOpen; closeOpen = null; c?.(); };

const PHONE = '(max-width: 1000px)';
export function useIsPhone(): boolean {
  const q = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  const [v, setV] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setV(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** True while the viewport is at least `px` wide (false when px is not given). */
function useMinWidth(px?: number): boolean {
  const q = px && typeof matchMedia === 'function' ? matchMedia(`(min-width: ${px}px)`) : null;
  const [v, setV] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setV(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, [px]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

const ITEMS = '[role="menuitem"]:not([aria-disabled="true"]),[role="option"]:not([aria-disabled="true"])';

/** Arrow keys, Home/End and type-ahead over the items of a container. Returns the handler. */
export function rovingKeys(box: HTMLElement | null, e: KeyboardEvent, onEsc: () => void): boolean {
  if (!box) return false;
  const items = [...box.querySelectorAll<HTMLElement>(ITEMS)];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const go = (k: number) => { const n = items.length; if (n) items[((k % n) + n) % n].focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(-1);
  else if (e.key === 'Escape') onEsc();
  else if (e.key.length === 1 && /\S/.test(e.key)) {
    const c = e.key.toLowerCase();
    const order = [...items.slice(i + 1), ...items.slice(0, i + 1)];
    const hit = order.find((x) => (x.textContent ?? '').trim().toLowerCase().startsWith(c));
    if (!hit) return false;
    hit.focus();
  } else return false;
  e.preventDefault();
  return true;
}

/** Register as the only open panel, and close on route change. */
function useSingle(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const mine = () => ref.current();
    if (closeOpen && closeOpen !== mine) closeAllPopovers();
    closeOpen = mine;
    const hash = () => ref.current();
    window.addEventListener('hashchange', hash);
    return () => { if (closeOpen === mine) closeOpen = null; window.removeEventListener('hashchange', hash); };
  }, [open]);
}

/** The sliding hover highlight: one element that moves to the hovered or focused item. */
function useSlider(box: RefObject<HTMLElement | null>, open: boolean) {
  const hl = useRef<HTMLSpanElement>(null);
  const move = useCallback((el: Element | null) => {
    const h = hl.current, b = box.current;
    if (!h || !b) return;
    const it = el?.closest?.(ITEMS) as HTMLElement | null;
    if (!it || !b.contains(it)) { h.style.opacity = '0'; return; }
    h.style.opacity = '1';
    h.style.transform = `translate(${it.offsetLeft}px, ${it.offsetTop}px)`;
    h.style.width = it.offsetWidth + 'px';
    h.style.height = it.offsetHeight + 'px';
  }, [box]);
  useEffect(() => { if (!open) return; const id = requestAnimationFrame(() => move(box.current?.querySelector('.active, [aria-selected="true"]') ?? null)); return () => cancelAnimationFrame(id); }, [open, move, box]);
  return { hl, move };
}

export interface PopoverProps {
  open: boolean;
  onClose: (refocus?: boolean) => void;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  role?: 'menu' | 'listbox' | 'dialog';
  id?: string;
  className?: string;
  children: ReactNode;
  /** handle keys yourself (a listbox with aria-activedescendant) */
  onKeyDown?: (e: KeyboardEvent) => void;
  /** panel width; defaults to the content */
  width?: number;
  head?: ReactNode;
}

/** Desktop glass panel under its button, with a small arrow, kept inside the viewport. */
export function Popover({ open, onClose, anchor, label, role = 'menu', id, className = '', children, onKeyDown, width, head }: PopoverProps) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; ax: number; up: boolean } | null>(null);
  useSingle(open, () => onClose(false));
  const { hl, move } = useSlider(list, open);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect(), p = box.current;
    if (!a || !p) return;
    const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const x = Math.max(8, Math.min(vw - w - 8, a.left + a.width / 2 - w / 2));
    const up = a.bottom + 10 + h > vh - 8 && a.top - 10 - h > 8;
    const y = up ? a.top - 10 - h : a.bottom + 10;
    setPos({ x, y, ax: Math.max(14, Math.min(w - 14, a.left + a.width / 2 - x)), up });
  }, [anchor]);
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose(false);
    };
    const scroll = (e: Event) => { if (box.current && e.target instanceof Node && box.current.contains(e.target)) return; onClose(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { onClose(true); anchor.current?.focus(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, onClose, anchor, place]);
  if (!open || typeof document === 'undefined') return null;
  const ax = pos ? pos.ax : 0;
  return createPortal(
    <div
      ref={box}
      className={'pop ' + className + (pos?.up ? ' up' : '') + (pos ? ' in' : '')}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, width, ['--ax' as string]: ax + 'px', transformOrigin: `${ax}px ${pos?.up ? '100%' : '0'}` }}
      onKeyDown={(e) => { if (onKeyDown) onKeyDown(e); else rovingKeys(list.current, e, () => { onClose(true); anchor.current?.focus(); }); }}
      onPointerOver={(e) => move(e.target as Element)}
      onFocus={(e) => move(e.target as Element)}
    >
      <span className="pop-arrow" aria-hidden="true" />
      {head}
      <div className="pop-list" ref={list} role={role} id={id} aria-label={label}>
        <span className="pop-hl" ref={hl} aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Phone bottom sheet: drag handle, follows the finger, snaps back or closes; backdrop fades. */
export function Sheet({ open, onClose, label, children, className = '', role = 'dialog', head, onKeyDown, dialogFrom }: {
  open: boolean; onClose: (refocus?: boolean) => void; label: string; children: ReactNode; className?: string; role?: 'dialog' | 'listbox' | 'menu'; head?: ReactNode; onKeyDown?: (e: KeyboardEvent) => void;
  /** from this viewport width (px) up, open as a centred dialog instead of a bottom sheet */
  dialogFrom?: number;
}) {
  const asDialog = useMinWidth(dialogFrom);
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  useSingle(open, () => onClose(false));
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>('input, [role="listbox"][tabindex], a.active, a, button') ?? box.current)?.focus());
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(true); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const set = (dy: number, anim: boolean) => {
    const el = box.current, b = back.current;
    if (!el) return;
    el.style.transition = anim ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
    if (b) b.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, el.offsetHeight)));
  };
  const onDown = (e: React.PointerEvent) => {
    if (asDialog || !(e.target as Element).closest('.grab-zone')) return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; d.dy = Math.max(0, e.clientY - d.y0); set(d.dy, false); };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 90 || v > 0.6) { set(box.current?.offsetHeight ?? 400, true); setTimeout(() => onClose(false), 200); }
    else set(0, true);
  };
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <>
      <button ref={back} className="backdrop" aria-label="Close" tabIndex={-1} onClick={() => onClose(false)} />
      <div
        ref={box}
        className={'sheet ' + className + (asDialog ? ' as-dialog' : '')}
        role={role === 'dialog' ? 'dialog' : undefined}
        aria-modal={role === 'dialog' ? true : undefined}
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => { if (onKeyDown) onKeyDown(e); else rovingKeys(box.current, e, () => onClose(true)); }}
      >
        {asDialog
          ? <button type="button" className="dialog-x" aria-label="Close" onClick={() => onClose(true)}>×</button>
          : <div className="grab-zone"><div className="grab" aria-hidden="true" /></div>}
        {head}
        {role === 'dialog' ? children : <div role={role} aria-label={label}>{children}</div>}
      </div>
    </>,
    document.body,
  );
}
