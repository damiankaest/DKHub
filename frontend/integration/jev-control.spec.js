import { test, expect } from '@playwright/test';

for (const native of [true,false]) {
  test('Jev-only control, FastAPI to '+(native?'native WebMCP':'local Hub tools'),async({page})=>{
    if(!native) await page.addInitScript(()=>Object.defineProperty(document,'modelContext',{value:undefined}));
    // Spy on calls to Chromium, preserving its actual handles, execution, and return values.
    else await page.addInitScript(()=>{
      if(window!==window.top || !document.modelContext) return;
      const proto=Object.getPrototypeOf(document.modelContext), execute=proto.executeTool;
      window.hubCalls=[];
      Object.defineProperty(proto,'executeTool',{...Object.getOwnPropertyDescriptor(proto,'executeTool'),
        value:function(tool,...args){window.hubCalls.push(tool.name);return execute.call(this,tool,...args);}});
    });
    await page.goto('/');
    await page.getByRole('button',{name:'DKHub Chat öffnen',exact:true}).click();
    await expect(page.getByText(native?'WebMCP':'Hub-Werkzeuge',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'KI-Chat',exact:true}).click();
    await page.getByLabel('Admin-Passwort',{exact:true}).fill('fixture-admin');
    const thread=page.getByRole('log',{name:'Chatverlauf'});
    async function say(text,tool) {
      const input=page.getByLabel('Nachricht an DKHub');
      await input.fill(text);
      const reply=page.waitForResponse(r=>r.url().endsWith('/api/chat/ai') && r.request().method()==='POST');
      await input.press('Enter');
      const response=await reply;
      expect(response.status()).toBe(200);expect(await response.json()).toMatchObject({tool,engine:'jev'});
    }
    await say('Bring mich bitte zur DKHub Demo.','dkhub_open_app');
    await expect(page).toHaveURL(/\/dkhub-demo$/);await expect(thread.getByText('Ich öffne DKHub Demo.')).toBeVisible();
    await say('Was hatte ich vorhin offen?','dkhub_list_recent');
    await expect(thread.getByRole('button',{name:'DKHub Demo öffnen'})).toBeVisible();
    await say('Schließe bitte die aktuelle Ansicht.','dkhub_close_active_app');
    await expect(page).toHaveURL(/\/$/);await expect(thread.getByText('Die Ansicht von DKHub Demo ist geschlossen.')).toBeVisible();
    await say('Vielleicht das da?','none');
    await expect(thread.getByText(/Was möchtest du im Hub tun/)).toBeVisible();
    if(native) expect(await page.evaluate(()=>window.hubCalls)).toEqual([
      'dkhub_search_apps','dkhub_open_app','dkhub_list_recent','dkhub_search_apps','dkhub_close_active_app'
    ]);
  });
}
