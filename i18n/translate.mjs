// Machine-translate i18n/strings.json with a local Ollama model (fork tooling, not part of the build).
// Usage: node i18n/translate.mjs de|fr [--model gemma4:26b] [--host http://192.168.106.2:11434]
// Output: i18n/translations-<lang>.json  { "<English>": "<translation>" }. Existing entries are kept,
// so the run can be resumed and reviewed translations are never overwritten.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lang = process.argv[2];
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const MODEL = arg('--model', 'gemma4:26b');
const HOST = arg('--host', 'http://192.168.106.2:11434');
const BATCH = Number(arg('--batch', 40));
const LANG = { de: 'German', fr: 'French' }[lang];
if (!LANG) throw new Error('Usage: node i18n/translate.mjs de|fr');

const GLOSSARY = {
  de: `Address the user informally with "du". Lab = Labor, lab report = Laborbericht, marker = Marker,
biomarker = Biomarker, reference range = Referenzbereich, optimal range = Optimalbereich, supplement = Nahrungsergänzung,
dashboard = Dashboard, profile = Profil, client = Klient, sync = Synchronisierung, relay = Relay, settings = Einstellungen,
upload = hochladen, import = importieren, export = exportieren, chat = Chat, lens/lenses = Linse/Linsen,
insight = Einblick, trend = Trend, wearable = Wearable, backup = Sicherung.`,
  fr: `Address the user with "vous". Lab = laboratoire / analyses, lab report = compte rendu d'analyses, marker = marqueur,
biomarker = biomarqueur, reference range = intervalle de référence, optimal range = intervalle optimal,
supplement = complément, dashboard = tableau de bord, profile = profil, client = client, sync = synchronisation,
relay = relais, settings = paramètres, upload = téléverser, import = importer, export = exporter, chat = chat,
lens/lenses = lentille/lentilles, insight = aperçu, trend = tendance, wearable = objet connecté, backup = sauvegarde.`,
}[lang];

const PROMPT = items => `You translate the user interface of "getbased", a personal health and blood-work dashboard, from English to ${LANG}.
Rules:
- Translate every item. Return exactly ${items.length} translations in the same order.
- Keep placeholders like {0}, {1} exactly as they are (they may move inside the sentence).
- Keep emojis, symbols (·, →, …, %), numbers, units (mg/dL, mmol/l, µkat/l, nm, lux), code, file names and
  product or brand names (getbased, Ollama, OpenRouter, Claude, Nostr, Cashu, Lightning, Evolu, Withings, Oura …) unchanged.
- Keep short labels short (buttons, menu items, headings). Match the capitalisation style of the language.
- Medical terms must be the standard clinical terms used in ${LANG}-speaking labs.
- ${GLOSSARY}

Items (JSON array):
${JSON.stringify(items)}`;

const schema = { type: 'object', properties: { translations: { type: 'array', items: { type: 'string' } } }, required: ['translations'] };

async function ask(items) {
  const r = await fetch(`${HOST}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, format: schema,
      options: { temperature: 0, num_ctx: 16384 }, messages: [{ role: 'user', content: PROMPT(items) }] }) });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  return JSON.parse((await r.json()).message.content).translations;
}

const placeholders = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
const strings = JSON.parse(fs.readFileSync(path.join(root, 'i18n/strings.json'), 'utf8'));
const outPath = path.join(root, `i18n/translations-${lang}.json`);
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
const todo = strings.filter(s => !(s in out));
console.log(`${LANG}: ${strings.length} strings, ${todo.length} to translate`);

let rejected = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const items = todo.slice(i, i + BATCH);
  let result = null;
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    try {
      const t = await ask(items);
      if (Array.isArray(t) && t.length === items.length) result = t;
    } catch (e) { console.log('retry', i, String(e).slice(0, 80)); }
  }
  if (!result) { console.log('batch failed', i); continue; }
  items.forEach((s, j) => {
    const tr = String(result[j] || '').trim();
    // Reject translations that lost or invented placeholders; they stay English at runtime.
    if (!tr || placeholders(tr) !== placeholders(s)) { rejected++; return; }
    out[s] = tr;
  });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length}`);
}
console.log('done', Object.keys(out).length, 'rejected', rejected);
