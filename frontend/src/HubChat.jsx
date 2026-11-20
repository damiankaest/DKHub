import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { AssistantMessage, AssistantWelcome } from './assistant/AssistantMessages';
import { SignalMark } from './assistant/AssistantArt';
import { useAssistantChat } from './assistant/useAssistantChat';

const compactQuery='(max-width: 959px)';
const compact=()=>window.matchMedia(compactQuery).matches;
const subscribe=cb=>{const media=window.matchMedia(compactQuery);media.addEventListener('change',cb);return ()=>media.removeEventListener('change',cb);};

function AiAccess({password,setPassword}) {
  const [expanded,setExpanded]=useState(true);
  return <details className="assistant-access" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
        <summary><Icon name="key" size={16}/>KI-Zugang <small>{password?'Eingegeben':'Admin-Passwort erforderlich'}</small></summary>
        <label>Admin-Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Passwort für diesen Hub"/></label>
        <p>Für KI-Antworten erhält TypeSafe deine Nachricht. OpenAI erhält zusätzlich den KI-Verlauf und die App-Beschreibungen. Es können Kosten entstehen.</p>
      </details>;
}

export function HubChat({apps,context,tools,visible,onClose,onExternal}) {
  const narrow=useSyncExternalStore(subscribe,compact,()=>false);
  const sheet=useRef(null);
  const field=useRef(null);
  const heading=useRef(null);
  const log=useRef(null);
  const follow=useRef(true);
  const chat=useAssistantChat({call:tools.call,visible,onNavigate:()=>{if(narrow) onClose(false);}});
  const {mode,thread,input,password,busy}=chat;
  const needsKey=mode==='ai' && !password.trim();
  useLayoutEffect(()=>{
    if(!visible) return;
    const dialog=sheet.current;
    const body=document.body;
    const overflow=body.style.overflow;
    if (narrow && dialog) {
      dialog.showModal();body.style.overflow='hidden';
      heading.current?.focus({preventScroll:true});
    } else field.current?.focus({preventScroll:true});
    return ()=>{
      if (dialog?.open) dialog.close();
      if (narrow) body.style.overflow=overflow;
    };
  },[visible,narrow]);
  useEffect(()=>{
    if (visible && follow.current && log.current) log.current.scrollTop=log.current.scrollHeight;
  },[visible,thread,busy,mode]);
  function send(text) {
    if (needsKey || !text.trim() || busy) return;
    follow.current=true;void chat.send(text);
  }
  function changeMode(next) {follow.current=true;chat.switchMode(next);}
  function close() {chat.cancel();onClose();}
  if(!visible) return null;
  const panel=<>
    <header className="assistant-head"><span className="assistant-emblem"><SignalMark size={27}/></span>
      <div className="assistant-identity"><h2 ref={heading} tabIndex="-1" id="assistant-title">DK-Assistent</h2><p>{context}</p></div>
      <button type="button" className="icon-button assistant-reset" title="Neuer Chat" aria-label="Neuer Chat" disabled={!thread.length && !input} onClick={()=>{chat.reset();field.current?.focus();}}><Icon name="compose" size={18}/></button>
      <button type="button" className="icon-button" title="Chat schließen" aria-label="Chat schließen" onClick={close}><Icon name="close" size={20}/></button>
    </header>
    <div className="assistant-modebar"><div className="assistant-modes" role="group" aria-label="Antwortmodus">
      <button type="button" aria-pressed={mode==='local'} onClick={()=>changeMode('local')}><Icon name="library" size={15}/>Lokal</button>
      <button type="button" aria-pressed={mode==='ai'} onClick={()=>changeMode('ai')}><Icon name="spark" size={16}/>KI-Chat</button>
    </div><span className="assistant-modehint">{mode==='local'?'Ohne Cloud':'Jev + OpenAI'}</span></div>
    <div className="assistant-scroll" ref={log} onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<44;}}>
      {mode==='ai' && <AiAccess password={password} setPassword={chat.setPassword}/>}
      {!thread.length && <AssistantWelcome mode={mode} apps={apps} disabled={needsKey||busy} onSend={send}/>}
      <div className="assistant-thread" role="log" aria-live="polite" aria-label="Chatverlauf" aria-relevant="additions">
        {thread.map(m=><AssistantMessage key={m.id} message={m} apps={apps} onPick={app=>{follow.current=true;void chat.pick(app);}} onExternal={onExternal} onRetry={send} disabled={busy}/>)}
        {busy && <p className="assistant-thinking"><SignalMark size={17}/>{mode==='ai'?'Der Assistent antwortet …':'Einen Moment …'}</p>}
      </div>
    </div>
    <footer className="assistant-foot">
      <form className="assistant-composer" onSubmit={e=>{e.preventDefault();send(input);}}>
        <label className="sr-only" htmlFor="assistant-input">Nachricht an DKHub</label>
        <textarea rows="2" ref={field} id="assistant-input" value={input} maxLength={500} onChange={e=>chat.setInput(e.target.value)}
          placeholder={mode==='local'?'Eine App suchen oder öffnen …':'Was möchtest du machen?'} onKeyDown={e=>{
            if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode!==229){e.preventDefault();send(input);}
          }}/>
        <div className="composer-actions"><span className="composer-caption">{input.length >= 400 ? input.length + ' / 500' : ''}</span>
          {busy?<button type="button" className="assistant-send" aria-label="Antwort abbrechen" title="Antwort abbrechen" onClick={()=>chat.cancel()}><Icon name="stop" size={16}/></button>:
            <button type="submit" className="assistant-send" aria-label="Nachricht senden" title="Nachricht senden" disabled={!input.trim() || needsKey}><Icon name="send" size={17}/></button>}
        </div>
      </form>
      <div className="assistant-footnote"><span title={tools.transport==='webmcp'?'Dieser Browser führt die DKHub-Werkzeuge über WebMCP aus.':'DKHub führt die Werkzeuge direkt im Browser aus.'}><Icon name="link" size={13}/>{tools.transport==='webmcp'?'WebMCP':'Hub-Werkzeuge'}</span><span className="assistant-keyhint">Enter sendet · ⇧ Enter für neue Zeile</span></div>
    </footer>
  </>;
  return narrow?<dialog id="dk-assistant" ref={sheet} aria-labelledby="assistant-title" className="assistant-panel assistant-sheet"
    onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}}>{panel}</dialog>:
    <aside id="dk-assistant" aria-labelledby="assistant-title" className="assistant-panel assistant-dock" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}}}>{panel}</aside>;
}
