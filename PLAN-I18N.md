# Plan: German and French UI for getbased

Fork: `Racoon80/get-based` (upstream `elkimek/get-based`, AGPL-3.0).
Base: upstream `main` @ `2050237` (v1.3.9, 2026-11-10).
Status: plan only. No code changed yet.

## 1. Starting point

- The app has **no translation layer at all**. Every user-facing string is
  hard-coded in English, and `index.html` has a fixed `lang="en"`.
- The UI is Svelte 5 + SvelteKit (static build). There are ~523 components in
  `js/components/`, and many plain TypeScript modules in `js/` also build HTML
  strings (reports, exports, notifications).
- Rough count of strings to translate:
  - ~2,250 text nodes in components
  - ~720 `title` / `placeholder` / `aria-label` / `label` attributes
  - ~700 notification/toast calls in TypeScript
  - HTML built inside `.ts` modules
  - the marker catalogue (`js/marker-schema/`, 23 category files): names,
    categories and descriptions
  - **Estimate: 4,000–6,000 strings**
- Dates are formatted with a hard-coded `'en-US'` in ~30 places, and
  `toLocaleString()` is used without a locale in ~96 places. German and French
  need a decimal comma and day-month order. This affects how lab values read,
  so it is part of the work, not cosmetic.
- `js/marker-terminology/` holds LOINC/NPU/NCLP codes and a Czech/Slovak
  label hint for PDF import. It has no German or French names yet.
- Upstream is very active (2,530 commits, last one yesterday). A fork that
  touches 500 components will conflict on nearly every upstream merge. This
  is the biggest risk in the whole plan (see §6).

## 2. Goals

1. The whole UI can be switched between **English, Deutsch and Français**.
2. On first start the language follows the browser (`navigator.language`).
   After that it follows a choice in Settings, stored per device.
3. Numbers, dates and units are formatted for the chosen language.
4. Marker names and categories are shown in the chosen language. Search finds
   a marker by its English, German or French name.
5. The AI answers in the chosen language. Prompts stay in English.
6. English stays the source language. A missing translation falls back to
   English and never shows a raw key.

Out of scope for now: Luxembourgish, right-to-left languages, translated
changelog (`js/changelog-data.ts`), and translated marketing pages.

## 3. Technical approach

**Recommendation: a small in-house module instead of a library.**

Upstream runs supply-chain guardrails (`supply-chain:check`, SBOM, pinned
snapshot). A new runtime dependency is harder to get merged upstream than
~150 lines of our own code. Strings also live in plain `.ts` modules, so the
API must work outside Svelte too.

- `js/i18n/index.ts`
  - `t(key, params?)`: look up a string, fill `{name}` placeholders, fall
    back to English.
  - plurals with `Intl.PluralRules`
  - `locale` as a Svelte store/rune plus a plain getter for `.ts` modules
  - `formatNumber`, `formatDate`, `formatDateShort` on top of `Intl`
- Catalogues: `js/i18n/locales/en.json`, `de.json`, `fr.json`
  - flat keys grouped by area, for example `nav.labs`, `clients.import_json`,
    `labs.status.needs_attention`
  - `en.json` is the source of truth. A generated `.d.ts` makes `t()` keys
    type-checked, so a typo fails `npm run typecheck`.
- Language choice: setting key `getbased-locale` in `localStorage`. Set
  `document.documentElement.lang` when it changes.
- Alternative if upstream prefers a library: **Paraglide JS** (inlang). It is
  compile-time, tree-shaken, typed and works with static SvelteKit. Decide
  this together with upstream (§6, step 0).

## 4. Phases

Each phase is one pull request that builds, passes tests, and leaves the app
fully usable in English.

| # | Phase | Content | Size |
|---|---|---|---|
| 0 | Talk to upstream | Issue at `elkimek/get-based`: do they want i18n, library or in-house, key style | – |
| 1 | Foundation | `js/i18n/`, language picker in Settings, `html lang`, replace all `'en-US'` / bare `toLocaleString()` with the i18n formatters, key-parity test | S |
| 2 | Shell | Sidebar, header, Clients dialog, Settings, sync/relay screens, onboarding | M |
| 3 | Labs and dashboard | Lab tables, marker cards, trends, status labels ("Needs attention", "Sudden high trend"), date range buttons, compare dates | M |
| 4 | Marker catalogue | Names and categories of the ~210 markers plus custom-marker UI; `de`/`fr` names in `marker-terminology` so search works in all three languages | M |
| 5 | Import and AI | PDF/JSON import dialogs and messages; add "Answer in {language}" to the chat and insight prompts | S |
| 6 | Everything else | Supplements, Nutrition, Light, Genome, Reports/HTML export, EMF assessment, Tips, Knowledge Base, notifications | L |
| 7 | Guardrail | Extend `scripts/quality-guardrails.mjs` so new hard-coded UI strings fail the check | S |

Work per phase:
1. Move the strings of the area into `en.json` and replace them with `t()`.
   Mostly mechanical. A codemod script can do the simple text nodes.
2. Draft `de.json` and `fr.json` by machine: local Ollama `gemma4:26b`, with
   a glossary of fixed medical terms so the same term is always translated
   the same way.
3. Review by a human. Guy reads DE and FR in the running app. Medical terms
   follow the wording on Luxembourg lab reports (mostly French).
4. Check for layout breaks: German text is ~30 % longer than English.

## 5. Tests

- **Key parity** (vitest): every key in `en.json` exists in `de.json` and
  `fr.json`, with the same placeholders.
- **No raw keys**: Playwright opens the main screens in each language and
  fails if text like `labs.status.` is visible.
- **Formatting**: `1234.5` reads as `1,234.5` (EN), `1.234,5` (DE),
  `1 234,5` (FR). Date order is checked the same way.
- **Overflow**: screenshots of sidebar, header and marker cards in German.
- Existing test suites (`npm test`, Playwright) stay green in English.

## 6. Fork strategy and risks

- **Merge conflicts with upstream** are the main risk. To keep them small:
  - Ask upstream first (phase 0). If they accept i18n, every phase goes
    upstream as a PR, and the fork stays close to `main`.
  - If they decline: keep the fork, and rebase onto upstream in small steps
    (weekly), one phase at a time.
- **Wrong medical translation** can mislead. Marker names and status texts
  get a human review before they reach a release. The AI is never the only
  source of a medical term.
- **Missing translations** after an upstream merge: the English fallback keeps
  the UI usable. The key-parity test lists what is missing.

## 7. Deployment at blood.racoon.lu

The self-hosted build (`Workbench/GetBased/deploy/Dockerfile.app`) currently
fetches upstream at a pinned commit. Once phase 1 is merged in the fork:

- point the build at `https://github.com/Racoon80/get-based` with a pinned
  commit (`GB_REF`)
- keep the existing `patch_parser.mjs` fix or send it upstream as well
- rebuild the `getbased` container on Beast (ask before each deploy)

Because the app is AGPL-3.0 and runs as a network service, the public fork
also fulfils the duty to offer the modified source.

## 8. Next step

Phase 0: open an issue upstream asking whether German/French support is
welcome and which approach they prefer. Then start phase 1 on branch
`i18n-de-fr`.
