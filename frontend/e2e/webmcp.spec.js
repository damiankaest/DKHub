import { test, expect } from '@playwright/test';
import { mockCatalog, toggle, log, say } from './assistantFixture.js';

test.beforeEach(mockCatalog);
// Full Chrome with the same base feature as chrome://flags/#enable-webmcp-testing.
test.use({channel:'chromium',launchOptions:{args:['--enable-features=WebMCP']}});
test('real browser discovers the tools before chat opens, rejects a bad ID, and executes chat actions',async({page})=>{
  // Observe the real Chromium calls; no mock registry or synthetic tool results.
  await page.addInitScript(()=>{
    if(window!==window.top || !document.modelContext) return;
    const context=document.modelContext, proto=Object.getPrototypeOf(context), execute=proto.executeTool;
    window.observedHubTools=[];
    if(typeof execute==='function') Object.defineProperty(proto,'executeTool',{
      ...Object.getOwnPropertyDescriptor(proto,'executeTool'), value:function(tool,...args){
        window.observedHubTools.push(tool.name);return execute.call(this,tool,...args);
      },
    });
  });
  await page.goto('/');await expect(page.getByRole('heading',{name:'App-Bibliothek'})).toBeVisible();
  const names=()=>page.evaluate(async()=> {
    const mc=document.modelContext;
    if(!mc?.getTools) return {secure:window.isSecureContext,modelContext:!!mc,canList:typeof mc?.getTools};
    const handles=await mc.getTools();
    return handles.map(t=>[t.name,('source' in t?t.source:t.window)===window]).sort();
  });
  await expect.poll(names).toEqual(['dkhub_close_active_app','dkhub_list_favorites','dkhub_list_recent','dkhub_open_app','dkhub_prepare_add_app','dkhub_search_apps','dkhub_show_library'].map(name=>[name,true]));
  const call=(name,input)=>page.evaluate(async({name,input})=>{
    const mc=document.modelContext;
    const tool=(await mc.getTools()).find(t=>('source' in t?t.source:t.window)===window && t.name===name);
    const value=await mc.executeTool(tool,input);return typeof value==='string'?JSON.parse(value):value;
  },{name,input});
  expect((await call('dkhub_search_apps',{query:'Sensoren'})).apps.map(a=>a.id)).toEqual(['garden']);
  await expect(call('dkhub_open_app',{id:'not-registered'})).rejects.toThrow();
  await expect(page).toHaveURL(/\/$/);
  await toggle(page).click();await expect(page.getByText('WebMCP',{exact:true})).toBeVisible();
  const before=await page.evaluate(()=>window.observedHubTools.length);
  await say(page,'Öffne DKCoach');await expect(log(page).getByText('Ich öffne DKCoach.')).toBeVisible();
  expect(await page.evaluate(n=>window.observedHubTools.slice(n),before)).toEqual(['dkhub_search_apps','dkhub_open_app']);
  await expect(page).toHaveURL(/\/coach$/);
  await page.getByRole('button',{name:'Zu Favoriten hinzufügen',exact:true}).click();
  expect((await call('dkhub_list_favorites',{})).apps[0].id).toBe('coach');
  await page.route('**/api/chat/ai',r=>r.fulfill({json:{reply:'Favoriten',intent:'favorites',tool:'dkhub_list_favorites',app_ids:[]}}));
  await page.getByRole('button',{name:'KI-Chat',exact:true}).click();
  await page.getByLabel('Admin-Passwort',{exact:true}).fill('test-only');
  const beforeAi=await page.evaluate(()=>window.observedHubTools.length);
  await say(page,'Welche Apps habe ich mir gemerkt?');
  await expect(log(page).getByRole('button',{name:'DKCoach öffnen'})).toBeVisible();
  expect(await page.evaluate(n=>window.observedHubTools.slice(n),beforeAi)).toEqual(['dkhub_list_favorites']);
  await call('dkhub_show_library',{});await expect(page).toHaveURL(/\/$/);
  await call('dkhub_prepare_add_app',{});await expect(page.getByLabel('Webadresse')).toBeVisible();
  await expect(call('dkhub_open_app',{id:'coach'})).rejects.toThrow();
  await expect(page.getByLabel('Webadresse')).toBeVisible();
});
