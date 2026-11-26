import { test, expect } from '@playwright/test';
import { defaultTheme } from '../src/themes/palette.js';

test.beforeEach(async ({page}) => {
  await page.route('**/api/director/image', r => r.fulfill({json:{ports:[], volumes:[], env:[], recipe:null}}));
  // Never depend on the auth mode of a Hub that happens to run locally.
  await page.route('**/api/auth', r=>r.fulfill({json:{password_required:true}}));
  await page.route('**/api/theme', r => r.fulfill({json:defaultTheme}));
  await page.route('**/api/images/*', r => r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+BrpYAAAAASUVORK5CYII=', 'base64')}));
});

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

test('try an embedded page before saving', async ({ page }) => {
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByText('DEIN PERSÖNLICHER HUB')).toHaveCount(0);
  await page.getByRole('button', { name:'App hinzufügen' }).click();
  await page.getByLabel('Webadresse').fill('/demo.html');
  await page.getByRole('button', { name:'Einbettung testen' }).click();
  const preview = page.frameLocator('iframe[title="Einbettungsvorschau"]');
  await expect(preview.getByRole('heading', { name:'Hallo aus deiner Demo-App!' })).toBeVisible();
  await page.getByLabel('Webadresse').fill('https://example.com');
  await expect(page.locator('iframe[title="Einbettungsvorschau"]')).toHaveCount(0);
});

test('search and install a service through DKDirector', async ({ page }) => {
  let apps = [];
  await page.route('**/api/apps', route => route.fulfill({ json: apps }));
  await page.route('**/api/director/search?*', route => route.fulfill({ json: [{name:'nginx', description:'Web server', stars:'10', official:true}] }));
  await page.route('**/api/director/list', route => route.fulfill({ json: [{id:'dkhub-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name:'nginx', image:'nginx:latest', state:'running', host_port:31231}] }));
  await page.route('**/api/director/services/*/health?*', route => route.fulfill({ json: {status:'reachable', http_status:200} }));
  await page.route('**/api/director/install', route => {
    // The first attempt sends no port; the image declares two, so the user picks one.
    if (!route.request().postDataJSON().port) return route.fulfill({ json: {port_required:true, ports:[80, 443]} });
    expect(route.request().postDataJSON()).toEqual({ name:'nginx', image:'nginx:latest', port:80 });
    apps = [{id:'director-aaaa', route:'nginx', name:'nginx', description:'Docker', category:'Dienste', icon:'globe', color:'sage', url:'http://192.168.1.5:31231', mode:'embed', label:'Docker'}];
    return route.fulfill({ status:201, json: {id:'dkhub-' + 'a'.repeat(32), name:'nginx', state:'running'} });
  });
  await page.goto('/');
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button', {name:'Neuer Dienst'}).click();
  await page.getByLabel('Wonach suchst du?').fill('nginx');
  await page.getByRole('button', {name:'Suchen', exact:true}).click();
  await page.getByRole('button', {name:'Auswählen: nginx'}).click();
  await page.getByRole('button', {name:'Installieren und starten'}).click();
  await page.getByRole('button', {name:'80', exact:true}).click();
  await page.getByRole('button', {name:'Installieren und starten'}).click();
  await expect(page.getByText('nginx wurde installiert und in deine Bibliothek gelegt.')).toBeVisible();
  await expect(page.getByRole('article', {name:'nginx'}).getByRole('status')).toHaveText('Bereit');
  await page.getByRole('button', {name:'Zurück', exact:true}).click();
  await expect(page.getByRole('heading', {name:'nginx'})).toBeVisible();
});

test('services load by themselves without a password and can be added to the library and configured', async ({ page }) => {
  const id = 'a'.repeat(32);
  let apps = [];
  await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
  await page.route('**/api/apps', route => route.fulfill({ json: apps }));
  await page.route('**/api/director/list', route => route.fulfill({ json: [{id:'dkhub-' + id, name:'whoami', image:'whoami:latest', state:'running', host_ip:'192.168.1.5', host_port:25000}] }));
  await page.route('**/api/director/services/*/health?*', route => route.fulfill({ json: {status:'reachable', http_status:200} }));
  await page.route('**/api/director/services/*/tile', route => {
    apps = [{id:'director-' + id, route:'whoami', name:'whoami', description:'Docker', category:'Dienste', icon:'globe', color:'sage', url:'http://192.168.1.5:25000', mode:'embed', label:'Docker'}];
    return route.fulfill({ json: apps[0] });
  });
  await page.goto('/');
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  await page.getByRole('button', {name:'Zur Bibliothek hinzufügen'}).click();
  await expect(page.getByText('In der Bibliothek', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Konfigurieren'}).click();
  await expect(page.getByRole('heading', {name:'Anwendung bearbeiten'})).toBeVisible();
  // A service tile starts with what people actually change.
  await expect(page.locator('.add-form input').first()).toHaveValue('whoami');
  await expect(page.locator('.add-form legend').first()).toHaveText('Kachel und Beschreibung');
  await page.getByRole('button', {name:'Abbrechen'}).click();
  await expect(page.getByRole('heading', {name:'Dienste verwalten'})).toBeVisible();
});

test('service cards explain problems, offer one next step and fit a phone', async ({ page }) => {
  const id = letter => 'dkhub-' + letter.repeat(32);
  const base = {image:'registry-example/a-very-long-image-name-that-must-wrap:2.14.3', state:'running', host_ip:'192.168.1.5', host_port:25000};
  let stopped = false;
  await page.setViewportSize({width:360, height:740});
  await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/list', route => route.fulfill({ json: [
    {...base, id:id('a'), name:'Blockiert', port_blocked:true},
    {...base, id:id('b'), name:'Eine App mit einem ausgesprochen langen Namen', state:stopped ? 'running' : 'exited'},
  ] }));
  await page.route('**/api/director/services/*/health?*', route => route.fulfill({ json: {status:'unreachable', http_status:null} }));
  await page.route('**/api/director/services/*/start', route => route.fulfill({ status:409, json:{detail:'Der feste Port 25000 ist belegt.'} }));
  await page.goto('/');
  await page.getByRole('button', {name:'Navigation öffnen'}).click();
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  const blocked = page.getByRole('article', {name:'Blockiert'});
  await expect(blocked.getByRole('status')).toHaveText('Nicht nutzbar');
  await expect(blocked.getByRole('button', {name:'Stoppen'})).toBeVisible();
  const long = page.getByRole('article', {name:/ausgesprochen langen/});
  await expect(long.getByRole('status')).toHaveText('Gestoppt');
  await expect(long.getByRole('button', {name:'Erneut prüfen'})).toBeHidden();
  await long.getByText('Mehr Optionen').click();
  await expect(long.getByRole('button', {name:'Erneut prüfen'})).toBeVisible();
  await long.getByRole('button', {name:'Starten'}).click();
  await expect(page.getByRole('alert')).toHaveText('Der feste Port 25000 ist belegt.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('adding a service shows what it needs and sends the edited settings', async ({ page }) => {
  let sent;
  await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/list', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/search?*', route => route.fulfill({ json: [{name:'traceapps/lifttrace', description:'Workouts'}] }));
  await page.route('**/api/director/image', route => route.fulfill({ json: { ports:[3002], volumes:[], env:['NODE_VERSION'], recipe:{ note:'Vorlage nach der Anleitung.',
    volumes:[{key:'db', target:'/data/db', label:'Datenbank'}],
    env:[{key:'JWT_SECRET', value:'', label:'Geheimer Schlüssel', required:true, secret:true, generate:true}, {key:'INSECURE_COOKIES', value:'1', label:'Anmeldung über http', required:false}] } } }));
  await page.route('**/api/director/install', route => { sent = route.request().postDataJSON(); return route.fulfill({ status:502, json:{detail:'Testende'} }); });
  await page.goto('/');
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  await page.getByRole('button', {name:'Neuer Dienst'}).click();
  await page.getByLabel('Wonach suchst du?').fill('lifttrace');
  await page.getByRole('button', {name:'Suchen', exact:true}).click();
  await page.getByRole('button', {name:'Auswählen: traceapps/lifttrace'}).click();
  await expect(page.getByText('Vorlage nach der Anleitung.')).toBeVisible();
  await expect(page.getByRole('group', {name:'Datenbank'}).getByLabel('Container-Mountpfad')).toHaveValue('/data/db');
  const secret = page.getByRole('group', {name:'Geheimer Schlüssel'}).getByLabel('Wert');
  await expect(secret).toHaveAttribute('type', 'password');
  await expect(secret).toHaveValue(/^[0-9a-f]{64}$/);
  await secret.fill('');
  await page.getByRole('button', {name:'Installieren und starten'}).click();
  await expect(page.getByRole('alert')).toContainText('JWT_SECRET wird von der App benötigt');
  expect(sent).toBeUndefined();
  await secret.fill('eigener-schluessel');
  await page.getByRole('button', {name:'Einstellung hinzufügen'}).click();
  const added = page.getByRole('group', {name:'Einstellung 3'});
  await added.getByLabel('Name').fill('TZ');
  await added.getByLabel('Wert').fill('Europe/Berlin');
  await page.getByRole('button', {name:'Erneut versuchen'}).click();
  await expect(page.getByRole('alert')).toContainText('Testende');
  expect(sent.volumes).toEqual([{key:'db', target:'/data/db'}]);
  expect(sent.env).toEqual([{key:'JWT_SECRET', value:'eigener-schluessel'}, {key:'INSECURE_COOKIES', value:'1'}, {key:'TZ', value:'Europe/Berlin'}]);
});

test('a pasted compose file fills the install form on a phone', async ({ page }) => {
  let sent;
  await page.setViewportSize({width:360, height:740});
  await page.route('**/api/auth', route => route.fulfill({ json: { password_required: false } }));
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/list', route => route.fulfill({ json: [] }));
  await page.route('**/api/director/install', route => { sent = route.request().postDataJSON(); return route.fulfill({ status:502, json:{detail:'Testende'} }); });
  await page.goto('/');
  await page.getByRole('button', {name:'Navigation öffnen'}).click();
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  await page.getByRole('button', {name:'Neuer Dienst'}).click();
  await page.getByText('Stattdessen docker-compose.yml einfügen').click();
  const box = page.getByLabel('Inhalt der docker-compose.yml');
  await box.fill('services: [kaputt');
  await page.getByRole('button', {name:'Übernehmen'}).click();
  await expect(page.getByRole('alert')).toContainText('kein gültiges YAML');
  await box.fill(['services:', '  wiki:', '    image: example/wiki:2.1', '    ports: ["8080:3000"]', '    volumes:', '      - ./data:/srv/wiki', '    environment:',
    '      SESSION_SECRET: ${SESSION_SECRET}', '      SITE_NAME: Zuhause', '  db:', '    image: postgres:17'].join('\n'));
  await page.getByRole('button', {name:'Übernehmen'}).click();
  await page.getByRole('group', {name:'Welcher Container ist die App?'}).getByRole('button', {name:'wiki'}).click();
  await expect(page.getByRole('heading', {name:'example/wiki installieren'})).toBeVisible();
  await expect(page.getByText('Die Datei enthält weitere Container (db)', {exact:false})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', {name:'Installieren und starten'}).click();
  await expect(page.getByRole('alert')).toContainText('Testende');
  expect(sent).toMatchObject({ name:'wiki', image:'example/wiki:2.1', port:3000, volumes:[{key:'wiki', target:'/srv/wiki'}] });
  expect(sent.env[0].key).toBe('SESSION_SECRET');
  expect(sent.env[0].value).toMatch(/^[0-9a-f]{64}$/);
  expect(sent.env[1]).toEqual({key:'SITE_NAME', value:'Zuhause'});
});

test('chat searches the catalog and opens an embedded app', async ({ page }) => {
  const apps = [{id:'demo', route:'demo-app', name:'Wetter', description:'Lokale Wetterkarte', category:'Zuhause', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel'}];
  await page.route('**/api/apps', route => route.fulfill({json: apps}));
  await page.goto('/');
  await page.getByRole('button', {name:'DKHub Chat öffnen'}).click();
  await page.getByLabel('Nachricht an DKHub').fill('Suche Wetter');
  await page.getByRole('button', {name:'Nachricht senden'}).click();
  await expect(page.getByText('Dazu habe ich 1 App gefunden:')).toBeVisible();
  await page.getByLabel('Nachricht an DKHub').fill('Öffne Wetter');
  await page.getByRole('button', {name:'Nachricht senden'}).click();
  await expect(page.getByRole('button', {name:'Wetter schließen'})).toBeVisible();
  await expect(page.getByText('Ich öffne Wetter.')).toBeVisible();
});

test('sort apps with buttons, save and reload the shared order', async ({ page }) => {
  let apps = ['a', 'b', 'c'].map(id => ({ id, route:id, name:`App ${id}`, description:'Test', category:'Test', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel' }));
  await page.route('**/api/apps', route => route.fulfill({ json: apps }));
  await page.route('**/api/apps/reorder', route => {
    expect(route.request().headers()['x-dkhub-admin']).toBe('secret');
    const ids = route.request().postDataJSON().ids;
    expect(ids).toEqual(['b', 'a', 'c']);
    apps = ids.map(id => apps.find(app => app.id === id));
    return route.fulfill({ json: apps });
  });
  await page.goto('/');
  await page.getByRole('button', { name:'Sortieren', exact:true }).click();
  await page.getByRole('button', { name:'App b nach oben' }).click();
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button', { name:'Reihenfolge speichern' }).click();
  await expect(page.locator('.card h3')).toHaveText(['App b', 'App a', 'App c']);
  await page.reload();
  await expect(page.locator('.card h3')).toHaveText(['App b', 'App a', 'App c']);
});

test('sort apps by dragging their handles', async ({ page }) => {
  const apps = ['a', 'b', 'c'].map(id => ({ id, route:id, name:`App ${id}`, description:'Test', category:'Test', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'Beispiel' }));
  await page.route('**/api/apps', route => route.fulfill({ json: apps }));
  await page.goto('/');
  await page.getByRole('button', { name:'Sortieren', exact:true }).click();
  await page.locator('.sort-row').nth(0).locator('.drag-handle').dragTo(page.locator('.sort-row').nth(2));
  await expect(page.locator('.sort-name')).toHaveText(['App b', 'App c', 'App a']);
});

test('configure AI and review an analyzed app before saving', async ({ page }) => {
  let saved;
  await page.route('**/api/apps', route => route.request().method() === 'GET' ? route.fulfill({json:[]}) : (saved = route.request().postDataJSON(), route.fulfill({status:201,json:{id:'test',route:'sport',category:'Meine Apps',icon:'globe',color:'sage',label:'Webseite',...saved}})));
  await page.route('**/api/admin/themes/list', r => r.fulfill({json:{active:'light',themes:[defaultTheme]}}));
  await page.route('**/api/admin/settings/read', route => route.fulfill({json:{enabled:false, typesafe_configured:false, openai_configured:false, jev_model:'jev-latest', openai_model:'test-model'}}));
  await page.route('**/api/admin/settings', route => {
    expect(route.request().postDataJSON().openai_key).toBe('key');
    return route.fulfill({json:{enabled:true, typesafe_configured:false, openai_configured:true, jev_model:'jev-latest', openai_model:'test-model'}});
  });
  await page.route('**/api/admin/analyze', route => {
    expect(route.request().headers()['x-dkhub-admin']).toBe('secret');
    return route.fulfill({json:{description:'Sport-App', manifest:'Training und Gewichte verwalten.'}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button',{name:'Anmelden'}).click();
  await page.getByRole('button',{name:'KI-Zugänge',exact:true}).click();
  await page.getByLabel(/KI aktivieren/).check();
  await page.getByLabel(/OpenAI API-Schlüssel/).fill('key');
  await page.getByRole('button',{name:'Einstellungen speichern'}).click();
  await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
  await page.getByRole('button',{name:'Zurück',exact:true}).click();
  await page.getByRole('button',{name:'App hinzufügen'}).click();
  await page.getByLabel('Name',{exact:true}).fill('Sport');
  await page.getByLabel('Webadresse').fill('http://192.168.1.5:3000');
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button',{name:'Mit KI beschreiben'}).click();
  await expect(page.getByLabel(/Ausführliche Beschreibung/)).toHaveValue('Training und Gewichte verwalten.');
  await page.getByLabel(/Ausführliche Beschreibung/).fill('Geprüfte Beschreibung');
  await page.getByRole('button',{name:'Anwendung speichern'}).click();
  await expect.poll(() => saved?.manifest).toBe('Geprüfte Beschreibung');
});

test('filter by category, search descriptions, and edit an app category', async ({ page }) => {
  let apps = [
    {id:'sport', route:'sport', name:'DKCoach', description:'Training', manifest:'Gewichte und Wiederholungen', category:'Fitness', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'App'},
    {id:'music', route:'music', name:'DKDJ', description:'Musik', category:'Medien', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'App'},
  ];
  await page.route('**/api/apps', route => route.fulfill({json: apps}));
  await page.route('**/api/apps/sport', route => {
    const data = route.request().postDataJSON();
    expect(data.category).toBe('Zuhause');
    apps = apps.map(app => app.id === 'sport' ? {...app, ...data} : app);
    return route.fulfill({json: apps[0]});
  });
  await page.goto('/');
  await page.getByLabel('Kategorie filtern').selectOption('Fitness');
  await expect(page.getByRole('heading', {name:'DKCoach'})).toBeVisible();
  await expect(page.getByRole('heading', {name:'DKDJ'})).toBeHidden();
  await page.getByLabel('Anwendungen suchen').fill('Wiederholungen');
  await expect(page.getByRole('heading', {name:'DKCoach'})).toBeVisible();
  await page.getByLabel('Anwendungen suchen').fill('Musik');
  await expect(page.getByText('Keine Anwendungen für diese Suche und Kategorie gefunden.')).toBeVisible();
  await page.getByLabel('Anwendungen suchen').clear();
  await page.getByRole('button',{name:'Optionen für DKCoach'}).click();
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
  await page.getByLabel('Kategorie',{exact:true}).fill('Zuhause');
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button',{name:'Anwendung speichern'}).click();
  await expect(page.getByLabel('Kategorie filtern')).toHaveValue('');
  await page.getByLabel('Kategorie filtern').selectOption('Zuhause');
  await expect(page.getByRole('heading',{name:'DKCoach'})).toBeVisible();
  await page.reload();
  await page.getByLabel('Kategorie filtern').selectOption('Zuhause');
  await expect(page.getByRole('heading',{name:'DKCoach'})).toBeVisible();
});

test('TV mode navigates category rows and image previews load apps only on open', async ({page}) => {
  const apps = [
    {id:'one', route:'one', name:'One', description:'', category:'Fitness', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'App', image:'/api/images/' + 'a'.repeat(64) + '.png'},
    {id:'two', route:'two', name:'Two', description:'', category:'Fitness', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'App'},
    {id:'three', route:'three', name:'Three', description:'', category:'Medien', icon:'spark', color:'sage', url:'/demo.html', mode:'embed', label:'App'},
  ];
  await page.route('**/api/apps', route => route.fulfill({json:apps}));
  await page.goto('/');
  await expect(page.locator('iframe[title="Vorschau One"]')).toHaveCount(0);
  await expect(page.getByRole('region', {name:'Kategorie Fitness'})).toBeVisible();
  await page.getByRole('button',{name:'TV-Modus',exact:true}).click();
  const first = page.getByRole('button',{name:'One öffnen',exact:true});
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button',{name:'Two öffnen',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button',{name:'Three öffnen',exact:true})).toBeFocused();
  await first.click();
  await expect(page.locator('iframe[title="Vorschau One"]')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'One schließen'})).toBeVisible();
});

test('upload a thumbnail while adding an app', async ({page}) => {
  let saved;
  await page.route('**/api/apps', route => route.request().method() === 'GET' ? route.fulfill({json:[]}) : (saved = route.request().postDataJSON(), route.fulfill({status:201,json:{id:'new',route:'new',category:'Meine Apps',icon:'globe',color:'sage',label:'Webseite',...saved}})));
  await page.route('**/api/admin/images', route => {
    expect(route.request().headers()['x-dkhub-admin']).toBe('secret');
    return route.fulfill({status:201,json:{image:'/api/images/' + 'a'.repeat(64) + '.png'}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'App hinzufügen'}).click();
  await page.getByLabel('Name',{exact:true}).fill('New');
  await page.getByLabel('Webadresse').fill('https://example.com');
  await page.getByLabel(/Kachelbild/).setInputFiles({name:'tile.png', mimeType:'image/png', buffer:Buffer.from('89504e470d0a1a0a','hex')});
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button',{name:'Anwendung speichern'}).click();
  await expect.poll(() => saved?.image).toBe('/api/images/' + 'a'.repeat(64) + '.png');
});
