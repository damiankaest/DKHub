import { test, expect } from '@playwright/test';
import { mockCatalog, toggle, log, say } from './assistantFixture.js';

test.beforeEach(mockCatalog);

async function fallback(page){
  await page.addInitScript(()=>Object.defineProperty(document,'modelContext',{configurable:true,value:undefined}));
}

test('desktop assistant docks beside the live app; closing restores space, focus and history',async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await fallback(page);await page.goto('/');
  const frame=page.locator('iframe[title="Vorschau DKCoach"]');
  await expect(frame.contentFrame().getByRole('heading',{name:'Hallo aus deiner Demo-App!'})).toBeVisible();
  await frame.evaluate(el=>{el.contentWindow.sessionMark='original';});
  await toggle(page).click();
  const panel=page.getByRole('complementary',{name:'DK-Assistent'});
  await expect(panel.getByText('Hub-Werkzeuge',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Nachricht an DKHub'})).toBeFocused();
  await page.screenshot({path:info.outputPath('assistant-library-review.png'),animations:'disabled'});
  await say(page,'Wiederholungen');await log(page).getByRole('button',{name:'DKCoach öffnen'}).click();
  await expect(page).toHaveURL(/\/coach$/);await expect(log(page).getByText('Ich öffne DKCoach.')).toBeVisible();
  const dock=await panel.boundingBox(), viewer=await frame.boundingBox();
  expect(dock.x+dock.width).toBeCloseTo(1440,0);expect(dock.height).toBeCloseTo(900,0);
  expect(viewer.x+viewer.width).toBeLessThanOrEqual(dock.x+1);
  expect(await frame.evaluate(el=>el.contentWindow.sessionMark)).toBe('original');
  await page.screenshot({path:info.outputPath('assistant-app-review.png'),animations:'disabled'});
  await panel.getByRole('button',{name:'Chat schließen'}).click();
  await expect(toggle(page)).toBeFocused();expect((await frame.boundingBox()).width).toBeGreaterThan(viewer.width+280);
  await toggle(page).click();await expect(log(page).getByText('Ich öffne DKCoach.')).toBeVisible();
  await page.getByRole('button',{name:'Neuer Chat'}).click();
  await expect(panel.getByRole('heading',{name:'Wohin im Hub?'})).toBeVisible();
});

test('phone dialog fits the viewport, keeps the composer reachable and returns to the opened app',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await fallback(page);await page.goto('/');await toggle(page).click();
  const panel=page.getByRole('dialog',{name:'DK-Assistent'}),composer=panel.getByLabel('Nachricht an DKHub');
  await expect(panel.getByRole('heading',{name:'DK-Assistent'})).toBeFocused();
  expect(await panel.boundingBox()).toEqual({x:0,y:0,width:390,height:844});
  const box=await composer.boundingBox();expect(box.y+box.height).toBeLessThan(844);
  await page.screenshot({path:info.outputPath('assistant-mobile-review.png'),animations:'disabled'});
  await composer.focus();await page.setViewportSize({width:390,height:550});
  await expect.poll(async()=>{const r=await composer.boundingBox();return r.y+r.height;}).toBeLessThan(550);
  await page.keyboard.press('Escape');await expect(toggle(page)).toBeFocused();
  await toggle(page).click();await say(page,'Öffne DKCoach');
  await expect(panel).toHaveCount(0);await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole('button',{name:'Übersicht'})).toBeFocused();
  await toggle(page).click();await expect(log(page).getByText('Ich öffne DKCoach.')).toBeVisible();
});

test('AI and local threads stay separate; external suggestions require a click and passwords clear on close',async({page})=>{
  await fallback(page);
  let attempts=0;const messages=[];
  await page.route('**/api/chat/ai',r=>{
    const body=r.request().postDataJSON();messages.push(body);attempts++;
    expect(r.request().headers()['x-dkhub-admin']).toBe('test-only');
    if(attempts===1) return r.fulfill({status:503,json:{}});
    return r.fulfill({json:{reply:'Das Musikarchiv passt.',intent:'open',tool:'dkhub_open_app',app_ids:['music']}});
  });
  await page.goto('/');await toggle(page).click();await say(page,'Wiederholungen');
  await expect(log(page).getByRole('button',{name:'DKCoach öffnen'})).toBeVisible();
  await page.getByRole('button',{name:'KI-Chat',exact:true}).click();
  await page.getByLabel('Admin-Passwort',{exact:true}).fill('test-only');
  await say(page,'Wo sind meine Platten?');
  await expect(log(page).getByText(/noch nicht eingerichtet/)).toBeVisible();
  await log(page).getByRole('button',{name:'Erneut versuchen'}).click();
  const link=log(page).getByRole('link',{name:'Musikarchiv im neuen Tab öffnen'});
  await expect(link).toHaveAttribute('target','_blank');await expect(page).toHaveURL(/\/$/);
  expect(messages[0].history).toEqual([]);expect(JSON.stringify(messages)).not.toContain('Wiederholungen');
  await page.getByRole('button',{name:'Chat schließen'}).click();await toggle(page).click();
  await expect(page.getByLabel('Admin-Passwort',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Lokal',exact:true}).click();
  await expect(log(page).getByText('Wiederholungen',{exact:true})).toBeVisible();
});
