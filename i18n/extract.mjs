// Collect the static English UI strings of the app (fork tooling, not part of the build).
// Sources: text and title/placeholder/aria-label/alt/label attributes in Svelte components,
// plus markup inside template literals in js/*.ts. Output: i18n/strings.json (sorted, unique).
// Text with expressions in the middle becomes a template with {0}, {1} … placeholders.
// Usage: node i18n/extract.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = [];
for (const dir of ['js', 'js/components']) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    if (/\.svelte$/.test(f) || (/\.ts$/.test(f) && !/\.d\.ts$/.test(f))) files.push(path.join(root, dir, f));
  }
}

const strings = new Set();
const decode = s => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&rarr;/g, '→')
  .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
function add(raw) {
  const s = decode(raw).replace(/\s+/g, ' ').trim();
  if (/^[,;:)(\]\[.'"]/.test(s) || /'[\w.-]+':/.test(s) || /\b(as|_get\w*|Promise|undefined|null)\b\W*$/.test(s)) return;
  if (s.length < 2 || s.length > 400) return;
  if (!/[A-Za-z]{2}/.test(s)) return;                 // needs words
  if (/[$`;=]|=>|\bfunction\b|\bconst\b/.test(s.replace(/\{\d+\}/g, ''))) return; // code, not text
  if (/[{}]/.test(s.replace(/\{\d+\}/g, ''))) return;
  if (!/[A-Za-z]{2}/.test(s.replace(/\{\d+\}/g, ''))) return;
  if (/^[a-z0-9_.:/-]+$/.test(s)) return;             // ids, classes, keys, paths
  if (/^(https?:|mailto:|#|\/)/.test(s)) return;
  strings.add(s);
}

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const svelte = file.endsWith('.svelte');
  if (svelte) src = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  // Only look at markup: whole Svelte templates, or HTML inside template literals in .ts.
  const chunks = svelte ? [src] : [...src.matchAll(/`([^`]*<[a-z][^`]*)`/g)].map(m => m[1]);
  for (const chunk of chunks) {
    for (const m of chunk.matchAll(/>([^<>]+)</g)) {
      // Replace {expressions} / ${expressions} with numbered placeholders.
      let i = 0;
      const text = m[1].replace(/\$?\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${i++}}`);
      if (/^\s*(\{\d+\}\s*)+$/.test(text)) continue;  // only expressions
      add(text);
    }
    for (const m of chunk.matchAll(/\b(?:title|placeholder|aria-label|alt|label|data-tooltip)="([^"{}$]+)"/g)) add(m[1]);
  }
}

// User-facing string literals in TypeScript: UI properties, notifications and errors.
const PROP = '(?:title|label|description|text|action|heading|subtitle|placeholder|hint|tooltip|ariaLabel|emptyText|emptyLabel|message|caption|summary|buttonLabel|actionLabel|confirmLabel|cancelLabel|helper|help|detail|note|status|statusText|badge)';
const LIT = `('(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)`;
const patterns = [
  new RegExp(`\\b${PROP}\\s*:\\s*${LIT}`, 'g'),
  new RegExp(`\\b(?:showNotification|report|denied|notify|toast|setStatus|alertUser)\\(\\s*${LIT}`, 'g'),
  new RegExp(`\\bnew Error\\(\\s*${LIT}`, 'g'),
  new RegExp(`\\.(?:textContent|innerText|title|placeholder)\\s*=\\s*${LIT}`, 'g'),
  new RegExp(`\\?\\s*${LIT}\\s*:\\s*${LIT}`, 'g'),
];
const unquote = lit => lit.slice(1, -1).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, ' ').replace(/\\u2192/g, '→').replace(/\\u2014/g, '—').replace(/\\u00b7/g, '·').replace(/\\u2026/g, '…');
for (const file of files) {
  if (/changelog-data|marker-schema|test/.test(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      for (const lit of m.slice(1).filter(Boolean)) {
        if (lit.startsWith('`') && /<[a-z]/i.test(lit)) continue;   // markup is handled above
        let i = 0;
        const text = unquote(lit).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${i++}}`);
        if (/^\s*(\{\d+\}\s*)+$/.test(text)) continue;
        // Plain sentences or labels only: starts with a capital, digit, emoji or placeholder.
        if (!/^[\p{Lu}\d{\p{Extended_Pictographic}⚠✓✕←→↻+]/u.test(text.trim())) continue;
        add(text);
      }
    }
  }
}

const out = [...strings].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(path.join(root, 'i18n/strings.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log('strings', out.length, 'from', files.length, 'files');
