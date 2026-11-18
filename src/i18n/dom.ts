// Runtime DOM translator: a MutationObserver translates text nodes and placeholder, title, aria-label and alt.
// English originals are kept in WeakMaps, so switching languages is lossless.
import { currentPack, currentLangCode, translateWith } from './uiPack';

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = '[data-notranslate],script,style,textarea,pre,code,svg';

const textOrig = new WeakMap<Text, string>();
const textWritten = new WeakMap<Text, string>();
const attrOrig = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();
const untranslated = new Set<string>();

let observer: MutationObserver | null = null;
let root: Element | null = null;

const hasWords = (s: string) => /\p{L}{2,}/u.test(s);

function skipped(el: Element | null): boolean {
  return !!el && !!el.closest(SKIP);
}

function translateCore(s: string): string {
  const lang = currentLangCode();
  if (lang === 'en') return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const core = m[2];
  if (!core || !hasWords(core)) return s;
  const pack = currentPack();
  if (pack.values.has(core)) return s;
  const tr = translateWith(pack, core);
  if (tr === null) {
    untranslated.add(core);
    return s;
  }
  return m[1] + tr + m[3];
}

function doText(n: Text) {
  if (skipped(n.parentElement)) return;
  const cur = n.nodeValue ?? '';
  const written = textWritten.get(n);
  let orig = textOrig.get(n);
  if (orig === undefined || written !== cur) {
    orig = cur;
    textOrig.set(n, cur);
  }
  const next = translateCore(orig);
  if (next !== cur) {
    textWritten.set(n, next);
    n.nodeValue = next;
  } else textWritten.set(n, cur);
}

function doAttrs(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a) ?? '';
    let om = attrOrig.get(el);
    let wm = attrWritten.get(el);
    if (!om) { om = new Map(); attrOrig.set(el, om); }
    if (!wm) { wm = new Map(); attrWritten.set(el, wm); }
    if (!om.has(a) || wm.get(a) !== cur) om.set(a, cur);
    const next = translateCore(om.get(a)!);
    wm.set(a, next);
    if (next !== cur) el.setAttribute(a, next);
  }
}

function walk(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) { doText(node as Text); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (skipped(el)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

export function translateAll() {
  if (root) walk(root);
}

export function startTranslator(el: Element = document.body) {
  root = el;
  observer?.disconnect();
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(el);
  (window as unknown as { __sfUntranslated: () => string[] }).__sfUntranslated = () => [...untranslated].sort();
}

export function resetUntranslated() {
  untranslated.clear();
}
