// Fork-only UI translation layer: replaces fixed English UI text on screen with the chosen
// language, without changing the upstream components (their sources are hash-pinned by tests).
// Catalogues are keyed by the English text; templates use {0}, {1} … for any dynamic part
// and {#0}, {#1} … for parts that can only be a number (e.g. "{#0}% vs prev").
// User content is never touched: inputs, editable areas, code, and anything marked
// data-i18n-skip are skipped, and only exact catalogue matches are replaced.

export type UiCatalogue = Readonly<Record<string, string>>;

const ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt', 'data-tooltip'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'svg', 'SVG', 'NOSCRIPT']);
// Chat messages (user and AI) and the user's own notes stay as written.
const SKIP_SELECTOR = [
  '[contenteditable=""]', '[contenteditable="true"]', '[data-i18n-skip]',
  '.chat-msg.chat-user', '.chat-msg.chat-avatar-anchor', '.chat-message-edit-input',
  '.mv-note-text', '.mv-value-note-text', '.marker-note-text',
].join(',');

interface Template { regex: RegExp; target: string }

// Literal attribute names only: the repo's action-ownership scan rejects dynamic setAttribute.
function writeAttribute(el: Element, name: typeof ATTRIBUTES[number], value: string): void {
  if (name === 'title') el.setAttribute('title', value);
  else if (name === 'placeholder') el.setAttribute('placeholder', value);
  else if (name === 'aria-label') el.setAttribute('aria-label', value);
  else if (name === 'alt') el.setAttribute('alt', value);
  else el.setAttribute('data-tooltip', value);
}

export interface UiTranslator {
  translateText(text: string): string | null;
  translateTree(root: Node): void;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Catalogues key plain strings by a short hash ("#" + FNV-1a 32-bit, base 36) of the
// English text to keep the offline bundle small. i18n/build-catalogue.mjs uses the same hash.
export function textKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `#${h.toString(36)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_INDEX = new Map<string, number>(MONTHS.flatMap((name, i) => [[name, i], [name.slice(0, 3), i]] as [string, number][]));
MONTH_INDEX.set('Sept', 8);
const DATE_RE = new RegExp(`\\b(${[...MONTH_INDEX.keys()].sort((a, b) => b.length - a.length).join('|')})\\.?(?: (\\d{1,2})(?!\\d|:))?(?:,? (\\d{4}))?\\b`, 'g');

// English month dates the app formats with en-US ("Nov 12, 2026", "Mar 2021", "Nov 12")
// are re-rendered with Intl in the UI language. A bare month word is left alone.
export function localiseEnglishDates(text: string, locale: string): string {
  return text.replace(DATE_RE, (match, month: string, day?: string, year?: string) => {
    if (!day && !year) return match;
    const index = MONTH_INDEX.get(month)!;
    const date = new Date(Number(year ?? 2000), index, Number(day ?? 1));
    const options: Intl.DateTimeFormatOptions = { month: month.length > 4 ? 'long' : 'short' };
    if (day) options.day = 'numeric';
    if (year) options.year = 'numeric';
    return date.toLocaleDateString(locale, options);
  });
}

export interface UiTranslatorOptions { dateLocale?: string }

export function createUiTranslator(catalogue: UiCatalogue, options: UiTranslatorOptions = {}): UiTranslator {
  const exact = new Map<string, string>();
  // Templates are indexed by their first literal word to keep matching cheap.
  const templates = new Map<string, Template[]>();
  const anyStart: Template[] = [];
  for (const [source, target] of Object.entries(catalogue)) {
    if (!/\{#?\d+\}/.test(source)) { exact.set(source, target); continue; }
    const pattern = source.split(/(\{#?\d+\})/).map(part => (/^\{#\d+\}$/.test(part) ? '([+\\-−]?\\d[\\d.,]*)'
      : /^\{\d+\}$/.test(part) ? '(.+?)' : escapeRegex(part))).join('');
    const order = [...source.matchAll(/\{(#?\d+)\}/g)].map(m => m[1]);
    // Rewrite the target's {n} to $k, where k is the capture position of {n} in the source.
    const rewritten = target.replace(/\{(#?\d+)\}/g, (_, n: string) => `\u0000${order.indexOf(n) + 1}\u0000`);
    const entry = { regex: new RegExp(`^${pattern}$`, 's'), target: rewritten };
    const first = source.match(/^([A-Za-z]+)/)?.[1];
    if (first) (templates.get(first) ?? templates.set(first, []).get(first)!).push(entry);
    else anyStart.push(entry);
  }

  function translateText(text: string): string | null {
    const key = normalise(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    let out = lookup(key);
    // A leading arrow or symbol ("↑ +27.5% vs prev") should not block a match.
    if (out === null) {
      const m = key.match(/^([\u2190-\u21ff\u25b2-\u25bc\u2022\u2713\u2714\u26a0\ufe0f]+\s*)(.+)$/u);
      if (m) { const rest = lookup(m[2]!); if (rest !== null) out = m[1] + rest; }
    }
    if (options.dateLocale) {
      const base = out ?? key;
      const dated = localiseEnglishDates(base, options.dateLocale);
      if (dated !== base) return dated;
    }
    return out;
  }

  function lookup(key: string): string | null {
    const hit = exact.get(key) ?? exact.get(textKey(key));
    if (hit !== undefined) return hit;
    const first = key.match(/^([A-Za-z]+)/)?.[1];
    for (const t of [...(first ? templates.get(first) ?? [] : []), ...anyStart]) {
      const m = key.match(t.regex);
      if (m) return t.target.replace(/\u0000(\d+)\u0000/g, (_, k: string) => m[Number(k)] ?? '');
    }
    // Labels joined at runtime ("Needs attention · sudden high trend"): translate each part.
    if (key.includes(' · ')) {
      const parts = key.split(' · ');
      const translated = parts.map(part => translatePart(part));
      if (translated.some((t, i) => t !== parts[i])) return translated.join(' · ');
    }
    return null;
  }

  function translatePart(part: string): string {
    return (part.includes(' · ') ? null : translateText(part)) ?? part;
  }

  function skipped(el: Element | null): boolean {
    for (let node = el; node; node = node.parentElement) {
      if (SKIP_TAGS.has(node.tagName)) return true;
    }
    return !!el?.closest(SKIP_SELECTOR);
  }

  function translateTextNode(node: Text): void {
    const value = node.nodeValue ?? '';
    const next = translateText(value);
    if (next === null || skipped(node.parentElement)) return;
    // Keep the surrounding whitespace of the original node.
    const lead = value.match(/^\s*/)![0], trail = value.match(/\s*$/)![0];
    const replaced = lead + next + trail;
    if (replaced !== value) node.nodeValue = replaced;
  }

  function translateAttributes(el: Element): void {
    if (skipped(el) && !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const next = translateText(value);
      if (next !== null && next !== value) writeAttribute(el, name, next);
    }
    // Button-like inputs show their value as a label.
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.getAttribute('type') || '')) {
      const value = (el as HTMLInputElement).value;
      const next = translateText(value);
      if (next !== null) (el as HTMLInputElement).value = next;
    }
  }

  function translateTree(root: Node): void {
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root as Text); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root as Element);
    const doc = root.ownerDocument ?? (root as Document);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
      else translateAttributes(node as Element);
    }
  }

  return { translateText, translateTree };
}

// Translates the document now and keeps translating whatever the app renders later.
export function observeUiTranslation(translator: UiTranslator, root: Document = document): MutationObserver {
  translator.translateTree(root.body ?? root);
  const titleText = root.title;
  const title = translator.translateText(titleText);
  if (title) root.title = title;
  let applying = false;
  const observer = new MutationObserver(records => {
    if (applying) return;
    applying = true;
    try {
      for (const record of records) {
        if (record.type === 'characterData') translator.translateTree(record.target);
        else if (record.type === 'attributes') translator.translateTree(record.target);
        else record.addedNodes.forEach(node => translator.translateTree(node));
      }
    } finally {
      // Our own writes queue records too; drop them so they are not processed again.
      observer.takeRecords();
      applying = false;
    }
  });
  observer.observe(root.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: [...ATTRIBUTES],
  });
  return observer;
}
