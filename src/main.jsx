import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apps } from './apps';
import './styles.css';

const icons = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
  spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z"/></>,
  arrow: <><path d="M7 17 17 7M8 7h9v9"/></>,
  back: <><path d="m15 18-6-6 6-6"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
};
function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function App() {
  const [selected, setSelected] = useState(null);
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
          <div className="cards">{visible.map(app => <article className="card" key={app.id}><div className="card-top"><span className={`app-icon ${app.color}`}><Icon name={app.icon} size={24}/></span><span className="card-type">{app.label}</span></div><h3>{app.name}</h3><p>{app.description}</p><div className="card-bottom"><span>{app.category}</span>{app.mode === 'embed' ? <button onClick={() => setSelected(app)}>Öffnen <Icon name="arrow" size={16}/></button> : <a href={app.url} target="_blank" rel="noopener noreferrer">Öffnen <Icon name="arrow" size={16}/></a>}</div></article>)}</div>
          {visible.length === 0 && <p className="empty">Keine Anwendung für „{query}“ gefunden.</p>}
          <div className="footer-note"><span className="footer-spark"><Icon name="spark" size={19}/></span><div><strong>Hier ist Platz für deine Ideen.</strong><p>Weitere Anwendungen und Links finden bald ihren Weg hierher.</p></div></div>
        </>}
      </main>
      <footer><span>DKHub <i>·</i> Dein Zuhause. Dein Hub.</span><span>Mit Freude selbst gebaut <span className="heart">♥</span></span></footer>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
