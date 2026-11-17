import React from 'react';

export function QuickLinks({ title, ids, apps, selectedId, onOpen }) {
  const items = ids.map(id => apps.find(app => app.id === id)).filter(Boolean);
  if (!items.length) return null;
  return <div className="quick-group"><div className="quick-title">{title}</div><div className="quick-links">
    {items.map(app => app.mode === 'embed'
      ? <button key={app.id} className={selectedId === app.id ? 'quick-link current' : 'quick-link'} onClick={() => onOpen(app)} aria-current={selectedId === app.id ? 'page' : undefined}>{app.name}</button>
      : <a key={app.id} className="quick-link" href={app.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(app)}>{app.name} ↗</a>)}
  </div></div>;
}
