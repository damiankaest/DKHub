import React, { useState } from 'react';

export function AdminSettings({ onClose }) {
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [keys, setKeys] = useState({ typesafe_key:'', openai_key:'' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function call(path, body) {
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json', 'X-DKHub-Admin':password}, body:JSON.stringify(body)});
    if (!response.ok) throw new Error(response.status === 403 ? 'Admin-Passwort oder Anfrage ungültig.' : 'Einstellungen konnten nicht verarbeitet werden.');
    return response.json();
  }
  async function login(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { setData(await call('/api/admin/settings/read', {})); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const update = {enabled:data.enabled, jev_model:data.jev_model, openai_model:data.openai_model};
      for (const [key,value] of Object.entries(keys)) if (value) update[key] = value;
      setData(await call('/api/admin/settings', update)); setKeys({typesafe_key:'',openai_key:''}); setMessage('Einstellungen gespeichert.');
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function remove(key) {
    setBusy(true); setMessage('');
    try { setData(await call('/api/admin/settings', {[key]:''})); setMessage('Schlüssel entfernt.'); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <section className="add-panel" aria-labelledby="admin-title"><div className="eyebrow">VERWALTUNG</div><h2 id="admin-title">Admin-Zentrale</h2>
    <p>KI-Einstellungen und API-Schlüssel werden auf dem Server gespeichert. Bei HTTP werden Passwort und Schlüssel im Netzwerk unverschlüsselt übertragen.</p>
    {!data ? <form className="add-form" onSubmit={login}><label>Admin-Passwort<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label><button className="button primary" disabled={busy}>Anmelden</button></form> :
      <form className="add-form" onSubmit={save}><label><input type="checkbox" checked={data.enabled} onChange={e => setData({...data, enabled:e.target.checked})} /> KI aktivieren</label>
        <label>TypeSafe API-Schlüssel ({data.typesafe_configured ? 'hinterlegt' : 'nicht hinterlegt'})<input type="password" value={keys.typesafe_key} onChange={e => setKeys({...keys, typesafe_key:e.target.value})} placeholder="Zum Ändern eingeben" autoComplete="new-password" /></label>
        {data.typesafe_configured && <button className="button secondary" type="button" disabled={busy} onClick={() => remove('typesafe_key')}>TypeSafe-Schlüssel entfernen</button>}
        <label>OpenAI API-Schlüssel ({data.openai_configured ? 'hinterlegt' : 'nicht hinterlegt'})<input type="password" value={keys.openai_key} onChange={e => setKeys({...keys, openai_key:e.target.value})} placeholder="Zum Ändern eingeben" autoComplete="new-password" /></label>
        {data.openai_configured && <button className="button secondary" type="button" disabled={busy} onClick={() => remove('openai_key')}>OpenAI-Schlüssel entfernen</button>}
        <label>Jev-Modell<input value={data.jev_model} maxLength="100" required onChange={e => setData({...data, jev_model:e.target.value})}/></label>
        <label>OpenAI-Modell<input value={data.openai_model} maxLength="100" required onChange={e => setData({...data, openai_model:e.target.value})}/></label>
        <button className="button primary" disabled={busy}>Einstellungen speichern</button></form>}
    {message && <p role="status">{message}</p>}<button className="button secondary" type="button" onClick={onClose}>Zurück</button>
  </section>;
}
