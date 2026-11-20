import React, { useState } from 'react';
import { ThemeStudio } from './themes/ThemeStudio';
import { Icon } from './Icon';

const emptyKeys = { typesafe_key:'', openai_key:'' };
export function AdminSettings({ onClose, appearance }) {
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [keys, setKeys] = useState(emptyKeys);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState('design');

  async function submit(path, body, success) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json', 'X-DKHub-Admin':password}, body:JSON.stringify(body)});
      if (!res.ok) throw new Error(res.status === 403 ? 'Admin-Passwort oder Anfrage ungültig.' : res.status === 503 ? 'Auf dem Server ist kein Admin-Passwort eingerichtet.' : 'Einstellungen konnten nicht geladen oder gespeichert werden.');
      setData(await res.json()); setKeys(emptyKeys);
      if (success) setMessage({text:success});
    } catch (e) { setMessage({error:true, text:e.message}); }
    finally { setBusy(false); }
  }
  function save(e) {
    e.preventDefault();
    const update = {enabled:data.enabled, jev_model:data.jev_model, openai_model:data.openai_model};
    for (const [key,value] of Object.entries(keys)) if (value) update[key] = value;
    submit('/api/admin/settings', update, 'Einstellungen gespeichert.');
  }
  return <section className={'settings-panel panel ' + (!data ? 'login-panel' : '')} aria-labelledby="admin-title">
    <div className="panel-title"><div><span className="kicker">VERWALTUNG</span><h1 id="admin-title">Einstellungen</h1></div>
      <button className="button quiet" onClick={onClose}>Zurück</button></div>
    {!data ? <><div className="login-emblem"><Icon name="settings" size={25}/></div><h2>Admin-Zugang</h2><p>Hier gestaltest du den Hub für alle Geräte und verwaltest die KI-Zugänge.</p>
      <form className="add-form" onSubmit={e=>{e.preventDefault(); submit('/api/admin/settings/read', {});}}>
        <label>Admin-Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>
        <button className="button primary" disabled={busy}>{busy ? 'Prüft …' : 'Anmelden'}</button></form></> : <>
      <nav className="segmented settings-pages" aria-label="Einstellungsbereiche">{[['design','Design-Studio','palette'],['ai','KI-Zugänge','spark']].map(([id,label,icon])=>
        <button type="button" key={id} aria-pressed={page === id} disabled={busy} onClick={()=>{setPage(id);setMessage(null);}}><Icon name={icon} size={16}/>{label}</button>)}</nav>
      {page === 'design' ? <ThemeStudio password={password} appearance={appearance} aiReady={data.enabled && data.openai_configured}/> :
        <form className="add-form" onSubmit={save}><div className="section-intro"><h2>KI-Zugänge</h2><p>Für die Chatsteuerung genügt TypeSafe (Jev). OpenAI ist optional für Empfehlungen, freie Antworten und Entwürfe. Schlüssel bleiben auf dem Server; verwende zum Eingeben localhost oder HTTPS.</p></div>
          <label className="check-line"><input type="checkbox" checked={data.enabled} onChange={e=>setData({...data,enabled:e.target.checked})}/>KI aktivieren</label>
          {[['typesafe_key','typesafe_configured','TypeSafe','jev_model','Jev'],['openai_key','openai_configured','OpenAI','openai_model','OpenAI']].map(([key,flag,provider,model,title])=>
            <fieldset key={key}><legend>{provider}</legend><label>{provider} API-Schlüssel ({data[flag] ? 'hinterlegt' : 'nicht hinterlegt'})<input type="password" maxLength={500} value={keys[key]} onChange={e=>setKeys({...keys,[key]:e.target.value})} placeholder="Zum Ändern eingeben" autoComplete="new-password"/></label>
              <label>{title}-Modell<input value={data[model]} maxLength={100} required onChange={e=>setData({...data,[model]:e.target.value})}/></label>
              {data[flag] && <button className="button danger-quiet" type="button" disabled={busy} onClick={()=>submit('/api/admin/settings', {[key]:''}, 'Schlüssel entfernt.')}>{provider}-Schlüssel entfernen</button>}</fieldset>)}
          <button className="button primary" disabled={busy}>Einstellungen speichern</button></form>}
    </>}
    {message && <p className={'feedback ' + (message.error ? 'error' : '')} role={message.error?'alert':'status'}>{message.text}</p>}
  </section>;
}
