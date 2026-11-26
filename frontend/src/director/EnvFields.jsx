import React, { useRef, useState } from 'react';
import { Icon } from '../Icon';

const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

// Random hex works over plain http too, unlike most of the Web Crypto API.
export function randomSecret() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function envPayload(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value) continue;
    if (!KEY.test(key)) throw new Error('Variablennamen bestehen aus Buchstaben, Ziffern und Unterstrichen und beginnen nicht mit einer Ziffer.');
    if (!row.value) {
      if (row.required) throw new Error(`Die Einstellung ${key} wird von der App benötigt.`);
      continue;
    }
    if (seen.has(key)) throw new Error(`Die Einstellung ${key} steht doppelt in der Liste.`);
    seen.add(key);
    result.push({ key, value: row.value });
  }
  return result;
}

export function EnvFields({ rows, onChange, suggestions = [], disabled, open }) {
  const nextId = useRef(1000);
  const [shown, setShown] = useState({});
  const update = (id, field, value) => onChange(rows.map(row => row.id === id ? { ...row, [field]: value } : row));

  return <details className="service-more" open={open || undefined}>
    <summary>Einstellungen der App{rows.length > 0 && ` (${rows.length})`}<Icon name="down" size={15} /></summary>
    <p>Umgebungsvariablen, wie sie in der Anleitung der App stehen. Passwörter und Schlüssel bleiben auf deinem Server.</p>
    <div className="director-storage">
      {rows.map((row, index) => <fieldset className="storage-fields" key={row.id} disabled={disabled}>
        <legend>{row.label || `Einstellung ${index + 1}`}{row.required ? ' (benötigt)' : ''}</legend>
        <label className="director-label">Name<input value={row.key} maxLength={128} placeholder="z. B. TZ" onChange={event => update(row.id, 'key', event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <label className="director-label">Wert<input type={row.secret && !shown[row.id] ? 'password' : 'text'} value={row.value} maxLength={4096} autoComplete="off" onChange={event => update(row.id, 'value', event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        {row.secret && <button type="button" className="button quiet" onClick={() => setShown({ ...shown, [row.id]: !shown[row.id] })}>{shown[row.id] ? 'Verbergen' : 'Anzeigen'}</button>}
        {row.generate && <button type="button" className="button quiet" onClick={() => update(row.id, 'value', randomSecret())}>Neu erzeugen</button>}
        <button type="button" className="button quiet" aria-label={`${row.key || `Einstellung ${index + 1}`} entfernen`} onClick={() => onChange(rows.filter(other => other.id !== row.id))}>Entfernen</button>
      </fieldset>)}
      <datalist id="env-suggestions">{suggestions.map(name => <option key={name} value={name} />)}</datalist>
      <button type="button" className="button secondary" disabled={disabled || rows.length >= 64} onClick={() => onChange([...rows, { id: nextId.current++, key: '', value: '' }])}><Icon name="plus" size={16} />Einstellung hinzufügen</button>
    </div>
  </details>;
}
