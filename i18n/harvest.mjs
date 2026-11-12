// Harvest the English UI text the app actually renders (fork tooling, not part of the build).
// Opens the app in English with the built-in demo profiles, visits every sidebar view, the
// settings tabs and the profile list, and records visible text plus UI attributes. Numbers
// become {#0}, {#1} … placeholders. Also adds marker names and category labels from the schema.
// Usage (in a built checkout with Playwright): node i18n/harvest.mjs http://127.0.0.1:8011
// Output: i18n/harvested.json
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = process.argv[2] || 'http://127.0.0.1:8011';
const found = new Set();

const collect = page => page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script,style,textarea,code,pre,[contenteditable="true"],.chat-msg.chat-user,.chat-msg.chat-avatar-anchor')) continue;
    out.push(n.nodeValue);
  }
  for (const el of document.querySelectorAll('[title],[placeholder],[aria-label],[alt],[data-tooltip]')) {
    for (const a of ['title', 'placeholder', 'aria-label', 'alt', 'data-tooltip']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
  }
  return out;
});

function add(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 300 || !/[A-Za-z]{2}/.test(s) || /:\/\//.test(s)) return;
  let i = 0;
  // Digits that belong to a name stay (Omega-3, B12, HbA1c, 25-OH, CD4).
  const t = s.replace(/(?<![\p{L}\d][-\u2011]?|[\p{L}])[+\-−]?\d[\d.,]*(?![\p{L}\d]|-[\p{L}])/gu, () => `{#${i++}}`);
  // Mostly-number text (dates, values with units) is not UI wording.
  if ((t.replace(/\{#\d+\}/g, '').match(/[A-Za-z]/g) || []).length < 3) return;
  found.add(t);
}

async function settle(page, ms = 700) { await page.waitForTimeout(ms); }

const browser = await chromium.launch();
for (const demo of ['Alex', 'Sarah']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto(`${base}/app`, { waitUntil: 'load' });
  await settle(page, 1500);
  const consent = page.locator('[role=dialog] input[type=checkbox]').first();
  if (await consent.count()) { await consent.check(); await page.locator('[role=dialog] button').last().click(); await settle(page); }
  (await collect(page)).forEach(add);
  const card = page.getByText(new RegExp(`^${demo}, \\d+`)).first();
  if (await card.count()) { await card.click(); await settle(page, 4000); }
  (await collect(page)).forEach(add);

  const navCount = await page.locator('.nav-item[data-nav-action]').count();
  for (let i = 0; i < navCount; i++) {
    const item = page.locator('.nav-item[data-nav-action]').nth(i);
    if (!(await item.isVisible())) continue;
    await item.click().catch(() => {});
    await settle(page, 1500);
    (await collect(page)).forEach(add);
    // Open the first marker detail on lab views.
    const marker = page.locator('[data-marker-key], .marker-card').first();
    if (i < 3 && await marker.count() && await marker.isVisible()) {
      await marker.click().catch(() => {}); await settle(page, 1000);
      (await collect(page)).forEach(add);
      await page.keyboard.press('Escape'); await settle(page, 300);
    }
  }

  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); }).catch(() => {});
  await settle(page, 1000);
  const tabs = await page.locator('[data-settings-tab]').count();
  for (let i = 0; i < tabs; i++) {
    await page.locator('[data-settings-tab]').nth(i).click().catch(() => {});
    await settle(page, 900);
    (await collect(page)).forEach(add);
  }
  await page.keyboard.press('Escape'); await settle(page, 300);

  const clients = page.locator('[aria-label="Manage clients"]').first();
  if (await clients.count()) { await clients.click(); await settle(page, 800); (await collect(page)).forEach(add); await page.keyboard.press('Escape'); }

  if (demo === 'Alex') {
    const schema = await page.evaluate(async () => {
      const s = await import('/js/schema.js');
      const out = [];
      for (const def of Object.values(s.MARKER_SCHEMA)) {
        if (def.label) out.push(def.label);
        for (const m of Object.values(def.markers || {})) if (m.name) out.push(m.name);
      }
      return out;
    }).catch(() => []);
    schema.forEach(add);
  }
  await page.close();
}
await browser.close();

const out = [...found].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(path.join(root, 'i18n/harvested.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log('harvested', out.length);
