import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`preview stays loaded when opened (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/apps', route => route.fulfill({ json: [{ id:'demo', name:'Demo', description:'Test', category:'Test', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel' }] }));
    await page.goto('/');
    const iframe = page.locator('iframe[title="Vorschau Demo"]');
    await expect(iframe.contentFrame().getByRole('heading', { name: 'Hallo aus deiner Demo-App!' })).toBeVisible();
    await iframe.evaluate(element => { element.contentWindow.dkhubTestMarker = 'retained'; });
    await page.getByRole('button', { name:'Demo öffnen' }).click();
    await expect(page.getByRole('button', { name:'Übersicht' })).toBeVisible();
    expect(await iframe.evaluate(element => element.contentWindow.dkhubTestMarker)).toBe('retained');
    const frame = await iframe.boundingBox();
    expect(frame.width).toBeGreaterThan(viewport.width * (viewport.width > 650 ? 0.7 : 0.9));
    expect(frame.height).toBeGreaterThan(viewport.height * 0.6);
    await page.getByRole('button', { name:'Zu Favoriten hinzufügen', exact:true }).click();
    await page.getByRole('button', { name:'Übersicht' }).click();
    await expect(page.getByRole('button', { name:'Demo', exact:true }).first()).toBeVisible();
    expect(await iframe.evaluate(element => element.contentWindow.dkhubTestMarker)).toBe('retained');
  });
}

test('four app windows and shareable routes', async ({ page }) => {
  const apps = Array.from({length: 5}, (_, index) => ({ id:`app${index}`, route:`app${index}`, name:`App ${index}`, description:'Test', category:'Test', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel' }));
  await page.route('**/api/apps', route => route.fulfill({ json: apps }));
  await page.goto('/app0');
  await expect(page.getByRole('button', { name:'App 0 schließen' })).toBeVisible();
  for (let i = 1; i < 4; i++) {
    await page.getByRole('button', { name: /Fenster/ }).click();
    await page.getByRole('button', { name: `App ${i} öffnen` }).click();
    await expect(page.getByRole('button', { name: `App ${i} schließen` })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '+ Fenster (4/4)' })).toBeDisabled();
  await expect(page.locator('.card-open')).toHaveCount(4);
  await page.getByRole('button', { name: 'App 3 schließen' }).click();
  await expect(page.locator('.card-open')).toHaveCount(3);
  await page.getByRole('button', { name:'Übersicht' }).click();
  await page.getByRole('button', { name:'App 1 öffnen' }).click();
  await expect(page).toHaveURL(/\/app1$/);
  await page.reload();
  await expect(page.getByRole('button', { name:'App 1 schließen' })).toBeVisible();
});

test('show configured address and edit an app', async ({ page }) => {
  let app = { id:'demo', route:'demo-app', name:'Demo', description:'Test', category:'Test', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel' };
  await page.route('**/api/apps', route => route.fulfill({ json: [app] }));
  await page.route('**/api/apps/demo', async route => {
    const details = route.request().postDataJSON();
    app = { ...app, ...details };
    await route.fulfill({ json: app });
  });
  await page.goto('/');
  await page.getByRole('button', { name:'Demo öffnen' }).click();
  await page.getByRole('button', { name:'Adresse', exact:true }).click();
  await expect(page.getByRole('textbox', { name:'Demo Adresse' })).toHaveValue('/demo.html');
  await page.getByRole('button', { name:'Bearbeiten', exact:true }).click();
  await page.getByLabel('Webadresse').fill('https://example.com/updated');
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button', { name:'Anwendung speichern' }).click();
  await expect(page.getByRole('textbox', { name:'Demo Adresse' })).toHaveValue('https://example.com/updated');
});
