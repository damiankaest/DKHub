import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubTools, TOOLS } from '../src/assistant/hubTools.js';
import { decideChat, resolveAiReply } from '../src/chatDecision.js';

const apps = [
  {id:'a',name:'Wetter',category:'Zuhause',description:'Lokale Vorhersage',mode:'embed'},
  {id:'b',name:'Musik',category:'Medien',description:'Vinyl',mode:'external'},
  {id:'c',name:'Musikbox',category:'Medien',manifest:'Stücke auf Schallplatten erkennen',mode:'embed'},
];
function fixture() {
  const changes=[],calls=[];
  const state={apps,favorites:['stale','c'],status:'ready',open:app=>changes.push(app.id),home:()=>changes.push('home'),add:()=>changes.push('add')};
  const tools=new Map(createHubTools(()=>state).map(t=>[t.name,t]));
  const call=async (name,args)=>{calls.push(name);return tools.get(name).execute(args);};
  return {call,calls,changes,state,ask:text=>decideChat(text,call)};
}
test('an explicit embedded launch resolves a name then runs the real open tool',async()=>{
  const f=fixture();
  assert.equal((await f.ask('Öffne Wetter!')).navigated,true);
  assert.deepEqual(f.calls,[TOOLS.search,TOOLS.open]);assert.deepEqual(f.changes,['a']);
});
test('ambiguous and external names require a choice; free text searches manifests',async()=>{
  const f=fixture();
  assert.deepEqual((await f.ask('Öffne Mus')).ids,['b','c']);
  assert.deepEqual((await f.ask('Öffne Musik')).ids,['b']);
  assert.deepEqual((await f.ask('Schallplatten')).ids,['c']);
  assert.match((await f.ask('Öffne Unbekannt')).text,/keine registrierte App/);
  assert.deepEqual(f.changes,[]);
});
test('favorites are live; the add tool only prepares a form and cannot discard an open form',async()=>{
  const f=fixture();
  assert.deepEqual((await f.ask('Zeige meine Favoriten')).ids,['c']);
  f.state.favorites=['a'];assert.deepEqual((await f.ask('Meine Favoriten')).ids,['a']);
  await f.ask('Zur Bibliothek');await f.ask('App hinzufügen');
  f.state.panel='add';await assert.rejects(f.ask('Öffne Wetter'),/Eingaben erhalten/);
  assert.deepEqual(f.changes,['home','add']);await f.ask('Installiere Musik');assert.deepEqual(f.changes,['home','add']);
});
test('AI action proposals resolve current IDs; external, ambiguous, stale and unknown actions never navigate',async()=>{
  const f=fixture();const reply=(tool,ids,intent='open')=>resolveAiReply({tool,app_ids:ids,reply:'Vorschlag',intent},f.call);
  assert.equal((await reply(TOOLS.open,['a'])).navigated,true);
  assert.deepEqual((await reply(TOOLS.open,['b'])).ids,['b']);
  assert.deepEqual((await reply(TOOLS.open,['a','missing'])).ids,['a']);
  assert.match((await reply(TOOLS.open,['stale'])).text,/nicht mehr/);
  await reply('arbitrary_action',['a']);await reply(TOOLS.open,['a'],'search');
  assert.deepEqual(f.changes,['a']);
  assert.deepEqual((await reply(TOOLS.favorites,[],'favorites')).ids,['c']);
  assert.equal((await reply(TOOLS.search,[],'catalog')).total,3);
});
