import React, { useState } from 'react';
import { reorderApps } from './api';
import { useAuthRequired } from './auth';

function move(items, id, target) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0 || target < 0 || target >= items.length || from === target) return items;
  const next = [...items];
  next.splice(target, 0, next.splice(from, 1)[0]);
  return next;
}

export function ReorderApps({ apps, onSaved, onCancel }) {
  const [items, setItems] = useState(apps);
  const [dragging, setDragging] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const authRequired = useAuthRequired();
  async function save(event) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setError(''); setBusy(true);
    try { onSaved(await reorderApps(items.map(item => item.id), password)); }
    catch (err) { setError(err.message || 'Verbindung zum Backend fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="sort-panel" aria-labelledby="sort-title">
    <div className="eyebrow">STARTSEITE GESTALTEN</div><h2 id="sort-title">Apps sortieren</h2>
    <p>Ziehe die Apps an die gewünschte Stelle oder verschiebe sie mit den Pfeilen.</p>
    <ol className="sort-list">{items.map((item, index) => <li key={item.id} className={dragging === item.id ? 'sort-row dragging' : 'sort-row'} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setItems(current => move(current, dragging, index)); setDragging(null); }}>
      <span className="drag-handle" draggable={!busy} onDragStart={event => { setDragging(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }} onDragEnd={() => setDragging(null)} aria-hidden="true">⠿</span>
      <span className="sort-name">{item.name}</span><span className="sort-controls"><button type="button" disabled={busy || index === 0} aria-label={`${item.name} nach oben`} onClick={() => setItems(current => move(current, item.id, index - 1))}>↑</button><button type="button" disabled={busy || index === items.length - 1} aria-label={`${item.name} nach unten`} onClick={() => setItems(current => move(current, item.id, index + 1))}>↓</button></span>
    </li>)}</ol>
    <form onSubmit={save} className="sort-form">{authRequired && <label>Admin-Passwort<input name="password" type="password" autoComplete="current-password" required /></label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Speichert …' : 'Reihenfolge speichern'}</button><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Abbrechen</button></div></form>
  </section>;
}
