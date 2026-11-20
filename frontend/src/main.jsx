import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useHubTools } from './assistant/useHubTools';
import { getApps } from './api';
import { AppCard } from './AppCard';
import { CategoryRow, handleTvNavigation } from './CategoryRow';
import { CatalogTools, CatalogState } from './CatalogTools';
import { HubNav } from './HubNav';
import { Icon } from './Icon';
import { AddApp } from './AddApp';
import { AdminSettings } from './AdminSettings';
import { RemoveApp } from './RemoveApp';
import { Director } from './Director';
import { ReorderApps } from './ReorderApps';
import { HubChat } from './HubChat';
import { useAppearance } from './themes/useAppearance';
import { loadIds, saveIds, rememberRecent, toggleFavorite } from './navigation';
import './styles.css';

function App() {
  const appearance = useAppearance();
  const [apps,setApps] = useState([]);
  const [status,setStatus] = useState('loading');
  const [attempt,setAttempt] = useState(0);
  const [openIds,setOpenIds] = useState([]);
  const [focusId,setFocusId] = useState(null);
  const [choosing,setChoosing] = useState(false);
  const [panel,setPanel] = useState(null);
  const [tv,setTV] = useState(false);
  const [chat,setChat] = useState(false);
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState('');
  const [scope,setScope] = useState('all');
  const [favorites,setFavorites] = useState(()=>loadIds('dkhub-favorites'));
  const [recent,setRecent] = useState(()=>loadIds('dkhub-recent'));
  const routed = useRef(false);
  const cards = useRef(null);
  const catalogHeading = useRef(null);
  const lastLaunch = useRef(null);
  const lastChatTrigger = useRef(null);
  const section = panel?.name;
  const selected = apps.find(a=>a.id===focusId && openIds.includes(a.id));
  const viewer = Boolean(selected && !choosing && !section);
  const inLibrary = !section && !viewer;
  const categories = [...new Set(apps.map(a=>a.category))].sort((a,b)=>a.localeCompare(b,'de'));
  const currentCategory = categories.includes(category)?category:'';
  const needle = query.trim().toLocaleLowerCase('de');
  const matches = a=>(scope!=='favorites'||favorites.includes(a.id)) && (!currentCategory||a.category===currentCategory) &&
    (!needle || [a.name,a.description,a.manifest,a.category].join(' ').toLocaleLowerCase('de').includes(needle));
  const byCategory = new Map(categories.map(c=>[c,[]]));
  const visibleIds = new Set();
  for (const a of apps) {
    byCategory.get(a.category).push(a);
    if (viewer ? openIds.includes(a.id) : matches(a)) visibleIds.add(a.id);
  }
  useEffect(()=>saveIds('dkhub-favorites',favorites),[favorites]);
  useEffect(()=>saveIds('dkhub-recent',recent),[recent]);
  useEffect(()=>{
    const abort = new AbortController();
    setStatus('loading');
    getApps(abort.signal).then(list=>{setApps(list);setStatus('ready');}).catch(e=>{if(e.name!=='AbortError')setStatus('error');});
    return ()=>abort.abort();
  },[attempt]);
  useEffect(()=>{
    if(status!=='ready')return;
    function sync() {
      const slug = location.pathname.replace(/^\/|\/$/g,'');
      const app = apps.find(a=>a.route===slug);
      setPanel(null); setChoosing(false); setOpenIds(app?[app.id]:[]); setFocusId(app?.id||null);
    }
    if(!routed.current) {routed.current=true;sync();}
    window.addEventListener('popstate',sync);
    return ()=>window.removeEventListener('popstate',sync);
  },[status,apps]);
  useEffect(()=>{
    if(category && !apps.some(a=>a.category===category))setCategory('');
  },[apps,category]);

  function navigate(url,replace=false) {
    if(location.pathname!==url) history[replace?'replaceState':'pushState']({},'',url);
  }
  function resetFilter() {setQuery('');setCategory('');setScope('all');}
  function focusVisibleTile(id) {
    const tiles = [...(cards.current?.querySelectorAll('.category-row:not([hidden]) .card:not([hidden]) [data-tv-card]') || [])];
    const target = tiles.find(tile => tile.dataset.appId === id) || tiles[0] || catalogHeading.current;
    target?.focus({preventScroll:true});
    target?.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  function focusTile(id) { requestAnimationFrame(() => focusVisibleTile(id)); }
  // Choose the initial TV target before paint. A later animation frame could
  // otherwise take focus back just after the first press on a remote.
  useLayoutEffect(() => { if (tv) focusVisibleTile(); }, [tv]);
  function home(restore=true) {
    setPanel(null);setOpenIds([]);setFocusId(null);setChoosing(false);navigate('/');
    if (restore && (selected || tv)) focusTile(lastLaunch.current||focusId);
  }
  function openApp(app,fromAssistant=false) {
    if (app.mode!=='embed' && !fromAssistant) {setRecent(ids=>rememberRecent(ids,app.id));return;}
    const next = choosing && !fromAssistant?[...new Set([...openIds,app.id])]:[app.id];
    if(next.length>4)return;
    lastLaunch.current=app.id;
    if (app.mode==='embed') setRecent(ids=>rememberRecent(ids,app.id));
    setPanel(null);setChoosing(false);setOpenIds(next);setFocusId(app.id);
    if(app.route)navigate('/'+app.route);
    if(tv && !fromAssistant)requestAnimationFrame(()=>document.querySelector('.back-to-library')?.focus());
  }
  function closeApp(id) {
    const next = openIds.filter(x=>x!==id);
    const focus = id===focusId?next.at(-1):focusId;
    setOpenIds(next);setFocusId(focus||null);
    const app = apps.find(a=>a.id===focus);
    navigate(app?.route?'/'+app.route:'/',true);
    if(!focus)focusTile(id);
  }
  function manage(name,app=null,keepAssistant=false) {
    setPanel({name,app});setChoosing(false);if(!keepAssistant)setChat(false);
    if(name!=='edit' && name!=='remove') {setOpenIds([]);setFocusId(null);navigate('/');}
    window.scrollTo(0,0);
  }
  function onSave(app) {
    if(section==='edit') {
      setApps(list=>list.map(a=>a.id===app.id?app:a));
      if(focusId===app.id && app.route)navigate('/'+app.route,true);
    } else {
      setApps(list=>[...list,app]);setStatus('ready');resetFilter();
    }
    setPanel(null);
  }
  function onRemove(id) {
    setApps(list=>list.filter(a=>a.id!==id));setFavorites(ids=>ids.filter(i=>i!==id));setRecent(ids=>ids.filter(i=>i!==id));
    if(openIds.includes(id))closeApp(id);
    setPanel(null);
  }
  function toggleTV() {
    if(!tv){ home(false);setTV(true); }
    else {
      setTV(false);
      requestAnimationFrame(()=>{
        const rail = document.querySelector('.sidebar [aria-label="TV-Modus"]');
        const target = rail?.getClientRects().length ? rail : document.querySelector('.mobile-bar [aria-label="Navigation öffnen"]');
        target?.focus();
      });
    }
  }
  function favorite(id) {setFavorites(ids=>toggleFavorite(ids,id));}
  function openChat() {
    if(chat) {closeChat();return;}
    lastChatTrigger.current=document.activeElement;setChat(true);
  }
  function closeChat(restore=true) {
    setChat(false);
    requestAnimationFrame(()=>{
      const trigger=lastChatTrigger.current;
      const target=restore ? (trigger?.isConnected && trigger.getClientRects().length ? trigger :
        [...document.querySelectorAll('[data-assistant-toggle]')].find(el=>el.getClientRects().length)) :
        (document.querySelector('.back-to-library') || document.getElementById('content'));
      target?.focus({preventScroll:true});
    });
  }
  const tools=useHubTools({apps,favorites,status,panel:section,
    open:app=>flushSync(()=>openApp(app,true)),
    home:()=>flushSync(()=>{home(false);resetFilter();}),
    add:()=>flushSync(()=>manage('add',null,true)),
  });
  const viewerActions = selected && <>
    <button className="button quiet back-to-library" onClick={()=>home()}><Icon name="back" size={17}/>Übersicht</button>
    <strong className="viewer-title">{selected.name}</strong>
    <button className="button secondary compact-button" onClick={()=>{setChoosing(true);resetFilter();if(tv)focusTile();}} disabled={openIds.length>=4} aria-label={'+ Fenster ('+openIds.length+'/4)'}><Icon name="plus" size={15}/>Fenster <small>{openIds.length}/4</small></button>
    <button className="icon-button" aria-pressed={favorites.includes(focusId)} aria-label={favorites.includes(focusId)?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen'} onClick={()=>favorite(focusId)}><Icon name="star" size={17} filled={favorites.includes(focusId)}/></button>
  </>;
  return <div className={'shell'+(chat?' with-assistant':'')+(tv?' tv-mode':'')+(viewer?' viewer':'')}>
    <a className="skip-link" href="#content">Zum Inhalt</a>
    <HubNav apps={apps} favorites={favorites} recent={recent} selected={selected} panel={section} onPanel={manage} onHome={()=>home()} tvMode={tv} onTv={toggleTV} onOpen={openApp} onChat={openChat} chatOpen={chat} theme={appearance.visible} inLibrary={inLibrary}/>
    <main id="content" tabIndex={-1} className={viewer?'main viewer-main':'main'}>
      {section==='admin' && <AdminSettings onClose={()=>setPanel(null)} appearance={appearance}/>}
      {section==='sort' && <ReorderApps apps={apps} onCancel={()=>setPanel(null)} onSaved={ordered=>{setApps(ordered);setPanel(null);resetFilter();}}/>}
      {section==='director' && <Director onClose={()=>setPanel(null)} onCatalogChanged={async()=>setApps(await getApps())}/>}
      {(section==='edit'||section==='add') && <AddApp key={panel.app?.id||'new'} app={panel.app} categories={categories} onCancel={()=>setPanel(null)} onAdded={onSave}/>}
      {section==='remove' && <RemoveApp app={panel.app} onCancel={()=>setPanel(null)} onRemoved={onRemove}/>}
      {viewer && (openIds.length>1 || selected.mode==='external') && <div className="viewer-toolbar">{viewerActions}</div>}
      {viewer && selected.mode==='external' && <div className="catalog-state"><Icon name="external"/><h2>{selected.name}</h2><p>Diese Anwendung öffnet in einem eigenen Tab.</p><a className="button primary" href={selected.url} onClick={()=>openApp(selected)} target="_blank" rel="noopener noreferrer">Im neuen Tab öffnen</a></div>}
      <div className={'catalog'+(viewer?' in-app':'')} hidden={!!section || (viewer && selected.mode==='external')}>
        {!viewer && <div ref={catalogHeading} tabIndex={-1}>
          {tv && <div className="tv-tools"><span><Icon name="tv" size={18}/> TV-Modus</span><button className="button quiet tv-exit" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();focusTile();}}} onClick={toggleTV}>TV-Modus beenden</button></div>}
          <CatalogTools count={apps.length} categories={categories} category={currentCategory} setCategory={setCategory} query={query} setQuery={setQuery} choosing={choosing} onBack={()=>setChoosing(false)} onAdd={()=>manage('add')} scope={scope} setScope={setScope} favoriteCount={apps.filter(a=>favorites.includes(a.id)).length}/>
        </div>}
        <div ref={cards} className="cards" data-windows={openIds.length} onKeyDown={tv && !viewer?e=>handleTvNavigation(e,toggleTV):undefined}>
          {categories.map(group=>{
            const list=byCategory.get(group), n=list.filter(a=>visibleIds.has(a.id)).length;
            return <CategoryRow key={group} name={group} visibleCount={n} hidden={!n} viewing={viewer}>
              {list.map(app=><AppCard key={app.id} app={app} theme={appearance.visible} active={viewer && openIds.includes(app.id)} hidden={!visibleIds.has(app.id)}
                soloControls={viewer && openIds.length===1?viewerActions:null} favorite={favorites.includes(app.id)} onOpen={()=>openApp(app)} onFavorite={()=>favorite(app.id)}
                onRemove={()=>manage('remove',app)} onEdit={()=>manage('edit',app)} onClose={()=>closeApp(app.id)} onFocus={()=>{setFocusId(app.id);if(app.route)navigate('/'+app.route,true);}}/>)}
            </CategoryRow>;
          })}
        </div>
        {!viewer && <CatalogState status={status} total={apps.length} visible={visibleIds.size} favoritesOnly={scope==='favorites'} retry={()=>setAttempt(n=>n+1)} reset={resetFilter}/>}
      </div>
    </main>
    <HubChat visible={chat} onClose={closeChat} apps={apps} tools={tools} onExternal={openApp} context={section?'Verwaltung':selected?.name || 'App-Bibliothek'}/>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
