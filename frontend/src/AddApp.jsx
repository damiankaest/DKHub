import React, { useState } from 'react';
import { addApp } from './api';

export function AddApp({ onAdded, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const app = await addApp({ name: fields.get('name'), url: fields.get('url'), description: fields.get('description'), mode: fields.get('mode') }, fields.get('password'));
      onAdded(app);
    } catch (err) {
      setError(err.message || 'Verbindung zum Backend fehlgeschlagen.');
    } finally { setBusy(false); }
  }
  return <section className="add-panel" aria-labelledby="add-title">
    <div className="eyebrow">NEUE KACHEL</div><h2 id="add-title">Anwendung hinzufügen</h2>
    <p>Trage die Adresse einer bereits erreichbaren Webseite ein.</p>
    <form onSubmit={submit} className="add-form">
      <label>Name<input name="name" required maxLength="100" placeholder="z. B. Teamgeist" /></label>
      <label>Webadresse<input name="url" type="url" required maxLength="2048" placeholder="http://192.168.1.10:3000" /></label>
      <label>Beschreibung <span>(optional)</span><input name="description" maxLength="300" placeholder="Worum geht es?" /></label>
      <label>Öffnen<select name="mode" defaultValue="external"><option value="external">In einem neuen Tab</option><option value="embed">Im DKHub einbetten</option></select></label>
      <label>Admin-Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Anwendung speichern'}</button><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Abbrechen</button></div>
    </form>
  </section>;
}
