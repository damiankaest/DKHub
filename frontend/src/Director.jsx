import React, { useState } from 'react';

async function call(path, password, body) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DKHub-Admin': password },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 403) throw new Error('Admin-Passwort oder Anfrage ist ungültig.');
  if (response.status === 503) throw new Error('DKDirector ist nicht erreichbar oder noch nicht eingerichtet.');
  if (!response.ok) throw new Error('Aktion fehlgeschlagen. Prüfe den Dienstzustand, bevor du erneut versuchst.');
  return response.json();
}

export function Director({ onClose, onCatalogChanged }) {
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [services, setServices] = useState([]);
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('latest');
  const [port, setPort] = useState('80');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action) {
    setBusy(true); setMessage('');
    try { await action(); } catch (err) { setMessage(err.message || 'Verbindung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  async function refresh() { setServices(await call('/api/director/list', password)); }
  function search(event) {
    event.preventDefault();
    run(async () => setResults(await call(`/api/director/search?${new URLSearchParams({ q: query.trim() })}`, password)));
  }
  function install(event) {
    event.preventDefault();
    run(async () => {
      const service = await call('/api/director/install', password, { name, image: `${image}:${tag}`, port: Number(port) });
      setMessage(`${service.name} wurde gestartet und als Kachel hinzugefügt.`);
      setImage(''); await onCatalogChanged(); await refresh();
    });
  }
  return <section className="director-panel">
    <div className="director-head"><div><div className="eyebrow">DKDIRECTOR</div><h1>Dienste verwalten</h1><p>Suche öffentliche Docker-Hub-Images und verwalte deine DKHub-Dienste.</p></div><button className="button secondary" onClick={onClose}>Zurück</button></div>
    <label className="director-label">Admin-Passwort<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
    <form className="director-search" onSubmit={search}><label className="director-label">Docker Hub durchsuchen<input required minLength="2" maxLength="100" value={query} onChange={event => setQuery(event.target.value)} placeholder="z. B. nginx" /></label><button className="button primary" disabled={busy || !password}>Suchen</button></form>
    {message && <p className="director-message" role="status">{message}</p>}
    {results.length > 0 && <div className="director-results">{results.map(item => <div className="director-result" key={item.name}><div><strong>{item.name}</strong>{item.official && <small> Offiziell</small>}<p>{item.description}</p></div><button className="button secondary" onClick={() => { setImage(item.name); setName(item.name.split('/').pop()); }}>Auswählen</button></div>)}</div>}
    {image && <form className="director-install" onSubmit={install}><h2>Installation vorbereiten</h2><p>Image: <strong>{image}</strong>. Nur vertrauenswürdige Images ausführen. Diese erste Version richtet keine Volumes, Datenbanken oder Umgebungsvariablen ein.</p><div className="director-fields"><label className="director-label">Name<input required maxLength="60" value={name} onChange={event => setName(event.target.value)} /></label><label className="director-label">Version / Tag<input required pattern="[A-Za-z0-9_][A-Za-z0-9_.-]*" value={tag} onChange={event => setTag(event.target.value)} /></label><label className="director-label">Interner Port<input required type="number" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} /></label></div><button className="button primary" disabled={busy || !password}>Image installieren und starten</button></form>}
    <div className="director-services"><div className="director-services-head"><h2>Meine Dienste</h2><button className="button secondary" disabled={busy || !password} onClick={() => run(refresh)}>Aktualisieren</button></div>{services.length === 0 && <p>Aktualisiere die Liste, um deine Dienste zu sehen.</p>}{services.map(service => <div className="director-service" key={service.id}><div><strong>{service.name}</strong><p>{service.image} · {service.state} {service.host_port ? `· Port ${service.host_port}` : ''}</p></div><button className="button secondary" disabled={busy} onClick={() => run(async () => { await call(`/api/director/services/${service.id}/${service.state === 'running' ? 'stop' : 'start'}`, password); await refresh(); })}>{service.state === 'running' ? 'Stoppen' : 'Starten'}</button></div>)}</div>
  </section>;
}
