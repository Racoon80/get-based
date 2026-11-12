// UI language owner: message lookup, locale choice and locale-aware formatting.
// English is the source language and the fallback for every missing message.
// AI prompts and AI context stay English; only user-facing text goes through here.
import { en, type MessageKey } from './locales/en.js';
import { de } from './locales/de.js';
import { fr } from './locales/fr.js';

export type Locale = 'en' | 'de' | 'fr';
export type { MessageKey };
export type MessageParams = Record<string, string | number>;

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'de', 'fr'];
export const LOCALE_STORAGE_KEY = 'getbased-locale';

// Each language names itself, so the picker stays readable in any UI language.
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', de: 'Deutsch', fr: 'Français' };

// BCP 47 tags used for Intl formatting. English keeps en-US, which is what the
// app printed before translation existed.
const INTL_TAGS: Readonly<Record<Locale, string>> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

const catalogs: Readonly<Record<Locale, Partial<Record<MessageKey, string>>>> = { en, de, fr };

let current: Locale | null = null;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): Locale | null {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

// First supported language from the browser list, e.g. "de-LU" -> "de".
// Not used as the default yet: most of the UI is still English-only, and a
// half-translated first start would be worse than a consistent English one.
export function detectBrowserLocale(languages: readonly string[] = globalThis.navigator?.languages ?? []): Locale | null {
  for (const tag of languages) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}

export function getLocale(): Locale {
  if (!current) current = readStoredLocale() ?? 'en';
  return current;
}

// Saves the choice for this browser. The caller reloads the app, so every
// component renders once in the new language instead of patching live DOM.
export function setLocale(locale: Locale): void {
  if (!isLocale(locale)) throw new Error('Choose English, German or French.');
  globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  current = locale;
  applyDocumentLocale();
}

// Test seam: forget the cached choice so the next read uses storage again.
export function resetLocaleCache(): void {
  current = null;
}

export function applyDocumentLocale(): void {
  const root = globalThis.document?.documentElement;
  if (root) root.lang = getLocale();
}

export function intlLocale(locale: Locale = getLocale()): string {
  return INTL_TAGS[locale];
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match);
}

// Plural forms live under "<key>.one" / "<key>.other" and are picked with
// Intl.PluralRules. Pass the count as params.count.
export function t(key: MessageKey, params?: MessageParams): string {
  const locale = getLocale();
  const message = catalogs[locale][key] ?? en[key] ?? key;
  return interpolate(message, params);
}

export function tPlural(baseKey: string, count: number, params?: MessageParams): string {
  const locale = getLocale();
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  const key = (`${baseKey}.${category}` in en ? `${baseKey}.${category}` : `${baseKey}.other`) as MessageKey;
  return t(key, { count: formatNumber(count), ...params });
}

// Dates use the Intl tag directly at the call site:
// date.toLocaleDateString(intlLocale(), options).
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), options).format(value);
}

// Fork-only: translate the fixed English UI on screen (see dom-translate.ts). The catalogue
// for the chosen language is loaded on demand, so English sessions load nothing extra.
export async function startUiTranslation(): Promise<void> {
  const locale = getLocale();
  if (locale === 'en' || !globalThis.document || typeof MutationObserver === 'undefined') return;
  const [{ createUiTranslator, observeUiTranslation }, catalogue] = await Promise.all([
    import('./dom-translate.js'),
    locale === 'de' ? import('./locales/ui-de.js') : import('./locales/ui-fr.js'),
  ]);
  observeUiTranslation(createUiTranslator(catalogue.ui, { dateLocale: intlLocale(locale) }));
}
