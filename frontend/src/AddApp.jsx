import React, { useState } from 'react';
import { addApp, updateApp } from './api';

export function AddApp({ app: existing, onAdded, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const details = { name: fields.get('name'), url: fields.get('url'), description: fields.get('description'), mode: fields.get('mode'), route: fields.get('route') || null };
      const app = existing ? await updateApp(existing.id, details, fields.get('password')) : await addApp(details, fields.get('password'));
      onAdded(app);
    } catch (err) {
      setError(err.message || 'Verbindung zum Backend fehlgeschlagen.');
    } finally { setBusy(false); }
  }
  return <section className="add-panel" aria-labelledby="add-title">
    <div className="eyebrow">{existing ? "KACHEL BEARBEITEN" : "NEUE KACHEL"}</div><h2 id="add-title">{existing ? "Anwendung bearbeiten" : "Anwendung hinzufügen"}</h2>
    <p>Trage die Adresse einer bereits erreichbaren Webseite ein.</p>
    <form onSubmit={submit} className="add-form">
      <label>Name<input name="name" defaultValue={existing?.name || ""} required maxLength="100" placeholder="z. B. Teamgeist" /></label>
      <label>Webadresse<input name="url" type="text" defaultValue={existing?.url || ""} required maxLength="2048" placeholder="http://192.168.1.10:3000" /></label>
      <label>Beschreibung <span>(optional)</span><input name="description" defaultValue={existing?.description || ""} maxLength="300" placeholder="Worum geht es?" /></label>
      <label>DKHub-Pfad <span>(optional, z. B. weather)</span><input name="route" defaultValue={existing?.route || ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength="80" placeholder="Automatisch aus dem Namen" /></label>
      <label>Öffnen<select name="mode" defaultValue={existing?.mode || "external"}><option value="external">In einem neuen Tab</option><option value="embed">Im DKHub einbetten</option></select></label>
      <label>Admin-Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Anwendung speichern'}</button><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Abbrechen</button></div>
    </form>
  </section>;
}
