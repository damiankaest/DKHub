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
