import React, { useState } from 'react';
import { Icon } from '../Icon';
import { randomSecret } from './EnvFields';
import { Notice } from './Notice';

// Paste a docker-compose.yml; onImport receives the form fields of the chosen service.
export function ComposeImport({ disabled, onImport }) {
  const [text, setText] = useState('');
  const [services, setServices] = useState(null);
  const [error, setError] = useState('');

  // The YAML parser is only fetched when somebody actually imports a file.
  const parser = () => import('./composeFile');

  async function take(list, key) {
    try { onImport((await parser()).readService(list, key, randomSecret)); }
    catch (err) { setError(err.message); }
  }
  async function submit(event) {
    event.preventDefault();
    setError(''); setServices(null);
    try {
      const list = (await parser()).parseCompose(text);
      // With several containers the user decides which one is the app.
      if (list.length > 1) setServices(list);
      else await take(list, list[0].key);
    } catch (err) { setError(err.message); }
  }

  return <details className="service-more compose-import">
    <summary>Stattdessen docker-compose.yml einfügen<Icon name="down" size={15} /></summary>
    <p>Viele Apps zeigen in ihrer Anleitung eine solche Datei. DKHub übernimmt daraus App, Port, Datenordner und Einstellungen. Du prüfst alles, bevor etwas installiert wird.</p>
    <form onSubmit={submit}>
      <label className="director-label">Inhalt der docker-compose.yml<textarea rows="8" value={text} maxLength={100000} spellCheck={false} autoCapitalize="none" placeholder={'services:\n  app:\n    image: beispiel/app:latest'} onChange={event => { setText(event.target.value); setServices(null); setError(''); }} /></label>
      <button className="button secondary" disabled={disabled || !text.trim()}>Übernehmen</button>
    </form>
    {services && <div role="group" aria-label="Welcher Container ist die App?">
      <p>Die Datei enthält mehrere Container. Welcher ist die App mit der Webseite?</p>
      <div className="port-choices">{services.map(service => <button type="button" className="button secondary" key={service.key} disabled={disabled || !service.image} onClick={() => take(services, service.key)}>{service.key}</button>)}</div>
    </div>}
    {error && <Notice type="error">{error}</Notice>}
  </details>;
}
