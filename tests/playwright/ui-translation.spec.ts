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
    const ui = await page.evaluate(async lang => (await import(`/js/i18n/locales/ui-${lang}.js`)).ui as Record<string, string>, locale);
    const label = 'Biology Scores';
    test.skip(!ui[label], `catalogue has no ${label}`);
    await expect(page.getByText(ui[label]!, { exact: true }).first()).toBeVisible();
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
