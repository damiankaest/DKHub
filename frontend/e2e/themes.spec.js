import { test, expect } from '@playwright/test';

const light = {id:'light', name:'Hell', mode:'light', accent:'#137C68', highlight:'#E7B363', motif:'grid', shape:'soft', motion:false};
const presets = [light,
  {...light,id:'dark',name:'Dunkel',mode:'dark',accent:'#73DCC0',highlight:'#A79BEC',motif:'orbit',motion:true},
  {...light,id:'anime',name:'Anime',accent:'#B53372',highlight:'#705CE0',motif:'manga',shape:'crisp',motion:true},
  {...light,id:'christmas',name:'Weihnachten',mode:'dark',accent:'#98D9AC',highlight:'#ECAC70',motif:'snow',shape:'round',motion:true}];
const music = {id:'dj',route:'dj',name:'DKDJ',description:'Deine Musik im Haus',category:'Musik',mode:'external',url:'https://example.com',label:'Musik'};
const training = {id:'coach',route:'coach',name:'DKCoach',description:'Training und Wiederholungen',category:'Sport',mode:'embed',url:'/demo.html',label:'Training'};
const generated = {name:'Listening-Bar',mode:'dark',accent:'#138F83',highlight:'#F2B483',shape:'round',motif:'aurora',motion:true};

async function mockHub(context, ai=false) {
  const db = {active:'light', themes:[...presets], drafts:0};
  await context.route('**/api/auth', r=>r.fulfill({json:{password_required:true}}));
  await context.route('**/api/apps', r=>r.fulfill({json:[music,training]}));
  await context.route('**/api/theme', r=>r.fulfill({json:db.themes.find(t=>t.id===db.active)}));
  await context.route('**/api/admin/settings/read', r=>r.fulfill({json:{enabled:ai,openai_configured:ai,typesafe_configured:false,openai_model:'test',jev_model:'test'}}));
  await context.route(/\/api\/admin\/themes(?:\/|$)/, route=>{
    const request = route.request();
    expect(request.headers()['x-dkhub-admin']).toBe('demo-access');
    const path = new URL(request.url()).pathname.slice('/api/admin/themes'.length);
    if (path==='/list') return route.fulfill({json:{active:db.active,themes:db.themes}});
    if (path==='/draft') {
      expect(request.postDataJSON()).toEqual({prompt:'Listening-Bar bei Nacht'});
      db.drafts++;
      return route.fulfill({json:generated});
    }
    if (!path && request.method()==='POST') {
      const theme={...request.postDataJSON(),id:'custom-review'};
      db.themes.push(theme); return route.fulfill({status:201,json:theme});
    }
    if (path.endsWith('/activate')) {
      db.active=path.split('/')[1];
      return route.fulfill({json:db.themes.find(t=>t.id===db.active)});
    }
    if (request.method()==='DELETE') {
      db.themes=db.themes.filter(t=>t.id!==path.slice(1));
      return route.fulfill({status:204});
    }
    return route.fulfill({status:404,json:{}});
  });
  return db;
}
async function settings(page, mobile=false) {
  if(mobile) await page.getByRole('button',{name:'Navigation öffnen'}).click();
  await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
  await page.getByLabel('Admin-Passwort').fill('demo-access');
  await page.getByRole('button',{name:'Anmelden'}).click();
  await expect(page.getByRole('button',{name:'Hell',exact:true})).toBeVisible();
}
function fits(page) {
  return page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

test('preview, edit and activate an AI design separately; guests get only the confirmed design',async({page,context}, info)=>{
  const db=await mockHub(context,true);
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'DKCoach öffnen'})).toBeVisible();
  const guest=await context.newPage();
  await guest.goto('/');
  await expect(guest.locator('html')).toHaveAttribute('data-motif','grid');
  await page.bringToFront();
  await settings(page);
  await page.getByRole('button',{name:'Weihnachten',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motif','snow');
  expect(db.active).toBe('light');
  await expect(guest.locator('html')).toHaveAttribute('data-motif','grid');
  await page.screenshot({path:info.outputPath('winter-studio-review.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Vorschau beenden'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motif','grid');
  await page.getByLabel('Gestaltungswunsch').fill('Listening-Bar bei Nacht');
  await page.getByRole('button',{name:'KI-Entwurf erstellen'}).click();
  await expect(page.getByLabel('Theme-Name')).toHaveValue('Listening-Bar');
  await expect(page.locator('html')).toHaveAttribute('data-motif','aurora');
  expect(db.drafts).toBe(1);
  await page.getByLabel('Theme-Name').fill('Vinyl am Abend');
  await page.getByLabel('Passende Animationen erlauben').uncheck();
  await page.getByRole('button',{name:'Theme speichern'}).click();
  await expect(page.getByRole('button',{name:'Vinyl am Abend',exact:true})).toBeVisible();
  expect(db.active).toBe('light');
  await page.getByRole('button',{name:'Für alle aktivieren'}).click();
  await expect(page.getByRole('status')).toContainText('Design für alle Geräte');
  await guest.bringToFront();
  await guest.reload();
  await expect(guest.locator('html')).toHaveAttribute('data-motif','aurora');
  await expect(guest.locator('html')).toHaveAttribute('data-motion','off');
  await expect(guest.getByRole('button',{name:'Design verwalten: Vinyl am Abend'})).toBeVisible();
  await expect(guest.frameLocator('iframe[title="Vorschau DKCoach"]').getByRole('heading',{name:'Hallo aus deiner Demo-App!'})).toBeVisible();
  await guest.screenshot({path:info.outputPath('custom-library-review.png'),animations:'disabled'});
  await guest.close();
});

test('mobile: preview is reversible; manual design works without AI and respects reduced motion',async({page,context},info)=>{
  const db=await mockHub(context);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'DKCoach öffnen'})).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.screenshot({path:info.outputPath('mobile-library-review.png'),animations:'disabled'});
  await settings(page,true);
  await page.getByRole('button',{name:'Anime',exact:true}).click();
  await expect(page.locator('.preview-art .art-strike')).toHaveCSS('animation-name','none');
  await page.getByRole('button',{name:'KI-Zugänge',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-motif','grid');
  await page.getByRole('button',{name:'Design-Studio',exact:true}).click();
  await page.getByLabel('Gestaltungswunsch').fill('Schnee');
  await expect(page.getByRole('button',{name:'KI-Entwurf erstellen'})).toBeDisabled();
  await page.getByRole('button',{name:'Manuell gestalten'}).click();
  await page.getByLabel('Theme-Name').fill('Winterabend');
  await page.getByLabel('Grundmodus').selectOption('dark');
  await page.getByLabel('Motiv',{exact:true}).selectOption('snow');
  await page.getByLabel('Passende Animationen erlauben').check();
  await expect(page.locator('.preview-art .art-snow')).toHaveCSS('animation-name','none');
  expect(await fits(page)).toBe(true);
  await page.getByRole('button',{name:'Theme speichern'}).click();
  await page.getByRole('button',{name:'Eigenes Theme entfernen'}).click();
  await page.getByRole('button',{name:'Behalten'}).click();
  await expect(page.getByRole('button',{name:'Winterabend',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Eigenes Theme entfernen'}).click();
  await page.getByRole('button',{name:'Endgültig entfernen'}).click();
  await expect(page.getByRole('button',{name:'Winterabend',exact:true})).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-motif','grid');
  expect(db.active).toBe('light');
});

test('a failed catalog request can be retried; favorite filtering and the card menu work by keyboard',async({page,context})=>{
  await mockHub(context);
  let calls=0;
  await page.route('**/api/apps', r=>++calls===1?r.fulfill({status:503,json:{}}):r.fulfill({json:[music,training]}));
  await page.goto('/');
  await page.getByRole('button',{name:'Erneut versuchen'}).click();
  await page.getByRole('button',{name:'DKCoach zu Favoriten hinzufügen'}).click();
  await page.getByRole('button',{name:/^Favoriten\s*1$/}).click();
  await expect(page.getByRole('heading',{name:/DKDJ/})).toBeHidden();
  const trigger=page.getByRole('button',{name:'Optionen für DKCoach'});
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Bearbeiten',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button',{name:'Bearbeiten',exact:true})).toBeHidden();
});
