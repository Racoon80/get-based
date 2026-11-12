// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, applyDocumentLocale, detectBrowserLocale, formatNumber,
  getLocale, intlLocale, resetLocaleCache, setLocale, t,
} from '../js/i18n/index.js';
import { en } from '../js/i18n/locales/en.js';
import { de } from '../js/i18n/locales/de.js';
import { fr } from '../js/i18n/locales/fr.js';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

beforeEach(() => { localStorage.clear(); resetLocaleCache(); });
afterEach(() => { localStorage.clear(); resetLocaleCache(); document.documentElement.lang = 'en'; });

describe('catalogues', () => {
  const translations = { de, fr } as const;
  for (const [locale, catalogue] of Object.entries(translations)) {
    it(`${locale} translates every English message`, () => {
      const missing = Object.keys(en).filter(key => !(key in catalogue));
      expect(missing).toEqual([]);
    });
    it(`${locale} has no keys that English lacks`, () => {
      expect(Object.keys(catalogue).filter(key => !(key in en))).toEqual([]);
    });
    it(`${locale} keeps the English placeholders`, () => {
      for (const [key, text] of Object.entries(catalogue)) {
        expect(placeholders(text as string), key).toEqual(placeholders(en[key as keyof typeof en]));
      }
    });
    it(`${locale} has no empty messages`, () => {
      expect(Object.entries(catalogue).filter(([, text]) => !String(text).trim()).map(([key]) => key)).toEqual([]);
    });
  }
});

describe('locale choice', () => {
  it('defaults to English when nothing is stored', () => {
    expect(getLocale()).toBe('en');
    expect(t('settings.language.label')).toBe('Language');
  });

  it('stores the choice and sets the document language', () => {
    setLocale('fr');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    resetLocaleCache();
    expect(getLocale()).toBe('fr');
    expect(t('settings.language.label')).toBe('Langue');
  });

  it('ignores an unsupported stored value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    expect(getLocale()).toBe('en');
  });

  it('rejects an unsupported locale', () => {
    expect(() => setLocale('xx' as never)).toThrow();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('applies the stored language to the document at startup', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    applyDocumentLocale();
    expect(document.documentElement.lang).toBe('de');
  });

  it('detects the first supported browser language', () => {
    expect(detectBrowserLocale(['lb-LU', 'de-LU', 'fr'])).toBe('de');
    expect(detectBrowserLocale(['FR-fr'])).toBe('fr');
    expect(detectBrowserLocale(['lb', 'pt'])).toBeNull();
  });

  it('lists the three supported languages', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['en', 'de', 'fr']);
  });
});

describe('messages', () => {
  it('falls back to English for a message the locale lacks', () => {
    setLocale('de');
    const key = 'settings.language.label';
    const saved = de[key];
    delete (de as Record<string, string>)[key];
    try { expect(t(key)).toBe(en[key]); }
    finally { (de as Record<string, string>)[key] = saved!; }
  });
});

describe('formatting', () => {
  it('maps each locale to an Intl tag; English keeps en-US', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('de')).toBe('de-DE');
    expect(intlLocale('fr')).toBe('fr-FR');
  });

  it('formats numbers with the separators of the chosen language', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5');
    setLocale('de');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    setLocale('fr');
    // French groups with a narrow no-break space.
    expect(formatNumber(1234.5).replace(/\s/g, ' ')).toBe('1 234,5');
  });
});
