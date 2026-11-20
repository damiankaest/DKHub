import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createHubTools } from './hubTools';
import { connectHubTools } from './webMcp';

export function useHubTools(state) {
  const latest = useRef(state);
  const bridge = useRef(null);
  const [transport,setTransport] = useState('local');
  useLayoutEffect(()=>{latest.current=state;});
  useLayoutEffect(()=>{
    let registry;
    try { registry=document.modelContext; } catch { /* Unsupported execution context. */ }
    const connection=connectHubTools(createHubTools(()=>latest.current),registry,window,setTransport);
    bridge.current=connection;
    return ()=>{connection.dispose();bridge.current=null;};
  },[]);
  const call=useCallback((name,input,signal)=>bridge.current.call(name,input,signal),[]);
  return {call,transport};
}
