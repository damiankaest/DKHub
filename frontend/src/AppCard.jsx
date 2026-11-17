import React, { useRef, useState } from 'react';
import { Icon } from './Icon';

export function AppCard({ app, onOpen, favorite, onFavorite, active, hidden, onClose, onFocus, onRemove, onEdit }) {
  const [showUrl, setShowUrl] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const input = useRef(null);
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(app.url);
      setCopyMessage('Kopiert');
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopyMessage('Adresse markiert – mit Strg+C kopieren');
    }
  }
  return <article className={`card${active ? ' card-open' : ''}`} hidden={hidden} onPointerDown={active ? onFocus : undefined}>
    {active && <div className="window-bar"><strong>{app.name}</strong><button type="button" className="url-toggle" aria-expanded={showUrl} onClick={() => { setShowUrl(!showUrl); setCopyMessage(''); }}>Adresse</button><a href={app.url} target="_blank" rel="noopener noreferrer">Neuer Tab ↗</a><button type="button" aria-label={`${app.name} schließen`} onClick={onClose}>×</button></div>}
    {active && showUrl && <div className="url-bar"><label>Konfigurierte Adresse<input ref={input} readOnly value={app.url} aria-label={`${app.name} Adresse`} /></label><button type="button" onClick={copyUrl}>Kopieren</button><button type="button" onClick={onEdit}>Bearbeiten</button>{copyMessage && <span role="status">{copyMessage}</span>}</div>}
    <div className="card-preview">
      {app.mode === 'embed'
        ? <><iframe title={`Vorschau ${app.name}`} src={app.url} loading="lazy" referrerPolicy="no-referrer" tabIndex={active ? 0 : -1} /><button type="button" className="preview-open" aria-label={`${app.name} öffnen`} onClick={onOpen}/></>
        : <div className={`preview-placeholder ${app.color}`}><Icon name={app.icon} size={38}/><span>Externer Link</span></div>}
    </div>
    <div className="card-details"><div className="card-top"><h3>{app.name}</h3><button className="favorite-button card-favorite" type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={favorite ? `${app.name} aus Favoriten entfernen` : `${app.name} zu Favoriten hinzufügen`}>{favorite ? '★' : '☆'}</button></div>
      <p>{app.description}</p><div className="card-management"><button className="remove-link" onClick={onEdit}>Bearbeiten</button><button className="remove-link" onClick={onRemove}>Entfernen</button></div><div className="card-bottom"><span>{app.category}</span>{app.mode === 'embed'
        ? <button onClick={onOpen}>Öffnen <Icon name="arrow" size={16}/></button>
        : <a onClick={onOpen} href={app.url} target="_blank" rel="noopener noreferrer">Öffnen <Icon name="arrow" size={16}/></a>}
      </div></div>
  </article>;
}
