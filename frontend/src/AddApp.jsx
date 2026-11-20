import React, { useState } from 'react';
import { addApp, updateApp } from './api';

export function AddApp({ app: existing, categories = [], onAdded, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(existing?.url || '');
  const [preview, setPreview] = useState('');
  const [image, setImage] = useState(existing?.image || '');
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState(existing?.description || '');
  const [manifest, setManifest] = useState(existing?.manifest || '');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [previewError, setPreviewError] = useState('');
  function testPreview() {
    const value = url.trim();
    try {
      const parsed = new URL(value, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || (!/^https?:\/\//i.test(value) && !(value.startsWith('/') && !value.startsWith('//')))) throw new Error();
      setPreviewError('');
      setPreview(parsed.href);
    } catch { setPreview(''); setPreviewError('Bitte gib eine gültige HTTP- oder HTTPS-Adresse ein.'); }
  }
  async function analyze(event) {
    const form = event.currentTarget.form;
    const fields = new FormData(form);
    setBusy(true); setAnalysisMessage('');
    try {
      const response = await fetch('/api/admin/analyze', {method:'POST', headers:{'Content-Type':'application/json', 'X-DKHub-Admin':fields.get('password')}, body:JSON.stringify({url:url.trim(), name:fields.get('name') || ''})});
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Analyse fehlgeschlagen.');
      setDescription(data.description); setManifest(data.manifest); setAnalysisMessage('Vorschlag erstellt. Bitte prüfen und bei Bedarf bearbeiten.');
    } catch (error) { setAnalysisMessage(error.message || 'Analyse fehlgeschlagen.'); } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      let savedImage = image;
      if (file) {
        if (file.size > 2 * 1024 * 1024) throw new Error('Das Bild darf höchstens 2 MB groß sein.');
        const response = await fetch('/api/admin/images', {method:'POST', headers:{'X-DKHub-Admin':fields.get('password'), 'Content-Type':file.type || 'application/octet-stream'}, body:file});
        if (!response.ok) throw new Error(response.status === 403 ? 'Admin-Passwort oder Anfrage ungültig.' : 'Bild konnte nicht gespeichert werden. Bitte PNG, JPEG oder WebP bis 2 MB verwenden.');
        savedImage = (await response.json()).image;
      }
      const details = { image:savedImage, name: fields.get('name'), url: fields.get('url'), description: fields.get('description'), manifest, category: fields.get('category').trim() || 'Meine Apps', mode: fields.get('mode'), route: fields.get('route') || null };
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
      <label>Webadresse<input name="url" type="text" value={url} onChange={event => { setUrl(event.target.value); setPreview(''); setPreviewError(''); }} required maxLength="2048" placeholder="http://192.168.1.10:3000" /></label>
      <div className="embed-test"><button className="button secondary" type="button" onClick={testPreview}>Einbettung testen</button><p>Prüfe die Vorschau: Ist die Seite sichtbar, kannst du sie einbetten. Manche Anbieter blockieren dies oder verlangen eine Anmeldung.</p>
        {previewError && <p className="form-error" role="alert">{previewError}</p>}
        {preview && <div className="embed-test-frame"><iframe title="Einbettungsvorschau" src={preview} referrerPolicy="no-referrer" /></div>}
      </div>
      <div className="embed-test"><p>Die Analyse lädt die Seite vom Server und sendet lesbare Inhalte an OpenAI. Kosten können entstehen. Nur Seiten analysieren, deren Inhalte du teilen möchtest.</p><button type="button" className="button secondary" onClick={analyze} disabled={busy || !url}>Mit KI beschreiben</button>{analysisMessage && <p role="status">{analysisMessage}</p>}</div>
      <label>Kachelbild <span>(optional, PNG/JPEG/WebP bis 2 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      {image && !file && <div><img className="form-image" src={image} alt="Aktuelles Kachelbild" /><button type="button" className="button secondary" onClick={() => setImage('')}>Bild entfernen</button></div>}
      <label>Kategorie<input name="category" list="app-categories" defaultValue={existing?.category || 'Meine Apps'} maxLength="80" placeholder="z. B. Fitness" /></label>
      <datalist id="app-categories">{categories.map(category => <option key={category} value={category} />)}</datalist>
      <label>Beschreibung <span>(optional)</span><input name="description" value={description} onChange={e => setDescription(e.target.value)} maxLength="300" placeholder="Worum geht es?" /></label>
      <label>Ausführliche Beschreibung für die Suche <span>(optional)</span><textarea value={manifest} onChange={e => setManifest(e.target.value)} maxLength="3000" rows="5" /></label>
      <label>DKHub-Pfad <span>(optional, z. B. weather)</span><input name="route" defaultValue={existing?.route || ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength="80" placeholder="Automatisch aus dem Namen" /></label>
      <label>Öffnen<select name="mode" defaultValue={existing?.mode || "external"}><option value="external">In einem neuen Tab</option><option value="embed">Im DKHub einbetten</option></select></label>
      <label>Admin-Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Anwendung speichern'}</button><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Abbrechen</button></div>
    </form>
  </section>;
}
