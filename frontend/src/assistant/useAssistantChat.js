import { useCallback, useEffect, useRef, useState } from 'react';
import { decideChat, openInChat, resolveAiReply } from '../chatDecision';

async function requestAi(message,thread,password,signal) {
  const history=thread.filter(m=>!m.error && !m.cancelled).slice(-6).map(({role,text})=>({role,text:text.slice(0,500)}));
  const res=await fetch('/api/chat/ai',{method:'POST',signal,headers:{'Content-Type':'application/json','X-DKHub-Admin':password},
    body:JSON.stringify({message,history})});
  if (!res.ok) throw new Error(({
    403:'Das Admin-Passwort ist ungültig. Prüfe deinen KI-Zugang.',
    429:'Es läuft bereits eine KI-Anfrage. Versuche es gleich noch einmal.',
    503:'Der KI-Chat ist noch nicht eingerichtet. Öffne Einstellungen → KI-Zugänge.',
  })[res.status] || 'Der KI-Dienst ist gerade nicht erreichbar. Du kannst weiter lokal suchen.');
  return res.json();
}

export function useAssistantChat({call,visible,onNavigate,activeId}) {
  const [mode,setMode]=useState('local');
  const [threads,setThreads]=useState({local:[],ai:[]});
  const [input,setInput]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const seq=useRef(0);
  const pending=useRef(null);
  const append=useCallback((key,message)=>{
    const item={...message,id:++seq.current};
    setThreads(old=>({...old,[key]:[...old[key],item].slice(-80)}));
  },[]);
  const cancel=useCallback((announce=true)=>{
    const operation=pending.current;
    if (!operation) return;
    pending.current=null; operation.controller.abort(); setBusy(false);
    if (announce) append(operation.key,{role:'assistant',text:'Anfrage abgebrochen.',cancelled:true});
  },[append]);
  useEffect(()=>{if(!visible){cancel();setPassword('');}},[visible,cancel]);
  useEffect(()=>()=>pending.current?.controller.abort(),[]);

  function switchMode(next) {
    if (mode===next) return;
    cancel();setPassword('');setInput('');setMode(next);
  }
  function reset() {
    cancel(false); setThreads(old=>({...old,[mode]:[]}));setInput('');
  }
  async function run(prompt,app) {
    if (!prompt || pending.current || (!app && mode==='ai' && !password)) return;
    const key=mode;
    const controller=new AbortController();
    const signal=controller.signal;
    pending.current={controller,key};setBusy(true);
    if (!app) setInput('');
    append(key,{role:'user',text:prompt});
    try {
      let response;
      if (app) response=await openInChat(app.id,call,signal);
      else if (key==='local') response=await decideChat(prompt,call,signal,activeId);
      else {
        const reply=await requestAi(prompt,threads.ai,password,signal);
        if (signal.aborted) return;
        response=await resolveAiReply(reply,call,signal,activeId);
        if (['jev','jev+openai'].includes(reply.engine)) response.engine=reply.engine;
      }
      if (!signal.aborted) {
        append(key,{role:'assistant',...response});
        if (response.navigated) onNavigate();
      }
    } catch (err) {
      if (!signal.aborted) append(key,{role:'assistant',error:true,text:err instanceof TypeError?'Die Verbindung ist unterbrochen. Versuche es noch einmal.':(err.message || 'Das hat nicht geklappt.'),retry:app?null:prompt});
    } finally {
      if (pending.current?.controller===controller) {pending.current=null;setBusy(false);}
    }
  }
  return {mode,thread:threads[mode],input,setInput,password,setPassword,busy,switchMode,reset,cancel,
    send:text=>run(text.trim().slice(0,500)),pick:app=>run('Öffne '+app.name,app)};
}
