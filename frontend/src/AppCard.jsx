import React from 'react';
import { Icon } from './Icon';

export function AppCard({ app, onOpen, favorite, onFavorite, active, hidden, onClose, onFocus, onRemove }) {
  return <article className={`card${active ? ' card-open' : ''}`} hidden={hidden} onPointerDown={active ? onFocus : undefined}>
    {active && <div className="window-bar"><strong>{app.name}</strong><a href={app.url} target="_blank" rel="noopener noreferrer">Neuer Tab ↗</a><button type="button" aria-label={`${app.name} schließen`} onClick={onClose}>×</button></div>}
    <div className="card-preview">
      {app.mode === 'embed'
        ? <><iframe title={`Vorschau ${app.name}`} src={app.url} loading="lazy" referrerPolicy="no-referrer" tabIndex={active ? 0 : -1} /><button type="button" className="preview-open" aria-label={`${app.name} öffnen`} onClick={onOpen}/></>
        : <div className={`preview-placeholder ${app.color}`}><Icon name={app.icon} size={38}/><span>Externer Link</span></div>}
    </div>
    <div className="card-details"><div className="card-top"><h3>{app.name}</h3><button className="favorite-button card-favorite" type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={favorite ? `${app.name} aus Favoriten entfernen` : `${app.name} zu Favoriten hinzufügen`}>{favorite ? '★' : '☆'}</button></div>
      <p>{app.description}</p><button className="remove-link" onClick={onRemove}>Entfernen</button><div className="card-bottom"><span>{app.category}</span>{app.mode === 'embed'
        ? <button onClick={onOpen}>Öffnen <Icon name="arrow" size={16}/></button>
        : <a onClick={onOpen} href={app.url} target="_blank" rel="noopener noreferrer">Öffnen <Icon name="arrow" size={16}/></a>}
      </div></div>
  </article>;
}
