import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { Notice } from './Notice';
import { VolumeFields, volumePayload } from './VolumeFields';

// Search first, then a short form for the chosen app. onSearch and onInstall throw readable errors.
export function InstallPanel({ locked, onSearch, onInstall }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('latest');
  const [port, setPort] = useState('');
  const [portChoices, setPortChoices] = useState(null);
  const [volumeRows, setVolumeRows] = useState([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const heading = useRef(null);
  const question = useRef(null);
  const queryField = useRef(null);
  useEffect(() => { if (image) heading.current?.focus(); }, [image]);
  useEffect(() => { if (portChoices) question.current?.focus(); }, [portChoices]);

  async function attempt(kind, action) {
    setPending(kind); setError('');
    try { await action(); }
    catch (err) { setError(err.message || 'Verbindung fehlgeschlagen.'); }
    finally { setPending(''); }
  }
  function search(event) {
    event.preventDefault();
    setResults(null);
    attempt('search', async () => setResults(await onSearch(query.trim())));
  }
  function choose(item) {
    setImage(item.name); setName(item.name.split('/').pop()); setTag('latest'); setPort(''); setPortChoices(null); setError('');
    setVolumeRows([]);
  }
  function back() {
    setImage(''); setError('');
    requestAnimationFrame(() => queryField.current?.focus());
  }
  function install(event) {
    event.preventDefault();
    attempt('install', async () => {
      const volumes = volumePayload(volumeRows);
      const ports = await onInstall({ name, image: `${image}:${tag}`,
        ...(port ? { port: Number(port) } : {}), ...(volumes.length ? { volumes } : {}) });
      if (ports) setPortChoices(ports);
    });
  }
  const busy = Boolean(pending);

  if (!image) return <div className="service-box">
    <h2>App suchen</h2>
    <p>Gesucht wird in Docker Hub, einer großen Sammlung fertiger Apps. Am besten funktionieren einfache Web-Apps.</p>
    <form className="director-search" onSubmit={search}>
      <label className="director-label">Wonach suchst du?<input ref={queryField} type="search" required minLength="2" maxLength="100" autoCapitalize="none" autoCorrect="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="z. B. nginx" /></label>
      <button className="button primary" disabled={busy || locked}><Icon name="search" size={16} />Suchen</button>
    </form>
    {locked && <p>Gib oben zuerst das Admin-Passwort ein.</p>}
    {pending === 'search' && <Notice type="busy">Suche läuft …</Notice>}
    {error && <Notice type="error">{error}</Notice>}
    {results?.length === 0 && <Notice>Nichts gefunden. Versuche einen kürzeren oder englischen Begriff.</Notice>}
    {results?.length > 0 && <ul className="director-results" aria-label="Suchergebnisse">{results.map(item => <li className="director-result" key={item.name}>
      <div><strong>{item.name}</strong>{item.official && <span className="official">Offiziell</span>}{item.description && <p>{item.description}</p>}</div>
      <button type="button" className="button secondary" aria-label={`Auswählen: ${item.name}`} onClick={() => choose(item)}>Auswählen</button>
    </li>)}</ul>}
  </div>;

  return <form className="service-box director-install" onSubmit={install}>
    <button type="button" className="button quiet back-link" disabled={busy} onClick={back}><Icon name="back" size={16} />Andere App wählen</button>
    <h2 ref={heading} tabIndex={-1}>{image} installieren</h2>
    <p>Installiere nur Apps, denen du vertraust. Apps mit Zugangsdaten, einer Datenbank oder eigenen Einstellungen benötigen eine zusätzliche Einrichtung.</p>
    <label className="director-label">Name<input required maxLength="60" value={name} disabled={busy} onChange={event => setName(event.target.value)} /><small>So heißt die Kachel in deiner Bibliothek.</small></label>
    {portChoices && <fieldset className="director-port" disabled={busy}>
      <legend>Port der Weboberfläche</legend>
      <p ref={question} tabIndex={-1} role="alert">Eine Rückfrage: {portChoices.length ? 'Diese App nennt mehrere Anschlüsse (Ports). Wähle den für die Webseite, oft ist es 80, 8080 oder 3000.' : 'Diese App verrät nicht, unter welchem Anschluss (Port) ihre Webseite läuft. Die Zahl steht in der Anleitung der App.'}</p>
      {portChoices.length > 0 && <div className="port-choices">{portChoices.map(choice => <button type="button" className="button secondary" key={choice} aria-pressed={port === String(choice)} onClick={() => setPort(String(choice))}>{choice}</button>)}</div>}
      <label className="director-label">Port<input required type="number" inputMode="numeric" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} /></label>
    </fieldset>}
    <details className="service-more">
      <summary>Erweiterte Einstellungen<Icon name="down" size={15} /></summary>
      <p>Normalerweise kannst du alles so lassen.</p>
      <label className="director-label">Version<input required pattern="[A-Za-z0-9_][A-Za-z0-9_.-]*" autoCapitalize="none" value={tag} disabled={busy} onChange={event => { setTag(event.target.value); setPort(''); setPortChoices(null); }} /><small>„latest“ ist meist die neueste Version.</small></label>
      {!portChoices && <label className="director-label">Port (optional)<input type="number" inputMode="numeric" min="1" max="65535" placeholder="wird automatisch erkannt" value={port} disabled={busy} onChange={event => setPort(event.target.value)} /></label>}
    </details>
    <VolumeFields rows={volumeRows} onChange={setVolumeRows} disabled={busy} />
    {pending === 'install' && <Notice type="busy">Die App wird geladen und gestartet. Beim ersten Mal kann das einige Minuten dauern. Bitte bleib auf dieser Seite.</Notice>}
    {error && <Notice type="error">{error}</Notice>}
    {locked && <p>Gib oben zuerst das Admin-Passwort ein.</p>}
    <button className="button primary install-button" disabled={busy || locked}>{pending === 'install' ? 'Wird installiert …' : error ? 'Erneut versuchen' : 'Installieren und starten'}</button>
  </form>;
}
