import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubTools, TOOLS } from '../src/assistant/hubTools.js';
import { connectHubTools } from '../src/assistant/webMcp.js';

function fixture() {
  const owner={},foreign={},routes=[],definitions=new Map(),calls=[];
  const apps=[{id:'x',name:'Studio',mode:'embed',category:'Musik',url:'http://private',manifest:'private text'}];
  const state={apps,favorites:['x'],status:'ready',open:a=>routes.push(a.id),home:()=>routes.push('home'),add:()=>routes.push('add')};
  const local=createHubTools(()=>state);
  const registry={
    registerTool(tool,{signal}) {definitions.set(tool.name,tool);signal.addEventListener('abort',()=>definitions.delete(tool.name));},
    async getTools(){return [...definitions.keys()].flatMap(name=>[{name,source:foreign},{name,source:owner}]);},
    async executeTool(handle,input){assert.equal(handle.source,owner);calls.push(handle.name);return JSON.stringify(await definitions.get(handle.name).execute(input));}
  };
  return {owner,registry,local,calls,routes,state,definitions};
}
test('registers once, dispatches only to own document handles, returns minimal catalog summaries and cleans up',async()=>{
  const f=fixture();let transport;
  const bridge=connectHubTools(f.local,f.registry,f.owner,value=>{transport=value;});
  const result=await bridge.call(TOOLS.search,{query:'private text'});
  assert.equal(transport,'webmcp');assert.equal(f.definitions.size,5);
  assert.deepEqual(result.apps,[{id:'x',name:'Studio',mode:'embed',category:'Musik'}]);
  assert.equal((await bridge.call(TOOLS.open,{id:'x'})).state,'opened');
  assert.deepEqual(f.routes,['x']);assert.deepEqual(f.calls,[TOOLS.search,TOOLS.open]);
  await assert.rejects(bridge.call(TOOLS.open,{id:'https://example.com'}),/nicht mehr/);
  await assert.rejects(bridge.call(TOOLS.add,{save:true}),/Werkzeugparameter/);
  assert.deepEqual(f.routes,['x']);bridge.dispose();assert.equal(f.definitions.size,0);
  await assert.rejects(bridge.call(TOOLS.favorites,{}),{name:'AbortError'});
});
test('unsupported or partial registration uses the same validation and cleans up',async()=>{
  for(const partial of [false,true]){
    const f=fixture();let transport;
    if(partial){const original=f.registry.registerTool;f.registry.registerTool=(t,o)=>{if(t.name===TOOLS.open)throw Error();original(t,o);};}
    const bridge=connectHubTools(f.local,partial?f.registry:undefined,f.owner,t=>{transport=t;});
    assert.equal((await bridge.call(TOOLS.favorites,{})).total,1);assert.equal(transport,'local');
    assert.equal(f.definitions.size,0);await assert.rejects(bridge.call(TOOLS.search,{ids:'x'}));
    f.state.status='loading';await assert.rejects(bridge.call(TOOLS.search,{}),/nicht verfügbar/);
    bridge.dispose();
  }
});
test('a failure after native dispatch is not replayed and an aborted call never starts',async()=>{
  const f=fixture();
  f.registry.executeTool=async(tool,args)=>{await f.definitions.get(tool.name).execute(args);throw Error('lost response');};
  const bridge=connectHubTools(f.local,f.registry,f.owner);
  await assert.rejects(bridge.call(TOOLS.open,{id:'x'}),/lost response/);
  await assert.rejects(bridge.call(TOOLS.home,{},AbortSignal.abort()),{name:'AbortError'});
  assert.deepEqual(f.routes,['x']);bridge.dispose();
});
