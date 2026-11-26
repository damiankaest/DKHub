import { test, expect } from '@playwright/test';
import { mockCatalog } from './assistantFixture.js';

// A first visit: no stored tour state.
test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(mockCatalog);

const tour = page => page.getByRole('dialog', { name: /Willkommen|Bibliothek|Dienste|Assistent|Themes/ });
const next = page => page.getByRole('button', { name: 'Weiter', exact: true });
const titles = ['Willkommen bei DKHub', 'Bibliothek und Favoriten', 'Dienste installieren und verwalten', 'DK-Assistent', 'Themes und Einstellungen'];

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 360, height: 640 }]]) {
  test(`first visit walks through five steps and stays finished (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    for (const [index, title] of titles.entries()) {
      await expect(page.getByRole('heading', { name: title })).toBeFocused();
      await expect(tour(page).getByText(`Schritt ${index + 1} von 5`)).toBeVisible();
      // Card and highlighted control stay inside the screen.
      const box = await page.locator('.tour-card').boundingBox();
      await expect.poll(async () => (await page.locator('.tour-card').boundingBox()).y).toBeGreaterThanOrEqual(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      await expect(page.locator('.tour-spot')).toHaveCount(index === 0 ? 0 : 1);
      if (index === 1) {
        await page.getByRole('button', { name: 'Zurück', exact: true }).click();
        await expect(page.getByRole('heading', { name: titles[0] })).toBeVisible();
        await next(page).click();
      }
      if (index < 4) await next(page).click();
    }
    await page.getByRole('button', { name: 'Abschließen' }).click();
    await expect(tour(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('dkhub-tour'))).toBe('done');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'App-Bibliothek' })).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });
}

test('keyboard: focus stays inside, Escape skips, settings restart it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: titles[0] })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !document.activeElement.closest('.shell > :not(dialog.tour)') || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('dkhub-tour'))).toBe('done');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Tour starten' }).press('Enter');
  await expect(page.getByRole('heading', { name: titles[0] })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'App-Bibliothek' })).toBeAttached();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(tour(page)).toHaveCount(0);
});

test('a deep-linked app is never covered by the tour', async ({ page }) => {
  await page.goto('/coach');
  await expect(page.getByRole('button', { name: 'DKCoach schließen' })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
});

test('start page offers the last app, search can be cleared, empty and loading states help', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dkhub-tour', 'done'));
  await page.goto('/');
  await expect(page.locator('.spotlight')).toHaveCount(0);
  await page.getByRole('button', { name: 'DKGarden öffnen' }).click();
  await page.getByRole('button', { name: 'Übersicht' }).click();
  const spotlight = page.getByRole('region', { name: 'Weitermachen' });
  await expect(spotlight.getByText('DKGarden', { exact: true })).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Anwendungen suchen' });
  await search.fill('Coach');
  await expect(spotlight).toHaveCount(0);
  await page.getByRole('button', { name: 'Suche löschen' }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.fill('x');
  await search.press('Escape');
  await expect(search).toHaveValue('');

  await spotlight.getByRole('button', { name: 'Weiter mit DKGarden' }).press('Enter');
  await expect(page.getByRole('button', { name: 'DKGarden schließen' })).toBeVisible();

  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Erste Kachel anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Anwendung hinzufügen' })).toBeVisible();
});

test('reduced motion keeps cards still and removes animations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dkhub-tour', 'done'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('.card').first();
  await card.hover();
  expect(await card.evaluate(el => [getComputedStyle(el).transform, getComputedStyle(document.querySelector('.catalog')).animationName])).toEqual(['none', 'none']);
});

test('TV mode keeps the focused card of a row completely visible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dkhub-tour', 'done'));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.route('**/api/apps', route => route.fulfill({ json: [0, 1, 2].map(i => ({ id: 'a' + i, route: 'a' + i, name: 'App ' + i, category: 'Medien', description: '', icon: 'spark', color: 'sage', url: 'https://example.com', mode: 'external', label: 'Webseite' })) }));
  await page.reload();
  await page.getByRole('button', { name: 'TV-Modus', exact: true }).click();
  await expect(page.getByRole('link', { name: 'App 0 öffnen (neuer Tab)' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('link', { name: 'App 2 öffnen (neuer Tab)' })).toBeFocused();
  const card = await page.locator('.card').nth(2).boundingBox();
  expect(card.x + card.width).toBeLessThanOrEqual(1280);
});

test('an app grows out of its card and shrinks back without reloading', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dkhub-tour', 'done');
    // Record which element carries the zoom name before and after each change of view.
    const start = document.startViewTransition?.bind(document);
    window.zooms = [];
    if (!start) return;
    const named = () => [...document.querySelectorAll('*')].find(el => el.style?.viewTransitionName === 'app-zoom')?.className || null;
    document.startViewTransition = update => {
      const entry = { from: named() };
      window.zooms.push(entry);
      return start(() => { update(); queueMicrotask(() => { entry.to = named(); }); });
    };
  });
  await page.goto('/');
  const frame = page.locator('iframe[title="Vorschau DKCoach"]');
  await expect(frame.contentFrame().getByRole('heading', { name: 'Hallo aus deiner Demo-App!' })).toBeVisible();
  await frame.evaluate(element => { element.contentWindow.marker = 'same'; });
  await page.getByRole('button', { name: 'DKCoach öffnen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DKCoach schließen' })).toBeVisible();
  await page.getByRole('button', { name: 'Übersicht' }).click();
  await expect(page.getByRole('heading', { name: 'App-Bibliothek' })).toBeVisible();
  expect(await frame.evaluate(element => element.contentWindow.marker)).toBe('same');
  const zooms = await page.evaluate(() => window.zooms);
  expect(zooms).toEqual([{ from: 'card-preview', to: 'card-preview' }, { from: 'card-preview', to: 'card-preview' }]);
  // No name stays behind, so the next transition starts clean.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('*')].filter(el => el.style?.viewTransitionName).length)).toBe(0);
});
