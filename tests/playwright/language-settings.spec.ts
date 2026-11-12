import { expect, test } from './coverage-fixture.js';

async function openDisplay(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).closeChatPanel();
    await (await import('/js/settings-loader.js')).openSettingsModal('display');
  });
}

test('language picker stores the choice, reloads and translates the picker', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await openDisplay(page);

  const panel = page.locator('#settings-tab-display');
  const group = panel.getByRole('group', { name: 'Language', exact: true });
  await expect(group).toBeVisible();
  // The picker sits above the Display settings, which stay unchanged.
  await expect(panel.locator('.settings-label').first()).toHaveText('Language');
  await expect(panel.getByRole('group', { name: 'Unit System', exact: true })).toBeVisible();
  await expect(group.locator('[data-locale="en"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(group.locator('[data-locale="de"]')).toHaveText('Deutsch');
  await expect(group.locator('[data-locale="fr"]')).toHaveAttribute('lang', 'fr');

  await Promise.all([page.waitForEvent('load'), group.locator('[data-locale="de"]').click()]);
  expect(await page.evaluate(() => localStorage.getItem('getbased-locale'))).toBe('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');

  await openDisplay(page);
  const german = page.locator('#settings-tab-display').getByRole('group', { name: 'Sprache', exact: true });
  await expect(german).toBeVisible();
  await expect(german.locator('[data-locale="de"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#display-language-help')).toContainText('Gesundheitsdaten bleiben unverändert');
});
