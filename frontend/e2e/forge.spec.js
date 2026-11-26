import { expect, test } from '@playwright/test';
import { defaultTheme } from '../src/themes/palette.js';

const id = 'f'.repeat(32);
const path = '/api/forge/projects/' + id;
const serverPath = 'E:\\Forge-Projekte\\projects\\project-planwerk';
const plan = {
  name: 'Planwerk', sqlite: true, description: 'Projekte planen', audience: 'Entwickler',
  design: 'Schlicht', pages: ['Übersicht'], features: ['Notizen verwalten'],
  data_model: ['Notiz mit Titel'], roadmap: ['Notizen filtern'], assumptions: ['Lokal betrieben'],
};

for (const width of [1360, 360]) {
  test(`plans, edits, generates, retries and opens DKForge at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let generated;
    let buildCalls = 0;
    let checked = 0;
    const record = { id, revision: 1, plan, source: 'manual', generated: false, status: 'draft',
      notice: 'Die KI konnte keinen gültigen Plan liefern. Du kannst den manuellen Entwurf bearbeiten.' };
    await page.route('**/api/**', route => route.fulfill({ status: 404 }));
    await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
    await page.route('**/api/theme', route => route.fulfill({ json: defaultTheme }));
    await page.route('**/api/apps', route => route.fulfill({ json: [] }));
    await page.route('**/api/director/list', route => route.fulfill({ json: [] }));
    await page.route('**/api/forge/projects', route => {
      expect(route.request().postDataJSON()).toEqual({
        name: 'Planwerk', description: 'Projekte planen', features: ['Notizen verwalten'],
        design: 'Schlicht', sqlite: true, use_ai: true,
      });
      return route.fulfill({ status: 201, json: record });
    });
    await page.route('**' + path + '/plan', route => {
      expect(route.request().method()).toBe('PUT');
      const { plan: edited, revision } = route.request().postDataJSON();
      expect(revision).toBe(1);
      expect(edited.audience).toBe('Kleine Projektteams');
      expect(edited.roadmap).toEqual(['Notizen filtern', 'Suche testen']);
      generated = { ...record, revision: 2, plan: edited, generated: true, phase: 'generate',
        path: serverPath, status: 'generated', image: 'dkforge/project-' + id + ':v1' };
      return route.fulfill({ json: { ...generated, generated: false } });
    });
    await page.route('**' + path + '/generate', route => {
      expect(route.request().postDataJSON()).toEqual({ revision: 2 });
      return route.fulfill({ json: generated });
    });
    await page.route('**' + path + '/build', route => {
      buildCalls++;
      return route.fulfill({ status: 202, json: { ...generated, status: 'queued' } });
    });
    await page.route('**' + path + '/status', route => {
      checked++;
      if (checked === 1) return route.fulfill({ json: { ...generated, status: 'running', phase: 'build' } });
      if (buildCalls === 1) return route.fulfill({ json: {
        ...generated, status: 'failed', phase: 'start', error: 'Der Dienst konnte nicht gestartet werden.',
        image_built: true, expected_service_id: 'dkhub-' + id,
      } });
      return route.fulfill({ json: {
        ...generated, status: 'ready', phase: 'catalog', tile_id: 'director-' + id,
        image_built: true, service_id: 'dkhub-' + id, url: 'http://127.0.0.1:25123',
      } });
    });
    await page.goto('/');
    if (width < 500) await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    await page.getByRole('button', { name: 'Dienste', exact: true }).click();
    await page.getByRole('button', { name: 'Neuen eigenen Dienst erstellen' }).click();
    await page.getByLabel('Projektname').fill('Planwerk');
    await page.getByLabel('Beschreibung und Ziel').fill('Projekte planen');
    await page.getByLabel('Gewünschte Funktionen').fill('Notizen verwalten');
    await page.getByLabel('Grobe Designvorstellung').fill('Schlicht');
    await page.getByLabel('SQLite für dauerhafte Daten').check();
    await page.getByLabel('Konfigurierte KI für den Plan verwenden').check();
    await page.getByRole('button', { name: 'Plan entwerfen' }).click();
    await expect(page.getByText(/Die KI konnte keinen gültigen Plan liefern/)).toBeVisible();
    await page.getByLabel('Zielgruppe').fill('Kleine Projektteams');
    await page.getByLabel('Priorisierte Roadmap').fill('Notizen filtern\nSuche testen');
    await page.getByRole('button', { name: 'Bestätigen und Projekt erzeugen' }).click();
    await expect(page.getByText(serverPath)).toBeVisible();
    await expect(page.getByLabel('PowerShell-Befehl')).toHaveValue(`code '${serverPath}'`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Bauen und starten' }).click();
    await expect(page.getByText('Docker-Image bauen …')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Dienst starten fehlgeschlagen.');
    await page.getByRole('button', { name: 'Ab gespeichertem Stand erneut versuchen' }).click();
    await expect(page.getByRole('link', { name: 'Beispiel-App öffnen' })).toHaveAttribute('href', 'http://127.0.0.1:25123');
    expect(buildCalls).toBe(2);
  });
}
