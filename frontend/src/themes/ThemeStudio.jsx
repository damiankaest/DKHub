import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ThemeArt } from './ThemeArt';
import { defaultTheme, motifs, shapes, themeVars } from './palette';

const presetLabels = { light: 'Klar & ruhig', dark: 'Nachtschicht', anime: 'Tusche & Raster', christmas: 'Winterwald' };
function recipe({name, mode, accent, highlight, motif, shape, motion}) {
  return { name, mode, accent, highlight, motif, shape, motion };
}
async function request(path, password, body, signal, method = 'POST') {
  const res = await fetch('/api/admin/themes' + path, {
    method, signal, headers: { 'X-DKHub-Admin': password, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(res.status === 403 ? 'Bitte erneut als Admin anmelden.' :
    (typeof data?.detail === 'string' ? data.detail : 'Das Theme konnte nicht verarbeitet werden.'));
  return data;
}

export function ThemeStudio({ password, appearance, aiReady }) {
  const [library, setLibrary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [action, setAction] = useState('');
  const [retry, setRetry] = useState(0);
  const controller = useRef(null);
  const nameInput = useRef(null);
  const activateButton = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { setPreview, activate } = appearance;
  useEffect(() => {
    const life = new AbortController();
    controller.current = life;
    request('/list', password, undefined, life.signal).then(data => {
      if (life.signal.aborted) return;
      setLibrary(data); setSelected(data.active); setFeedback(null);
    }).catch(e => { if (!life.signal.aborted) setFeedback({error:true, text:e.message}); });
    return () => { life.abort(); setPreview(null); };
  }, [password, retry, setPreview]);

  const chosen = library?.themes.find(t => t.id === selected);
  const show = draft || chosen || defaultTheme;
  const isPreview = Boolean(draft || (chosen && chosen.id !== library.active));
  const owned = id => id?.startsWith('custom-');

  async function run(kind, path, body, done, method) {
    const signal = controller.current.signal;
    setAction(kind); setFeedback(null);
    try {
      const result = await request(path, password, body, signal, method);
      if (!signal.aborted) done(result);
    } catch (e) {
      if (!signal.aborted) setFeedback({error:true, text:e.message || 'Verbindung fehlgeschlagen.'});
    } finally { if (!signal.aborted) setAction(''); }
  }

  function select(t) {
    setSelected(t.id); setDraft(null); setFeedback(null); setConfirmDelete(false);
    setPreview(t.id === library.active ? null : t);
  }
  function edit(spec) { setDraft(spec); setPreview(spec); }
  function beginDraft(spec) {
    setConfirmDelete(false); edit(spec);
    requestAnimationFrame(() => nameInput.current?.focus());
  }
  function activateChosen() {
    setConfirmDelete(false);
    run('activate', '/' + selected + '/activate', undefined, t => {
      setLibrary(current => ({...current, active:t.id})); activate(t);
      setFeedback({text:'„' + t.name + '“ ist jetzt das Design für alle Geräte.'});
    });
  }
  function save(event) {
    event.preventDefault();
    run('save', '', recipe(draft), t => {
      setLibrary(current => ({...current, themes:[...current.themes, t]}));
      setSelected(t.id); setDraft(null); setPreview(t);
      requestAnimationFrame(() => activateButton.current?.focus());
      setFeedback({text:'„' + t.name + '“ ist gespeichert. Du kannst es jetzt oder später aktivieren.'});
    });
  }
  function remove() {
    run('delete', '/' + selected, undefined, () => {
      setLibrary(current => ({...current, themes:current.themes.filter(t => t.id !== selected)}));
      select(library.themes.find(t => t.id === library.active));
      setFeedback({text:'Theme aus der Sammlung entfernt.'});
    }, 'DELETE');
  }
  function generate(event) {
    event.preventDefault();
    run('generate', '/draft', {prompt:prompt.trim()}, spec => {
      beginDraft(spec); setFeedback({text:'Dein KI-Entwurf ist bereit. Du kannst alle Werte anpassen.'});
    });
  }

  if (!library) return <div className="status-box" role={feedback?.error ? 'alert' : 'status'}>
    <p>{feedback?.text || 'Designs werden geladen …'}</p>
    {feedback?.error && <button className="button secondary" onClick={() => setRetry(n => n+1)}>Erneut versuchen</button>}
  </div>;
  return <div className="studio">
    <div className="section-intro"><h3>Erscheinungsbild</h3><p>Wähle ein Design oder gestalte ein eigenes. Erst beim Aktivieren sehen es alle im Hub.</p></div>
    <fieldset className="theme-options" disabled={!!action}><legend className="sr-only">Theme für die Vorschau auswählen</legend>
      {library.themes.map(t => <button type="button" className="theme-option" style={themeVars(t)} key={t.id}
        aria-label={t.name} aria-pressed={!draft && selected === t.id} onClick={() => select(t)}>
        <span className="mini-cover"><ThemeArt motif={t.motif}/></span>
        <span className="option-meta"><strong>{t.name}</strong><small>{t.id === library.active ? 'Im Hub aktiv' : (presetLabels[t.id] || 'Eigenes Theme')}</small></span>
        {!draft && selected === t.id && <span className="selection-mark"><Icon name="check" size={14}/></span>}
      </button>)}
    </fieldset>
    <div className="studio-preview" style={themeVars(show)}>
      <div className="preview-art"><ThemeArt motif={show.motif} motion={show.motion}/></div>
      <div className="preview-summary"><span className="kicker">{isPreview ? 'LOKALE VORSCHAU' : 'AKTIVES DESIGN'}</span>
        <h3>{show.name || 'Eigenes Theme'}</h3><p>{show.mode === 'dark' ? 'Dunkel' : 'Hell'} · {motifs[show.motif]} · {show.motion ? 'Mit Bewegung' : 'Ohne Bewegung'}</p>
        <div className="swatches" aria-hidden="true"><i style={{background:show.accent}}/><i style={{background:show.highlight}}/><i className="surface-dot"/></div>
      </div>
    </div>
    <div className="form-actions">
      {!draft && <button ref={activateButton} className="button primary" disabled={!!action || !isPreview} onClick={activateChosen}>{action === 'activate' ? 'Wird aktiviert …' : 'Für alle aktivieren'}</button>}
      {isPreview && <button className="button secondary" disabled={!!action} onClick={() => select(library.themes.find(t => t.id === library.active))}>Vorschau beenden</button>}
      {!draft && owned(selected) && selected !== library.active && !confirmDelete && <button className="button danger-quiet" disabled={!!action} onClick={() => setConfirmDelete(true)}>Eigenes Theme entfernen</button>}
    </div>
    {confirmDelete && chosen && <div className="delete-prompt" role="group" aria-label="Theme entfernen">
      <p>„{chosen.name}“ aus der Sammlung entfernen?</p><div className="form-actions">
        <button autoFocus className="button secondary" disabled={!!action} onClick={() => setConfirmDelete(false)}>Behalten</button>
        <button className="button danger" disabled={!!action} onClick={remove}>Endgültig entfernen</button></div>
    </div>}
    {feedback && <p className={'feedback ' + (feedback.error ? 'error' : '')} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <section className="studio-build"><div className="section-intro"><h3>Eigenes Theme</h3>
      <p>Starte mit der aktuellen Vorlage oder beschreibe deinen Stil.</p></div>
      <form className="brief-form" onSubmit={generate}>
        <label>Gestaltungswunsch<textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={600} rows={2} placeholder="Z. B. City-Pop bei Nacht: Petrol, Apricot und sanfte Lichtbänder"/></label>
        <small>{aiReady ? 'Nur dieser Text geht an OpenAI. Der Entwurf kann API-Kosten verursachen.' : 'Für KI-Entwürfe: KI und OpenAI-Schlüssel unter „KI-Zugänge“ einrichten. Manuelles Gestalten ist immer möglich.'}</small>
        <div className="form-actions"><button className="button secondary" disabled={!!action || !aiReady || !prompt.trim()}><Icon name="spark" size={16}/>{action === 'generate' ? 'Entwurf entsteht …' : 'KI-Entwurf erstellen'}</button>
        {!draft && <button type="button" className="button quiet" disabled={!!action} onClick={() => {beginDraft({...recipe(show), name:'Mein Theme'}); setFeedback(null);}}>Manuell gestalten</button>}</div>
      </form>
      {draft && <form className="recipe-form" onSubmit={save}><fieldset disabled={!!action}><legend>Entwurf bearbeiten</legend>
        <label>Theme-Name<input ref={nameInput} maxLength={48} value={draft.name} required onChange={e => edit({...draft,name:e.target.value})}/></label>
        <div className="field-pair"><div className="recipe-field"><label htmlFor="theme-mode">Grundmodus</label><select id="theme-mode" value={draft.mode} onChange={e => edit({...draft,mode:e.target.value})}><option value="light">Hell</option><option value="dark">Dunkel</option></select></div>
          <div className="recipe-field"><label htmlFor="theme-shape">Kanten</label><select id="theme-shape" value={draft.shape} onChange={e => edit({...draft,shape:e.target.value})}>{Object.entries(shapes).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></div></div>
        <div className="field-pair">{[['accent','Akzentfarbe'],['highlight','Zweitfarbe']].map(([key,title])=><div className="recipe-field" key={key}><label htmlFor={'theme-'+key}>{title}</label><span className="colour-field"><input id={'theme-'+key} type="color" value={draft[key]} onChange={e=>edit({...draft,[key]:e.target.value})}/><code>{draft[key].toUpperCase()}</code></span></div>)}</div>
        <div className="recipe-field"><label htmlFor="theme-motif">Motiv</label><select id="theme-motif" value={draft.motif} onChange={e=>edit({...draft,motif:e.target.value})}>{Object.entries(motifs).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></div>
        <label className="check-line"><input type="checkbox" checked={draft.motion} onChange={e=>edit({...draft,motion:e.target.checked})}/>Passende Animationen erlauben</label>
        <button className="button primary" disabled={!draft.name.trim()}>{action === 'save' ? 'Speichert …' : 'Theme speichern'}</button>
      </fieldset></form>}
    </section>
  </div>;
}
