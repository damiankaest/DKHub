import React, { useRef } from 'react';
import { Icon } from '../Icon';
import './storage.css';

export function volumePayload(rows) {
  const volumes = rows.map(({ key, target }) => ({ key: key.trim(), target: target.trim() }));
  const keys = new Set();
  for (const { key, target } of volumes) {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(key)) {
      throw new Error('Gib jedem Volume einen Schlüssel aus Kleinbuchstaben, Ziffern oder Bindestrichen. Er muss mit einem Buchstaben oder einer Ziffer beginnen.');
    }
    if (keys.has(key)) throw new Error('Verwende jeden Volume-Schlüssel nur einmal.');
    keys.add(key);
    if (!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(target)
        || target.split('/').some(part => part === '.' || part === '..')) {
      throw new Error('Gib für jedes Volume einen absoluten Linux-Pfad wie /data an, ohne abschließenden Schrägstrich oder Punktsegmente.');
    }
    if (volumes.some(other => other.target.startsWith(target + '/'))
        || volumes.filter(other => other.target === target).length > 1) {
      throw new Error('Die Volume-Pfade müssen eindeutig sein und dürfen sich nicht überlappen.');
    }
  }
  return volumes;
}

export function VolumeFields({ rows, onChange, disabled, open }) {
  const nextId = useRef(0);
  function update(id, field, value) {
    onChange(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  }

  return <details className="service-more" open={open || undefined}>
    <summary>Dauerhafte Daten{rows.length > 0 && ` (${rows.length})`}<Icon name="down" size={15} /></summary>
    <p>Optional. Schau in der Anleitung des Images nach dem Datenpfad. Ein Volume erhält die Daten beim Stoppen und Starten, wenn die App tatsächlich in diesen Pfad schreibt.</p>
    <div className="director-storage">
      {rows.map(({ id, key, target, label }, index) => <fieldset className="storage-fields" key={id} disabled={disabled}>
        <legend>{label || `Volume ${index + 1}`}</legend>
        <label className="director-label">Schlüssel<input maxLength={32} placeholder="z. B. daten" value={key} onChange={event => update(id, 'key', event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <label className="director-label">Container-Mountpfad<input maxLength={255} placeholder="/data" value={target} onChange={event => update(id, 'target', event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
        <button type="button" className="button quiet" aria-label={`Volume ${index + 1} entfernen`} onClick={() => onChange(rows.filter(row => row.id !== id))}>Entfernen</button>
      </fieldset>)}
      <button type="button" className="button secondary" disabled={disabled || rows.length >= 16} onClick={() => onChange([...rows, { id: nextId.current++, key: '', target: '' }])}><Icon name="plus" size={16} />Volume hinzufügen</button>
    </div>
  </details>;
}
