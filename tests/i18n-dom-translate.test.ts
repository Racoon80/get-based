// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createUiTranslator, observeUiTranslation, textKey } from '../js/i18n/dom-translate.js';

const catalogue = {
  'Labs': 'Labor',
  'Unit System': 'Einheitensystem',
  'Search markers': 'Marker suchen',
  'Delete period starting {0}': 'Periode ab {0} löschen',
  '{0} of {1} MB used': '{0} von {1} MB belegt',
  'Swap {0} with {1}': '{1} mit {0} tauschen',
};

afterEach(() => { document.body.innerHTML = ''; });

describe('translateText', () => {
  const tr = createUiTranslator(catalogue);
  it('translates exact UI strings, ignoring surrounding and repeated whitespace', () => {
    expect(tr.translateText('Labs')).toBe('Labor');
    expect(tr.translateText('  Unit\n  System ')).toBe('Einheitensystem');
  });
  it('fills templates and allows the translation to reorder placeholders', () => {
    expect(tr.translateText('Delete period starting Mar 3, 2026')).toBe('Periode ab Mar 3, 2026 löschen');
    expect(tr.translateText('12 of 200 MB used')).toBe('12 von 200 MB belegt');
    expect(tr.translateText('Swap A with B')).toBe('B mit A tauschen');
  });
  it('leaves unknown text, numbers and partial matches alone', () => {
    expect(tr.translateText('Labs and more')).toBeNull();
    expect(tr.translateText('42')).toBeNull();
    expect(tr.translateText('')).toBeNull();
  });
});

describe('numeric placeholders and joined labels', () => {
  const tr = createUiTranslator({
    '{#0}% vs prev': '{#0} % par rapport au précédent',
    'Needs attention': 'À surveiller',
    'sudden high trend': 'hausse soudaine',
  });
  it('matches numbers only where the template says {#n}', () => {
    expect(tr.translateText('+27.5% vs prev')).toBe('+27.5 % par rapport au précédent');
    expect(tr.translateText('-3,2% vs prev')).toBe('-3,2 % par rapport au précédent');
    expect(tr.translateText('lots% vs prev')).toBeNull();
  });
  it('translates each part of a label joined with a middle dot', () => {
    expect(tr.translateText('Needs attention · sudden high trend')).toBe('À surveiller · hausse soudaine');
    expect(tr.translateText('Needs attention · Glucose')).toBe('À surveiller · Glucose');
    expect(tr.translateText('Foo · Bar')).toBeNull();
  });
});

describe('hashed catalogue keys', () => {
  it('finds plain strings stored under their short hash', () => {
    const tr = createUiTranslator({ [textKey('Quick Markers')]: 'Schnell-Marker' });
    expect(textKey('Quick Markers')).toMatch(/^#[0-9a-z]+$/);
    expect(tr.translateText('  Quick   Markers ')).toBe('Schnell-Marker');
    expect(tr.translateText('Quick Marker')).toBeNull();
  });
});

describe('translateTree', () => {
  const tr = createUiTranslator(catalogue);
  it('translates text and UI attributes but keeps whitespace', () => {
    document.body.innerHTML = '<nav><a title="Labs"> Labs </a><input placeholder="Search markers" value="Labs"></nav>';
    tr.translateTree(document.body);
    expect(document.querySelector('a')!.textContent).toBe(' Labor ');
    expect(document.querySelector('a')!.getAttribute('title')).toBe('Labor');
    expect(document.querySelector('input')!.getAttribute('placeholder')).toBe('Marker suchen');
    // The value of a text input is user data.
    expect(document.querySelector('input')!.value).toBe('Labs');
  });
  it('never touches user content: editable areas, chat messages, notes and opt-outs', () => {
    document.body.innerHTML = `<div contenteditable="true">Labs</div><textarea>Labs</textarea>
      <div class="chat-msg chat-user">Labs</div><p class="marker-note-text">Labs</p>
      <section data-i18n-skip><span>Labs</span></section><code>Labs</code>`;
    tr.translateTree(document.body);
    expect(document.body.textContent!.match(/Labor/g)).toBeNull();
  });
});

describe('observeUiTranslation', () => {
  it('translates what the app renders later and after it changes text again', async () => {
    document.body.innerHTML = '<h1>Labs</h1><p id="later"></p>';
    const observer = observeUiTranslation(createUiTranslator(catalogue));
    expect(document.querySelector('h1')!.textContent).toBe('Labor');
    const later = document.getElementById('later')!;
    later.textContent = 'Unit System';
    await Promise.resolve();
    expect(later.textContent).toBe('Einheitensystem');
    later.firstChild!.nodeValue = '3 of 9 MB used';
    await Promise.resolve();
    expect(later.textContent).toBe('3 von 9 MB belegt');
    observer.disconnect();
  });
});
