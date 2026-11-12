// Cross-check the machine translations with an independent engine (fork tooling).
// LibreTranslate translates each German/French string back to English; a back-translation
// far from the original English flags the string for human review.
// Usage: node i18n/crosscheck.mjs de|fr [--host http://192.168.106.10:5000]
// Output: i18n/crosscheck-<lang>.json (all scores) and i18n/crosscheck-<lang>.html (review list).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lang = process.argv[2];
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const HOST = arg('--host', 'http://192.168.106.10:5000');
const BATCH = 50;
if (!['de', 'fr'].includes(lang)) throw new Error('Usage: node i18n/crosscheck.mjs de|fr');

const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const strings = JSON.parse(fs.readFileSync(path.join(root, 'i18n/strings.json'), 'utf8'));
const machine = read(path.join(root, `i18n/translations-${lang}.json`));
const reviewed = read(path.join(root, `i18n/overrides-${lang}.json`));
const outJson = path.join(root, `i18n/crosscheck-${lang}.json`);
const done = read(outJson);

// Placeholders become neutral tokens so the engine leaves them alone.
const mask = s => s.replace(/\{#?\d+\}/g, 'X');
const words = s => new Set(mask(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && w !== 'the' && w !== 'and'));
function similarity(a, b) {
  const x = words(a), y = words(b);
  if (!x.size && !y.size) return 1;
  let common = 0;
  for (const w of x) if (y.has(w) || [...y].some(v => v.startsWith(w.slice(0, 5)) && w.length > 5)) common++;
  return common / Math.max(x.size, y.size);
}

async function back(texts) {
  const r = await fetch(`${HOST}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts.map(mask), source: lang, target: 'en', format: 'text' }) });
  if (!r.ok) throw new Error(`libretranslate ${r.status}`);
  return (await r.json()).translatedText;
}

// Only strings with a translation that differs from English; reviewed terms are skipped.
const todo = strings.filter(en => machine[en] && machine[en] !== en && !reviewed[en] && !(en in done));
console.log(`${lang}: ${todo.length} to check`);
for (let i = 0; i < todo.length; i += BATCH) {
  const items = todo.slice(i, i + BATCH);
  try {
    const result = await back(items.map(en => machine[en]));
    items.forEach((en, j) => { done[en] = { tr: machine[en], back: result[j], score: Number(similarity(en, result[j]).toFixed(2)) }; });
  } catch (e) { console.log('batch failed', i, String(e).slice(0, 80)); }
  fs.writeFileSync(outJson, `${JSON.stringify(done, null, 1)}\n`);
  if ((i / BATCH) % 20 === 0) console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length}`);
}

// Judge: for flagged strings, ask the local Ollama whether the translation keeps the meaning,
// given the independent back-translation. Synonyms pass; real errors get a suggestion.
const OLLAMA = arg('--ollama', 'http://192.168.106.2:11434');
const LANG = { de: 'German', fr: 'French' }[lang];
const isFlagged = (en, r) => r.score < (words(en).size <= 2 ? 0.01 : 0.34);
const judgeSchema = { type: 'object', properties: { results: { type: 'array', items: { type: 'object',
  properties: { ok: { type: 'boolean' }, fix: { type: 'string' }, why: { type: 'string' } }, required: ['ok', 'fix', 'why'] } } }, required: ['results'] };
async function judge(batch) {
  const prompt = `You review ${LANG} UI translations of a health dashboard. For each item you get the English source, the ${LANG}
translation, and an independent machine back-translation to English. Decide if the ${LANG} translation is correct and natural
for a UI. Synonyms and different wording are fine (ok=true). Mark ok=false only for wrong meaning, wrong medical term,
typos, wrong or broken placeholders ({0}, {#0} must stay), or untranslated/garbled text. If ok=false, give the corrected
${LANG} text in "fix" (else repeat the translation) and a short reason in English in "why". Return exactly ${batch.length} results in order.
Items: ${JSON.stringify(batch.map(([en, r]) => ({ en, tr: r.tr, back: r.back })))}`;
  const res = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gemma4:26b', stream: false, think: false, format: judgeSchema,
      options: { temperature: 0, num_ctx: 16384 }, messages: [{ role: 'user', content: prompt }] }) });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  return JSON.parse((await res.json()).message.content).results;
}
const toJudge = Object.entries(done).filter(([en, r]) => isFlagged(en, r) && !r.verdict);
console.log('judging', toJudge.length);
for (let i = 0; i < toJudge.length; i += 20) {
  const batch = toJudge.slice(i, i + 20);
  try {
    const results = await judge(batch);
    if (results.length === batch.length) batch.forEach(([en], j) => { done[en].verdict = results[j]; });
  } catch (e) { console.log('judge failed', i, String(e).slice(0, 80)); }
  fs.writeFileSync(outJson, `${JSON.stringify(done, null, 1)}\n`);
}

// Review page: lowest scores first; very short labels are noisy, so they need a lower score.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const flagged = Object.entries(done)
  .filter(([en, r]) => !reviewed[en] && isFlagged(en, r) && r.verdict && !r.verdict.ok && !/\p{L}\{\d+\}/u.test(en))
  .sort((a, b) => a[1].score - b[1].score);
const html = `<!doctype html><meta charset="utf-8"><title>Cross-check ${lang}</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top}th{background:#eee;text-align:left}td.s{text-align:right}</style>
<h1>Cross-check ${lang.toUpperCase()} — ${flagged.length} of ${Object.keys(done).length} strings to review</h1>
<p>Back-translation by LibreTranslate far from the original English, and the review step found a real problem. Fix a string by adding it to <code>i18n/overrides-${lang}.json</code>.</p>
<table><tr><th>English (source)</th><th>Ollama ${lang}</th><th>LibreTranslate back to English</th><th>Suggested fix</th><th>Why</th></tr>
${flagged.map(([en, r]) => `<tr><td>${esc(en)}</td><td>${esc(r.tr)}</td><td>${esc(r.back)}</td><td>${esc(r.verdict.fix)}</td><td>${esc(r.verdict.why)}</td></tr>`).join('\n')}
</table>`;
fs.writeFileSync(path.join(root, `i18n/crosscheck-${lang}.html`), html);
console.log('checked', Object.keys(done).length, 'flagged', flagged.length);
