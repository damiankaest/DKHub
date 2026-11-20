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

test('try an embedded page before saving', async ({ page }) => {
  await page.route('**/api/apps', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByText('DEIN PERSÖNLICHER HUB')).toHaveCount(0);
  await page.getByRole('button', { name:'+ Hinzufügen' }).click();
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
  await page.route('**/api/director/install', route => {
    expect(route.request().postDataJSON()).toEqual({ name:'nginx', image:'nginx:latest', port:80 });
    apps = [{id:'director-aaaa', route:'nginx', name:'nginx', description:'Docker', category:'Dienste', icon:'globe', color:'sage', url:'http://192.168.1.5:31231', mode:'embed', label:'Docker'}];
    return route.fulfill({ status:201, json: {name:'nginx', state:'running'} });
  });
  await page.goto('/');
  await page.getByRole('button', {name:'Dienste', exact:true}).click();
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByLabel('Docker Hub durchsuchen').fill('nginx');
  await page.getByRole('button', {name:'Suchen', exact:true}).click();
  await page.getByRole('button', {name:'Auswählen'}).click();
  await page.getByRole('button', {name:'Image installieren und starten'}).click();
  await expect(page.getByText('nginx wurde gestartet und als Kachel hinzugefügt.')).toBeVisible();
  await page.getByRole('button', {name:'Zurück', exact:true}).click();
  await expect(page.getByRole('heading', {name:'nginx'})).toBeVisible();
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
  await page.getByRole('button',{name:'Admin',exact:true}).click();
  await page.getByLabel('Admin-Passwort').fill('secret');
  await page.getByRole('button',{name:'Anmelden'}).click();
  await page.getByLabel(/KI aktivieren/).check();
  await page.getByLabel(/OpenAI API-Schlüssel/).fill('key');
  await page.getByRole('button',{name:'Einstellungen speichern'}).click();
  await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
  await page.getByRole('button',{name:'Zurück',exact:true}).click();
  await page.getByRole('button',{name:'+ Hinzufügen'}).click();
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
  await page.locator('.card').filter({has:page.getByRole('heading',{name:'DKCoach'})}).getByRole('button',{name:'Bearbeiten'}).click();
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
