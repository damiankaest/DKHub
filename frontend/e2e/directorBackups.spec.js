import { expect, test } from '@playwright/test';
import { defaultTheme } from '../src/themes/palette.js';

const serviceId = 'dkhub-' + 'a'.repeat(32);
const base = '/api/director/services/' + serviceId;
const backupId = 'b'.repeat(32);
const planId = 'c'.repeat(32);
const volumes = [
  { key: 'data', target: '/srv/data', name: serviceId + '.data' },
  { key: 'logs', target: '/srv/logs', name: serviceId + '.logs' },
];
const backup = { id: backupId, created_utc: '2026-11-26T13:15:00Z', service_id: serviceId, volumes };
const targets = volumes.map(v => ({ ...v, source: v.name, name: v.name + '.restore-' + 'd'.repeat(32) }));
const service = { id: serviceId, name: 'Testdienst', image: 'test:latest', state: 'exited',
  host_ip: '127.0.0.1', host_port: 25123, volumes };
const preview = { plan_id: planId, expires_in: 600, confirmation: 'RESTORE', targets };
const restorePath = base + '/backups/' + backupId + '/restore';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 404 }));
  await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
  await page.route('**/api/theme', route => route.fulfill({ json: defaultTheme }));
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/services/*/health?*', route => route.fulfill({ json: { status: 'reachable', http_status: 200 } }));
});

async function openDirector(page) {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Navigation öffnen' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Dienste', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/director/image', route => route.fulfill({ json: { ports: [], volumes: [], env: [], recipe: null } }));
});

test('keeps multiple optional mount definitions when Docker asks for a port', async ({ page }) => {
  let installed = false;
  const attempts = [];
  await page.route('**/api/director/search?*', route => route.fulfill({ json: [{ name: 'test' }] }));
  await page.route('**/api/director/list', route => route.fulfill({ json: installed ? [service] : [] }));
  await page.route('**/api/director/install', route => {
    const body = route.request().postDataJSON();
    attempts.push(body);
    if (!body.port) return route.fulfill({ json: { port_required: true, ports: [80, 443] } });
    installed = true;
    return route.fulfill({ status: 201, json: service });
  });
  await page.route('**' + base + '/backups/list', route => route.fulfill({ json: [] }));
  await openDirector(page);
  await page.getByRole('button', { name: 'Neuer Dienst' }).click();
  await page.getByLabel('Wonach suchst du?').fill('test');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await page.getByRole('button', { name: 'Auswählen: test' }).click();
  await page.getByText('Dauerhafte Daten', { exact: true }).click();
  await page.getByRole('button', { name: 'Volume hinzufügen' }).click();
  await page.getByRole('button', { name: 'Volume hinzufügen' }).click();
  await page.getByRole('group', { name: 'Volume 1' }).getByLabel('Schlüssel').fill('data');
  await page.getByRole('group', { name: 'Volume 2' }).getByLabel('Schlüssel').fill('logs');
  await page.getByRole('group', { name: 'Volume 1' }).getByLabel('Container-Mountpfad').fill('/srv/data');
  const secondPath = page.getByRole('group', { name: 'Volume 2' }).getByLabel('Container-Mountpfad');
  await secondPath.fill('/srv/data/logs');
  await page.getByRole('button', { name: 'Installieren und starten' }).click();
  await expect(page.getByRole('alert')).toContainText('dürfen sich nicht überlappen');
  expect(attempts).toHaveLength(0);
  await secondPath.fill('/srv/logs');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await page.getByRole('button', { name: '80', exact: true }).click();
  await expect(secondPath).toHaveValue('/srv/logs');
  await page.getByRole('button', { name: 'Installieren und starten' }).click();
  const expected = { name: 'test', image: 'test:latest',
    volumes: [{ key: 'data', target: '/srv/data' }, { key: 'logs', target: '/srv/logs' }] };
  await expect(page.getByText('Testdienst wurde installiert und in deine Bibliothek gelegt.')).toBeVisible();
  expect(attempts).toEqual([expected, { ...expected, port: 80 }]);
  await page.getByRole('button', { name: 'Daten und Backups' }).click();
  await expect(page.getByText(volumes[0].name, { exact: true })).toBeVisible();
});

test('creates only when stopped and confirms the previewed destinations on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  let state = 'running';
  let saved = false;
  let restoreCalls = 0;
  await page.route('**/api/director/list', route => route.fulfill({ json: [{ ...service, state }] }));
  await page.route('**' + base + '/stop', route => {
    state = 'exited';
    return route.fulfill({ json: { ...service, state } });
  });
  await page.route('**' + base + '/backups/list', route => route.fulfill({ json: saved ? [backup] : [] }));
  await page.route('**' + base + '/backups', route => {
    expect(state).toBe('exited');
    saved = true;
    return route.fulfill({ status: 201, json: backup });
  });
  await page.route('**' + restorePath + '/preview', route => route.fulfill({ json: preview }));
  await page.route('**' + restorePath, route => {
    restoreCalls++;
    expect(route.request().postDataJSON()).toEqual({ plan_id: planId, confirmation: 'RESTORE' });
    return route.fulfill({ json: { volumes: targets } });
  });
  await openDirector(page);
  await page.getByRole('button', { name: 'Daten und Backups' }).click();
  const save = page.getByRole('button', { name: 'Backup erstellen' });
  await expect(save).toBeDisabled();
  await expect(page.getByText('Stoppe den Dienst, um ein Backup zu erstellen.')).toBeVisible();
  await page.getByText('Mehr Optionen').click();
  await page.getByRole('button', { name: 'Stoppen' }).click();
  await save.click();
  await expect(page.getByText('Backup wurde erstellt.')).toBeVisible();
  await expect(page.getByText(/Backup-Dateien liegen unverschlüsselt/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore-Vorschau' }).click();
  await expect(page.getByRole('heading', { name: 'Restore-Vorschau' })).toBeFocused();
  await expect(page.locator('.storage-targets').getByText(targets[0].source, { exact: true })).toBeVisible();
  await expect(page.getByText(targets[1].name, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const restore = page.getByRole('button', { name: 'In neue Volumes wiederherstellen' });
  await page.getByLabel('Zur Bestätigung RESTORE eingeben').fill('restore');
  await expect(restore).toBeDisabled();
  expect(restoreCalls).toBe(0);
  await page.getByLabel('Zur Bestätigung RESTORE eingeben').fill('RESTORE');
  await restore.click();
  await expect(page.getByText(/Die Aktivierung erfolgt manuell/)).toBeVisible();
  expect(restoreCalls).toBe(1);
});

test('surfaces missing volumes, checksum failures, expired plans and partial restores', async ({ page }) => {
  let previewCalls = 0;
  let restores = 0;
  await page.route('**/api/director/list', route => route.fulfill({ json: [
    { ...service, volumes: [], volume_issue: 'Docker-Volumes fehlen: data.' },
    { ...service, id: 'dkhub-' + 'e'.repeat(32), name: 'Älterer Dienst', volumes: [] },
  ] }));
  await page.route('**/backups/list', route => route.fulfill({ json: route.request().url().includes(serviceId) ? [backup] : [] }));
  await page.route('**' + restorePath + '/preview', route => {
    previewCalls++;
    if (previewCalls === 1) return route.fulfill({ status: 422, json: { detail: 'Backup checksum mismatch for entry 0' } });
    if (previewCalls === 2) return route.fulfill({ status: 422, json: { detail: 'A planned restore volume already exists' } });
    return route.fulfill({ json: preview });
  });
  await page.route('**' + restorePath, route => {
    restores++;
    if (restores === 1) return route.fulfill({ status: 409, json: { detail: 'Restore preview expired or does not match this backup' } });
    return route.fulfill({ status: 502, json: { detail: 'Restore incomplete at logs. Completed targets: data.' } });
  });
  await openDirector(page);
  const legacy = page.getByRole('article', { name: 'Älterer Dienst' });
  await legacy.getByRole('button', { name: 'Daten und Backups' }).click();
  await expect(legacy.getByText(/keine Volumes in DKHub eingerichtet/)).toBeVisible();
  const card = page.getByRole('article', { name: 'Testdienst' });
  await expect(card.getByRole('alert')).toContainText('Docker-Volumes fehlen');
  await card.getByRole('button', { name: 'Daten und Backups' }).click();
  await expect(card.getByRole('button', { name: 'Backup erstellen' })).toBeDisabled();
  await card.getByRole('button', { name: 'Restore-Vorschau' }).click();
  await expect(card.getByText('Die Prüfsumme stimmt nicht.', { exact: false })).toBeVisible();
  await card.getByRole('button', { name: 'Restore-Vorschau' }).click();
  await expect(card.getByText('Konflikt bei der Sicherungsaktion.', { exact: false })).toBeVisible();
  for (const error of ['Der Wiederherstellungsplan ist abgelaufen', 'Wiederherstellung unvollständig']) {
    await card.getByRole('button', { name: 'Restore-Vorschau' }).click();
    await card.getByLabel('Zur Bestätigung RESTORE eingeben').fill('RESTORE');
    await card.getByRole('button', { name: 'In neue Volumes wiederherstellen' }).click();
    await expect(card.getByText(error, { exact: false })).toBeVisible();
    await expect(card.getByText(/Die Aktivierung erfolgt manuell/)).toHaveCount(0);
  }
});
