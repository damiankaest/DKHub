import React, { useEffect, useRef, useState } from 'react';
import { BrandMark, Icon } from './Icon';
import { QuickLinks } from './QuickLinks';
import { ThemeArt } from './themes/ThemeArt';

export function HubNav({ apps, favorites, recent, selected, panel, tvMode, onTv, onOpen, onPanel, onHome, onChat, theme, inLibrary }) {
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const opener = useRef(null);
  const drawer = useRef(null);
  useEffect(() => {
    if (menu && !drawer.current.open) drawer.current.showModal();
    if (!menu && drawer.current.open) drawer.current.close();
  }, [menu]);
  function launch(action) {
    if (drawer.current?.open) drawer.current.close();
    setMenu(false); action();
  }
  const link = (label, icon, action, active, disabled=false) => <button type="button" title={label} aria-label={label} className={'nav-item' + (active ? ' active' : '')} disabled={disabled} aria-current={active?'page':undefined} onClick={()=>launch(action)}><Icon name={icon} size={19}/><span>{label}</span></button>;
  const quick = <><QuickLinks title="Favoriten" ids={favorites} apps={apps} selectedId={selected?.id} onOpen={app=>launch(()=>onOpen(app))}/><QuickLinks title="Zuletzt geöffnet" ids={recent} apps={apps} selectedId={selected?.id} onOpen={app=>launch(()=>onOpen(app))}/></>;
  const nav = <>
    <div className="rail-section"><div className="nav-heading">Arbeitsbereich</div>
      {link('Bibliothek','library',onHome,!selected && !panel)}
      {link(tvMode?'TV-Modus beenden':'TV-Modus','tv',onTv,false)}
      <button type="button" className="nav-item" aria-label="DKHub Chat öffnen" title="DKHub Chat öffnen" onClick={()=>launch(onChat)}><Icon name="chat" size={19}/><span>Assistent</span></button></div>
    <div className="nav-quick">{quick}</div>
    <div className="rail-section"><div className="nav-heading">Verwaltung</div>
      {link('Dienste','server',()=>onPanel('director'),panel==='director')}
      {link('Sortieren','sort',()=>onPanel('sort'),panel==='sort',apps.length<2)}
      {link('Einstellungen','settings',()=>onPanel('admin'),panel==='admin')}</div>
  </>;
  return <>
    <aside className={'sidebar' + (collapsed ? ' compact' : '')}>
      <button className="brand" onClick={onHome} aria-label="DKHub Startseite"><BrandMark/><span>DK<b>Hub</b></span></button>
      <nav className="rail-nav" aria-label="Hauptnavigation">{nav}</nav>
      <div className="rail-bottom"><button className="theme-badge" onClick={()=>onPanel('admin')} aria-label={'Design verwalten: ' + theme.name}>
        <span className="theme-badge-art"><ThemeArt motif={theme.motif} motion={theme.motion}/></span><span><small>Design</small><strong>{theme.name || 'Entwurf'}</strong></span><Icon name="palette" size={17}/></button>
        <button className="nav-item collapse" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'Seitenleiste ausklappen':'Seitenleiste einklappen'} aria-expanded={!collapsed}><Icon name="panel" size={17}/><span>Einklappen</span></button></div>
    </aside>
    <header className="mobile-bar"><button className="brand" onClick={onHome} aria-label="DKHub Startseite"><BrandMark/><span>DK<b>Hub</b></span></button>
      <div><button type="button" className="icon-button" aria-label="DKHub Chat öffnen" onClick={onChat}><Icon name="chat"/></button><button type="button" className="icon-button" ref={opener} aria-expanded={menu} aria-label="Navigation öffnen" onClick={()=>setMenu(true)}><Icon name="menu"/></button></div></header>
    {inLibrary && (favorites.length>0 || recent.length>0) && <nav className="mobile-quick" aria-label="Schnellzugriff">{quick}</nav>}
    <dialog ref={drawer} className="mobile-menu" aria-label="Navigation" onClose={()=>setMenu(false)} onClick={e=>{if(e.target===e.currentTarget) drawer.current.close();}}>
      <div><div className="drawer-head"><strong>Navigation</strong><button autoFocus className="icon-button" onClick={()=>drawer.current.close()} aria-label="Navigation schließen"><Icon name="close"/></button></div><nav aria-label="Mobile Hauptnavigation">{nav}</nav></div>
    </dialog>
  </>;
}
