import React from 'react';
import { Icon } from './Icon';

export function AppCard({ app, onOpen }) {
  return <article className="card">
    <div className="card-top"><span className={`app-icon ${app.color}`}><Icon name={app.icon} size={24}/></span><span className="card-type">{app.label}</span></div>
    <h3>{app.name}</h3><p>{app.description}</p>
    <div className="card-bottom"><span>{app.category}</span>{app.mode === 'embed'
      ? <button onClick={onOpen}>Öffnen <Icon name="arrow" size={16}/></button>
      : <a href={app.url} target="_blank" rel="noopener noreferrer">Öffnen <Icon name="arrow" size={16}/></a>}
    </div>
  </article>;
}
