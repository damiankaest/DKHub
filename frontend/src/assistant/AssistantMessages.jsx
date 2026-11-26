import React, { useState } from 'react';
import { Icon } from '../Icon';
import { SignalArt, SignalMark } from './AssistantArt';

export function AssistantWelcome({mode,apps,activeId,disabled,onSend}) {
  const active = apps.find(app=>app.id===activeId);
  const first = apps.find(app=>app.mode==='embed') || apps[0];
  const choices = [
    {icon:'grid', label:'Apps entdecken', hint:'Deine Bibliothek durchsuchen', prompt:'Zeige alle Apps'},
    {icon:'star', label:'Meine Favoriten', hint:'Gemerkte Apps anzeigen', prompt:'Zeige meine Favoriten'},
    {icon:'clock', label:'Zuletzt geöffnet', hint:'Deinen Verlauf anzeigen', prompt:'Zuletzt geöffnet'},
    active ? {icon:'close',label:'Aktuelle Ansicht schließen',hint:active.name,prompt:'Schließe die aktuelle App'} :
    first ? {icon:'window',label:first.name+' öffnen', hint:first.category, prompt:'Öffne '+first.name} :
      {icon:'plus',label:'Eine App hinzufügen',hint:'Das Formular im Hub öffnen',prompt:'App hinzufügen'},
  ];
  return <div className="assistant-welcome">
    <div className="assistant-signal"><SignalArt/></div>
    <h3>{mode==='local'?'Wohin im Hub?':'Was hast du vor?'}</h3>
    <p>{mode==='local'?'Finde eine App, öffne sie hier oder rufe deine Favoriten auf.':'Sag mir, welche App du öffnen, suchen oder schließen möchtest.'}</p>
    <div className="assistant-starters" aria-label="Vorschläge">{choices.map(c=><button key={c.icon} onClick={()=>onSend(c.prompt)} disabled={disabled}>
      <span className="assistant-choice-icon"><Icon name={c.icon} size={17}/></span><span><strong>{c.label}</strong><small>{c.hint}</small></span><Icon name="next" size={15}/>
    </button>)}</div>
  </div>;
}

function AppResults({ids,total,apps,onPick,onExternal,disabled}) {
  const [expanded,setExpanded]=useState(false);
  const list=(ids||[]).map(id=>apps.find(a=>a.id===id)).filter(Boolean);
  if (!list.length) return null;
  return <div className="assistant-results">
    {(expanded?list:list.slice(0,4)).map(app=>{
      const label=app.name+(app.mode==='embed'?' öffnen':' im neuen Tab öffnen');
      const content=<><span className="result-symbol"><Icon name={app.mode==='embed'?'window':'globe'} size={16}/></span>
        <span><strong>{app.name}</strong><small>{app.category} · {app.mode==='embed'?'Im Hub':'Neuer Tab'}</small></span><Icon name={app.mode==='embed'?'next':'external'} size={15}/></>;
      return app.mode==='embed'? <button key={app.id} type="button" className="assistant-result" aria-label={label} disabled={disabled} onClick={()=>onPick(app)}>{content}</button> :
        <a key={app.id} className="assistant-result" aria-label={label} href={app.url} target="_blank" rel="noopener noreferrer" onClick={()=>onExternal(app)}>{content}</a>;
    })}
    {list.length>4 && <button className="assistant-more" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Weniger anzeigen':(list.length-4)+' weitere anzeigen'}</button>}
    {total>list.length && <small className="assistant-truncated">Die ersten {list.length} Treffer. Mit einem Suchbegriff kannst du eingrenzen.</small>}
  </div>;
}

export function AssistantMessage({message,apps,onPick,onExternal,onRetry,disabled}) {
  const own=message.role==='user';
  return <article className={'assistant-entry '+(own?'from-user':'from-hub')}>
    <span className="entry-author">{!own && <SignalMark size={16}/>} {own?'Du':'DK-Assistent'}{message.engine && <small> · {message.engine==='jev'?'Jev':'Jev + OpenAI'}</small>}</span>
    <div className={'entry-body'+(message.error?' entry-error':'')}><p>{message.text}</p>
      {!own && <AppResults ids={message.ids} total={message.total} apps={apps} onPick={onPick} onExternal={onExternal} disabled={disabled}/>}
      {message.retry && <button type="button" className="assistant-more" disabled={disabled} onClick={()=>onRetry(message.retry)}>Erneut versuchen</button>}
    </div>
  </article>;
}
