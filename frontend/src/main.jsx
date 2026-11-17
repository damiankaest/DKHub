import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getApps } from './api';
import './styles.css';

import { Icon } from './Icon';
import { AppCard } from './AppCard';
import { AddApp } from './AddApp';
import { QuickLinks } from './QuickLinks';
import { loadIds, saveIds, rememberRecent, toggleFavorite } from './navigation';

function App() {
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState('loading');
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [favorites, setFavorites] = useState(() => loadIds('dkhub-favorites'));
  const [recent, setRecent] = useState(() => loadIds('dkhub-recent'));
  useEffect(() => saveIds('dkhub-favorites', favorites), [favorites]);
  useEffect(() => saveIds('dkhub-recent', recent), [recent]);
  useEffect(() => {
    const controller = new AbortController();
    getApps(controller.signal).then(data => { setApps(data); setStatus('ready'); }).catch(error => {
      if (error.name !== 'AbortError') setStatus('error');
    });
    return () => controller.abort();
  }, []);
  const [query, setQuery] = useState('');
  const matches = app => `${app.name} ${app.description} ${app.category}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'));
  const visibleCount = apps.filter(matches).length;
  const home = () => { setSelected(null); setAdding(false); };
  const openApp = app => { setRecent(current => rememberRecent(current, app.id)); if (app.mode === 'embed') { setAdding(false); setSelected(app); } };
  const favorite = id => setFavorites(current => toggleFavorite(current, id));
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={home} aria-label="DKHub Startseite"><span className="brand-icon"><Icon name="grid" size={19}/></span><span>DK<span className="brand-accent">Hub</span><small>DEIN DIGITALER ORT</small></span></button>
      <div className="side-label">ÜBERSICHT</div>
      <button className={selected || adding ? "nav-item" : "nav-item active"} onClick={home}><Icon name="home" size={19}/> Startseite</button>
      <nav className="sidebar-quick" aria-label="Schnellzugriff"><QuickLinks title="FAVORITEN" ids={favorites} apps={apps} selectedId={selected?.id} onOpen={openApp}/><QuickLinks title="ZULETZT GEÖFFNET" ids={recent} apps={apps} selectedId={selected?.id} onOpen={openApp}/></nav>
      <div className="sidebar-note"><span className="note-dot"/> Für dein Zuhause <small>Deine Apps an einem Ort.</small></div>
    </aside>
    <div className="main-wrap">
      {!selected && <header className="topbar"><button className="mobile-brand" onClick={home}>DK<span>Hub</span></button><span className="top-caption">{selected ? selected.name : "DEIN PERSÖNLICHER HUB"}</span><span className="top-tag"><span className="note-dot"/> Dein Zuhause</span></header>}
      <nav className="mobile-quick" aria-label="Schnellzugriff"><QuickLinks title="Favoriten" ids={favorites} apps={apps} selectedId={selected?.id} onOpen={openApp}/><QuickLinks title="Zuletzt" ids={recent} apps={apps} selectedId={selected?.id} onOpen={openApp}/></nav>
      <main className={selected ? 'main viewer-main' : 'main'}>
        {adding && <AddApp onCancel={home} onAdded={app => { setApps(current => [...current, app]); setStatus('ready'); setAdding(false); setQuery(''); }} />}
        {selected && <><div className="viewer-toolbar"><button className="back-link" onClick={home}><Icon name="back" size={18}/> Übersicht</button><strong className="viewer-title">{selected.name}</strong><div className="viewer-actions"><button className="favorite-button" onClick={() => favorite(selected.id)} aria-pressed={favorites.includes(selected.id)} aria-label={favorites.includes(selected.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}>{favorites.includes(selected.id) ? '★' : '☆'}</button><a className="viewer-external" href={selected.url} target="_blank" rel="noopener noreferrer">Neuer Tab <Icon name="arrow" size={16}/></a></div></div></>}
        <div className={selected ? 'catalog in-app' : 'catalog'} hidden={adding}>
          {!selected && <div className="catalog-heading"><div><div className="eyebrow muted">DEIN DIGITALER ORT</div><h1>Deine Anwendungen <span>{apps.length}</span></h1></div><div className="catalog-actions"><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Anwendungen suchen" aria-label="Anwendungen suchen"/></label><button className="button primary" onClick={() => setAdding(true)}>+ Hinzufügen</button></div></div>}
          <div className="cards">{apps.map(app => <AppCard key={app.id} app={app} onOpen={() => openApp(app)} favorite={favorites.includes(app.id)} onFavorite={() => favorite(app.id)} active={selected?.id === app.id} hidden={selected ? selected.id !== app.id : !matches(app)} />)}</div>
          {!selected && status === 'loading' && <p className="empty" role="status">Anwendungen werden geladen …</p>}
          {!selected && status === 'error' && <p className="empty" role="alert">Anwendungen konnten nicht geladen werden. Bitte prüfe, ob das Backend läuft, und lade die Seite neu.</p>}
          {!selected && status === 'ready' && apps.length === 0 && <p className="empty">Noch keine Anwendungen eingetragen.</p>}
          {!selected && status === 'ready' && apps.length > 0 && visibleCount === 0 && <p className="empty">Keine Anwendung für „{query}“ gefunden.</p>}
        </div>
      </main>
      {!selected && <footer><span>DKHub <i>·</i> Dein Zuhause. Dein Hub.</span><span>Mit Freude selbst gebaut <span className="heart">♥</span></span></footer>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
