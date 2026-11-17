import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getApps } from './api';
import './styles.css';

import { Icon } from './Icon';
import { AppCard } from './AppCard';

function App() {
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState('loading');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    getApps(controller.signal).then(data => { setApps(data); setStatus('ready'); }).catch(error => {
      if (error.name !== 'AbortError') setStatus('error');
    });
    return () => controller.abort();
  }, []);
  const [query, setQuery] = useState('');
  const visible = apps.filter(app => `${app.name} ${app.description} ${app.category}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')));
  const home = () => setSelected(null);
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={home} aria-label="DKHub Startseite"><span className="brand-icon"><Icon name="grid" size={19}/></span><span>DK<span className="brand-accent">Hub</span><small>DEIN DIGITALER ORT</small></span></button>
      <div className="side-label">ÜBERSICHT</div>
      <button className="nav-item active" onClick={home}><Icon name="home" size={19}/> Startseite</button>
      <div className="sidebar-note"><span className="note-dot"/> Für dein Zuhause <small>Deine Apps an einem Ort.</small></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><button className="mobile-brand" onClick={home}>DK<span>Hub</span></button><span className="top-caption">DEIN PERSÖNLICHER HUB</span><span className="top-tag"><span className="note-dot"/> Dein Zuhause</span></header>
      <main className={selected ? 'main viewer-main' : 'main'}>
        {selected ? <>
          <button className="back-link" onClick={home}><Icon name="back" size={18}/> Zurück zur Übersicht</button>
          <div className="viewer-heading"><div><div className="eyebrow">DEINE ANWENDUNG</div><h1>{selected.name}</h1><p>{selected.description}</p></div><a className="button secondary" href={selected.url} target="_blank" rel="noopener noreferrer">In neuem Tab öffnen <Icon name="arrow" size={17}/></a></div>
          <div className="frame-wrap"><div className="frame-bar"><span/><span/><span/><div>{selected.name}</div></div><iframe title={selected.name} src={selected.url} referrerPolicy="no-referrer"/></div>
          <p className="frame-hint">Seite nicht sichtbar? Manche Webseiten erlauben keine Einbettung. Öffne sie in einem neuen Tab.</p>
        </> : <>
          <div className="welcome"><div className="eyebrow"><span className="eyebrow-line"/> DEIN DIGITALER ORT</div><h1>Alles, was du brauchst.<br/><em>An einem Ort.</em></h1><p>Deine Anwendungen, Dienste und liebsten Links –<br className="desktop-break"/> ganz einfach von deinem Zuhause aus erreichbar.</p><div className="hero-stamp"><Icon name="spark" size={36}/></div></div>
          <div className="section-heading"><div><div className="eyebrow muted">DEIN BEREICH</div><h2>Deine Anwendungen <span>{apps.length}</span></h2><p>Alles Wichtige, nur einen Klick entfernt.</p></div><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Anwendungen suchen" aria-label="Anwendungen suchen"/></label></div>
          <div className="cards">{visible.map(app => <AppCard key={app.id} app={app} onOpen={() => setSelected(app)} />)}</div>
          {status === 'loading' && <p className="empty" role="status">Anwendungen werden geladen …</p>}
          {status === 'error' && <p className="empty" role="alert">Anwendungen konnten nicht geladen werden. Bitte prüfe, ob das Backend läuft, und lade die Seite neu.</p>}
          {status === 'ready' && apps.length === 0 && <p className="empty">Noch keine Anwendungen eingetragen.</p>}
          {status === 'ready' && apps.length > 0 && visible.length === 0 && <p className="empty">Keine Anwendung für „{query}“ gefunden.</p>}
          <div className="footer-note"><span className="footer-spark"><Icon name="spark" size={19}/></span><div><strong>Hier ist Platz für deine Ideen.</strong><p>Weitere Anwendungen und Links finden bald ihren Weg hierher.</p></div></div>
        </>}
      </main>
      <footer><span>DKHub <i>·</i> Dein Zuhause. Dein Hub.</span><span>Mit Freude selbst gebaut <span className="heart">♥</span></span></footer>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
