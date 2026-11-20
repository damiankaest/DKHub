import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getApps } from './api';
import './styles.css';

import { Icon } from './Icon';
import { AppCard } from './AppCard';
import { CategoryRow, handleTvNavigation } from './CategoryRow';
import { AddApp } from './AddApp';
import { AdminSettings } from './AdminSettings';
import { RemoveApp } from './RemoveApp';
import { Director } from './Director';
import { HubChat } from './HubChat';
import { ReorderApps } from './ReorderApps';
import { QuickLinks } from './QuickLinks';
import { loadIds, saveIds, rememberRecent, toggleFavorite } from './navigation';

function App() {
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState('loading');
  const [openIds, setOpenIds] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [director, setDirector] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tvMode, setTvMode] = useState(false);
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
  useEffect(() => {
    if (status !== 'ready') return;
    const syncLocation = () => {
      const route = window.location.pathname.replace(/^\/|\/$/g, '');
      const app = apps.find(item => item.route === route);
      if (app) { setOpenIds([app.id]); setFocusId(app.id); setChoosing(false); setAdding(false); }
      else { setOpenIds([]); setFocusId(null); }
    };
    syncLocation();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [status]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const categories = [...new Set(apps.map(app => app.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  useEffect(() => { if (category && !categories.includes(category)) setCategory(''); }, [apps, category]);
  const matches = app => (!category || app.category === category) && `${app.name} ${app.description} ${app.manifest || ''} ${app.category}`.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'));
  const visibleCount = apps.filter(matches).length;
  const selected = apps.find(app => app.id === focusId && openIds.includes(app.id));
  const navigate = (url, replace = false) => {
    if (window.location.pathname !== url) window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  };
  const home = () => { setOpenIds([]); setFocusId(null); setAdding(false); setChoosing(false); setRemoving(null); setEditing(null); setDirector(false); setSorting(false); setAdmin(false); navigate('/'); };
  const openApp = app => {
    setRecent(current => rememberRecent(current, app.id));
    if (app.mode !== 'embed') return;
    const next = choosing ? [...new Set([...openIds, app.id])] : [app.id];
    if (next.length > 4) return;
    setAdding(false); setChoosing(false); setOpenIds(next); setFocusId(app.id);
    if (app.route) window.history.pushState({}, '', `/${app.route}`);
  };
  const closeApp = id => {
    const next = openIds.filter(item => item !== id);
    setOpenIds(next);
    const nextId = focusId === id ? next[next.length - 1] : focusId;
    setFocusId(nextId || null);
    const nextApp = apps.find(app => app.id === nextId);
    window.history.replaceState({}, '', nextApp?.route ? `/${nextApp.route}` : '/');
  };
  const favorite = id => setFavorites(current => toggleFavorite(current, id));
  return <div className={`shell${collapsed ? " sidebar-collapsed" : ""}${tvMode ? " tv-mode" : ""}`}>
    <aside className="sidebar">
      <button className="brand" onClick={home} aria-label="DKHub Startseite"><span className="brand-icon"><Icon name="grid" size={19}/></span><span>DK<span className="brand-accent">Hub</span><small>DEIN DIGITALER ORT</small></span></button>
      <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"} aria-expanded={!collapsed}>{collapsed ? "»" : "«"}</button>
      {!collapsed && <div className="side-label">ÜBERSICHT</div>}
      <button className={selected || adding ? "nav-item" : "nav-item active"} onClick={home}><Icon name="home" size={19}/> Startseite</button>
      <nav hidden={collapsed} className="sidebar-quick" aria-label="Schnellzugriff"><QuickLinks title="FAVORITEN" ids={favorites} apps={apps} selectedId={selected?.id} onOpen={openApp}/><QuickLinks title="ZULETZT GEÖFFNET" ids={recent} apps={apps} selectedId={selected?.id} onOpen={openApp}/></nav>
      <div hidden={collapsed} className="sidebar-note"><span className="note-dot"/> Für dein Zuhause <small>Deine Apps an einem Ort.</small></div>
    </aside>
    <div className="main-wrap">

      <nav className="mobile-quick" aria-label="Schnellzugriff"><button className="mobile-home" onClick={home} aria-label="DKHub Startseite">DK<span>Hub</span></button><QuickLinks title="Favoriten" ids={favorites} apps={apps} selectedId={selected?.id} onOpen={openApp}/><QuickLinks title="Zuletzt" ids={recent} apps={apps} selectedId={selected?.id} onOpen={openApp}/></nav>
      <main className={selected ? 'main viewer-main' : 'main'}>
        {admin && <AdminSettings onClose={() => setAdmin(false)} />}
        {sorting && <ReorderApps apps={apps} onCancel={() => setSorting(false)} onSaved={ordered => { setApps(ordered); setSorting(false); setQuery(''); }} />}
        {director && <Director onClose={() => setDirector(false)} onCatalogChanged={async () => setApps(await getApps())} />}
        {editing && !director && <AddApp key={editing.id} app={editing} categories={categories} onCancel={() => setEditing(null)} onAdded={app => { setApps(current => current.map(item => item.id === app.id ? app : item)); if (focusId === app.id && app.route) window.history.replaceState({}, '', `/${app.route}`); setEditing(null); }} />}
        {removing && !editing && !director && <RemoveApp app={removing} onCancel={() => setRemoving(null)} onRemoved={id => { setApps(current => current.filter(app => app.id !== id)); setOpenIds(current => current.filter(item => item !== id)); setFavorites(current => current.filter(item => item !== id)); setRecent(current => current.filter(item => item !== id)); if (focusId === id) { const next = openIds.filter(item => item !== id); const nextApp = apps.find(item => item.id === next[next.length - 1]); setFocusId(nextApp?.id || null); window.history.replaceState({}, '', nextApp?.route ? `/${nextApp.route}` : '/'); } setRemoving(null); }} />}
        {adding && !removing && !editing && !director && <AddApp categories={categories} onCancel={home} onAdded={app => { setApps(current => [...current, app]); setStatus('ready'); setAdding(false); setQuery(''); }} />}
        {selected && !choosing && !removing && !editing && !director && <><div className="viewer-toolbar"><button className="back-link" onClick={home}><Icon name="back" size={18}/> Übersicht</button><strong className="viewer-title">{selected.name}</strong><div className="viewer-actions"><button className="button secondary" onClick={() => setChoosing(true)} disabled={openIds.length >= 4}>+ Fenster ({openIds.length}/4)</button><button className="favorite-button" onClick={() => favorite(selected.id)} aria-pressed={favorites.includes(selected.id)} aria-label={favorites.includes(selected.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}>{favorites.includes(selected.id) ? '★' : '☆'}</button><a className="viewer-external" href={selected.url} target="_blank" rel="noopener noreferrer">Neuer Tab <Icon name="arrow" size={16}/></a></div></div></>}
        <div className={selected && !choosing ? 'catalog in-app' : 'catalog'} hidden={adding || !!removing || !!editing || director || sorting || admin}>
          {(!selected || choosing) && <div className="catalog-heading"><div><div className="eyebrow muted">DEIN DIGITALER ORT</div><h1>Deine Anwendungen <span>{apps.length}</span></h1></div><div className="catalog-actions"><button className="button secondary" disabled={status !== 'ready' || apps.length < 2} onClick={() => setSorting(true)}>Sortieren</button><button className="button secondary" onClick={() => { if (!tvMode) requestAnimationFrame(() => document.querySelector(".category-row:not([hidden]) .card:not([hidden]) [data-tv-card]")?.focus()); setTvMode(value => !value); }} aria-pressed={tvMode}>{tvMode ? "TV-Modus beenden" : "TV-Modus"}</button><button className="button secondary" onClick={() => setDirector(true)}>Dienste</button><button className="button secondary" onClick={() => setAdmin(true)}>Admin</button>{choosing && <button className="button secondary" onClick={() => setChoosing(false)}>Zurück zu Fenstern</button>}<select className="category-filter" aria-label="Kategorie filtern" value={category} onChange={event => setCategory(event.target.value)}><option value="">Alle Kategorien</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Anwendungen suchen" aria-label="Anwendungen suchen"/></label><button className="button primary" onClick={() => setAdding(true)}>+ Hinzufügen</button></div></div>}
          <div className="cards" data-windows={openIds.length} onKeyDown={tvMode && !selected ? handleTvNavigation : undefined}>{categories.map(group => <CategoryRow key={group} name={group} hidden={selected && !choosing ? !apps.some(app => app.category === group && openIds.includes(app.id)) : !apps.some(app => app.category === group && matches(app))}>{apps.filter(app => app.category === group).map(app => <AppCard key={app.id} app={app} onOpen={() => openApp(app)} favorite={favorites.includes(app.id)} onFavorite={() => favorite(app.id)} active={!!selected && !choosing && openIds.includes(app.id)} hidden={selected && !choosing ? !openIds.includes(app.id) : !matches(app)} onRemove={() => setRemoving(app)} onEdit={() => setEditing(app)} onClose={() => closeApp(app.id)} onFocus={() => { setFocusId(app.id); if (app.route) window.history.replaceState({}, '', `/${app.route}`); }} />)}</CategoryRow>)}</div>
          {(!selected || choosing) && status === 'loading' && <p className="empty" role="status">Anwendungen werden geladen …</p>}
          {(!selected || choosing) && status === 'error' && <p className="empty" role="alert">Anwendungen konnten nicht geladen werden. Bitte prüfe, ob das Backend läuft, und lade die Seite neu.</p>}
          {(!selected || choosing) && status === 'ready' && apps.length === 0 && <p className="empty">Noch keine Anwendungen eingetragen.</p>}
          {(!selected || choosing) && status === 'ready' && apps.length > 0 && visibleCount === 0 && <p className="empty">Keine Anwendungen für diese Suche und Kategorie gefunden.</p>}
        </div>
      </main>
      <HubChat apps={apps} status={status} favorites={favorites} onHome={home} onOpen={app => { setDirector(false); setEditing(null); setRemoving(null); setAdding(false); setChoosing(false); openApp(app); }} />
      {!selected && <footer><span>DKHub <i>·</i> Dein Zuhause. Dein Hub.</span><span>Mit Freude selbst gebaut <span className="heart">♥</span></span></footer>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
