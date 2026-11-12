import { expect, test } from './coverage-fixture.js';

// Fork-only: the DOM translation layer renders the fixed UI in the chosen language.
for (const locale of ['de', 'fr'] as const) {
  test(`UI renders in ${locale} without touching English sessions`, async ({ page }) => {
    await page.addInitScript(value => {
      localStorage.setItem('labcharts-default-emptyTour', 'completed');
      localStorage.setItem('labcharts-default-tour', 'completed');
      localStorage.setItem('getbased-locale', value);
    }, locale);
    await page.goto('/app', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const label = 'Biology Scores';
    const translated = await page.evaluate(async ([lang, text]) => {
      const { ui } = await import(`/js/i18n/locales/ui-${lang}.js`);
      const { textKey } = await import('/js/i18n/dom-translate.js');
      return (ui[textKey(text)] ?? ui[text]) as string | undefined;
    }, [locale, label] as const);
    expect(translated, `catalogue has ${label}`).toBeTruthy();
    await expect(page.getByText(translated!, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  });
}

test('English sessions load no UI catalogue', async ({ page }) => {
  const loaded: string[] = [];
  page.on('request', request => { if (/\/js\/i18n\/(dom-translate|locales\/ui-)/.test(request.url())) loaded.push(request.url()); });
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.getByText('Biology Scores', { exact: true }).first()).toBeVisible();
  expect(loaded).toEqual([]);
});
