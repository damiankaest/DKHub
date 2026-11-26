import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ThemeArt } from './themes/ThemeArt';

function CardOptions({name, onEdit, onRemove}) {
  const root = useRef(null);
  const trigger = useRef(null);
  const [open,setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key==='Escape') {setOpen(false);trigger.current?.focus();} };
    document.addEventListener('pointerdown',close);
    root.current.addEventListener('keydown',escape);
    const el=root.current;
    return () => {document.removeEventListener('pointerdown',close);el.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="card-options" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)) setOpen(false);}}>
    <button ref={trigger} className="icon-button" aria-label={'Optionen für '+name} aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name="more" size={18}/></button>
    {open && <div className="options-pop"><button onClick={()=>{setOpen(false);onEdit();}}>Bearbeiten</button><button className="destructive" onClick={()=>{setOpen(false);onRemove();}}>Entfernen</button></div>}
  </div>;
}

export function AppCard({ app, theme, onOpen, favorite, onFavorite, active, hidden, onClose, onFocus, onRemove, onEdit, soloControls }) {
  const [showUrl,setShowUrl] = useState(false);
  const [copyMessage,setCopyMessage] = useState('');
  const [imageError,setImageError] = useState('');
  const [loaded,setLoaded] = useState('');
  const address = useRef(null);
  const embed = app.mode==='embed';
  const label = embed?'Im Hub':'Neuer Tab';
  const art = !active && ((!app.image && !embed) || (app.image && imageError===app.image));
  const frame = embed && (!app.image || active);
  const initials = app.name.replace(/^DK(?=\p{Lu})/u,'').split(/\s+/).slice(0,2).map(word=>[...word][0]).join('').toLocaleUpperCase('de');
  const launch = {className:'card-launch','data-tv-card':true,'data-app-id':app.id,
    'aria-label':app.name+(embed?' öffnen':' öffnen (neuer Tab)'),onClick:onOpen};
  async function copyUrl() {
    try { await navigator.clipboard.writeText(app.url);setCopyMessage('Kopiert'); }
    catch { address.current?.focus();address.current?.select();setCopyMessage('Adresse zum Kopieren markiert.'); }
  }
  return <article className={'card' + (active?' card-open':'')} hidden={hidden} onPointerDown={active?onFocus:undefined}>
    {active && <div className="window-bar">{soloControls || <strong>{app.name}</strong>}<div className="window-tools">
      <button type="button" className="button quiet compact-button address-button" aria-expanded={showUrl} onClick={()=>{setShowUrl(!showUrl);setCopyMessage('');}}><Icon name="link" size={16}/><span className="address-label">Adresse</span></button>
      <a className="icon-button" aria-label={app.name+' in neuem Tab öffnen'} title="In neuem Tab öffnen" href={app.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16}/></a>
      <button className="icon-button" aria-label={app.name+' schließen'} onClick={onClose}><Icon name="close" size={16}/></button>
    </div></div>}
    {active && showUrl && <div className="url-bar"><label>Konfigurierte Adresse<input ref={address} readOnly value={app.url} aria-label={app.name+' Adresse'}/></label>
      <button className="button secondary" onClick={copyUrl}>Kopieren</button><button className="button quiet" onClick={onEdit}>Bearbeiten</button>{copyMessage && <span role="status">{copyMessage}</span>}</div>}
    <div className="card-preview">
      {app.image && !active && imageError!==app.image && <img className="card-image" src={app.image} alt="" loading="lazy" onError={()=>setImageError(app.image)}/>}
      {art && <><ThemeArt motif={theme.motif} motion={theme.motion}/><span className="card-monogram" aria-hidden="true">{initials}</span></>}
      {frame && <iframe title={'Vorschau '+app.name} src={app.url} loading="lazy" referrerPolicy="no-referrer" tabIndex={active?0:-1} onLoad={()=>setLoaded(app.url)}/>}
      {frame && loaded!==app.url && <span className="card-loading" aria-hidden="true">Wird geladen …</span>}
      {!active && <span className="cover-badge"><Icon name={embed?'window':'external'} size={13}/>{label}</span>}
      {!active && <span className="card-play" aria-hidden="true"><Icon name={embed?'next':'external'} size={18}/></span>}
    </div>
    <div className="card-details"><div className="card-title"><h3>{embed?<button type="button" {...launch}>{app.name}</button>:<a {...launch} href={app.url} target="_blank" rel="noopener noreferrer">{app.name}</a>}</h3>
      <button className="icon-button card-favorite" aria-pressed={favorite} aria-label={app.name+(favorite?' aus Favoriten entfernen':' zu Favoriten hinzufügen')} onClick={onFavorite}><Icon name="star" size={17} filled={favorite}/></button><CardOptions name={app.name} onEdit={onEdit} onRemove={onRemove}/></div>
      <p>{app.description}</p>
      <small className="card-kind">{app.label}</small>
    </div>
  </article>;
}
