import React, { useState } from 'react';
import { removeApp } from './api';

export function RemoveApp({ app, onRemoved, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setBusy(true); setError('');
    try { await removeApp(app.id, password); onRemoved(app.id); }
    catch (err) { setError(err.message || 'Verbindung zum Backend fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="add-panel" aria-labelledby="remove-title">
    <h2 id="remove-title">{app.name} entfernen?</h2>
    <p>Die Kachel wird aus DKHub entfernt. Die Webseite selbst bleibt bestehen.</p>
    <form className="add-form" onSubmit={submit}>
      <label>Admin-Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy}>Kachel entfernen</button><button type="button" className="button secondary" onClick={onCancel} disabled={busy}>Abbrechen</button></div>
    </form>
  </section>;
}
