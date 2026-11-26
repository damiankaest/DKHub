import React from 'react';
import { Icon } from './Icon';

export function CatalogTools({count, categories, category, setCategory, query, setQuery, choosing, onBack, onAdd, scope, setScope, favoriteCount, status='ready'}) {
  return <header className="catalog-tools">
    <div className="catalog-title"><div><h1>{choosing?'Fenster hinzufügen':'App-Bibliothek'}</h1><p>{choosing ? 'Wähle eine App für das nächste Fenster.' : status==='loading' ? 'Deine Apps werden geholt.' : status==='error' ? 'Gerade keine Verbindung zum Server.' : count + (count===1?' Anwendung':' Anwendungen') + ' · ' + categories.length + (categories.length===1?' Kategorie':' Kategorien')}</p></div>
      {choosing ? <button className="button secondary" onClick={onBack}>Zurück zu Fenstern</button> : <button className="button primary" onClick={onAdd}><Icon name="plus" size={18}/>App hinzufügen</button>}</div>
    <div className="filter-bar"><nav className="segmented" aria-label="Bibliotheksansicht" data-tour="favorites"><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}><Icon name="grid" size={15}/>Alle Apps</button><button aria-pressed={scope==='favorites'} onClick={()=>setScope('favorites')}><Icon name="star" size={15}/>Favoriten<span className="mini-count">{favoriteCount}</span></button></nav>
      <div className="catalog-filters"><div className={'search-box'+(query?' filled':'')}><label className="search"><Icon name="search" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape' && query){e.preventDefault();setQuery('');}}} placeholder="Apps suchen …" aria-label="Anwendungen suchen" enterKeyHint="search" autoComplete="off"/></label>
          {query && <button type="button" className="search-clear" aria-label="Suche löschen" onClick={e=>{e.currentTarget.parentElement.querySelector('input').focus();setQuery('');}}><Icon name="close" size={15}/></button>}</div>
        <label className="select-filter"><Icon name="filter" size={16}/><select aria-label="Kategorie filtern" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Alle Kategorien</option>{categories.map(item=><option key={item}>{item}</option>)}</select><Icon name="down" size={14}/></label></div></div>
  </header>;
}

export function CatalogState({status, total, visible, favoritesOnly, reset, retry, add}) {
  let title, copy, action, label, icon='grid';
  if(status==='loading') return <div className="skeletons" role="status"><p>Anwendungen werden geladen …</p><div className="skeleton-track" aria-hidden="true">{[1,2,3,4,5].map(n=><span className="skeleton" key={n}/>)}</div></div>;
  if(status==='error') {title='Der Katalog ist nicht erreichbar.'; copy='Prüfe die Verbindung zu deinem Server und versuche es noch einmal.'; action=retry; label='Erneut versuchen';}
  else if(!total) {title='Deine Bibliothek ist noch leer.'; copy='Lege eine Kachel für eine Webseite an, die du schon hast. Neue Apps installierst du unter „Dienste“.'; action=add; label='Erste Kachel anlegen'; icon='plus';}
  else if(!visible) {title=favoritesOnly?'Keine passenden Favoriten.':'Keine Anwendungen für diese Suche und Kategorie gefunden.'; copy=favoritesOnly?'Markiere eine App mit dem Stern oder wechsle zu allen Apps.':'Probiere einen anderen Begriff oder zeige wieder alle Apps an.'; action=reset; label='Alle Apps anzeigen'; icon=favoritesOnly?'star':'search';}
  else return null;
  return <div className="catalog-state" role={status==='error'?'alert':'status'}><span className="state-icon"><Icon name={icon} size={22}/></span><strong>{title}</strong>{copy && <p>{copy}</p>}{action && <button className="button secondary" onClick={action}>{label}</button>}</div>;
}
