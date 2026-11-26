import React, { useEffect, useRef, useState } from 'react';
import { removeApp } from './api';
import { useAuthRequired } from './auth';
import { Icon } from './Icon';
import { InstallPanel } from './director/InstallPanel';
import { Notice } from './director/Notice';
import { ServiceCard } from './director/ServiceCard';
import { isActive, tileId } from './director/serviceStatus';

async function call(path, password, body) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DKHub-Admin': password },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 403) throw new Error('Admin-Passwort oder Anfrage ist ungültig.');
  if (!response.ok) {
    const detail = await response.json().then(data => data.detail, () => null);
    throw new Error(typeof detail === 'string' ? detail : 'Aktion fehlgeschlagen. Prüfe den Dienstzustand, bevor du erneut versuchst.');
  }
  return response.json();
}

export function Director({ apps, favorites, onFavorite, onConfigure, onOpen, onClose, onCatalogChanged }) {
  const [password, setPassword] = useState('');
  const [view, setView] = useState('list');
  const [services, setServices] = useState(null);
  const [checks, setChecks] = useState({});
  const [working, setWorking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [installed, setInstalled] = useState(0);
  const latestCheck = useRef({});
  const authRequired = useAuthRequired();
  const locked = authRequired && !password;
  const busy = loading || Boolean(working);

  // Counting per service keeps a slower, older answer from replacing a newer one.
  function nextTurn(id) { latestCheck.current[id] = (latestCheck.current[id] || 0) + 1; return latestCheck.current[id]; }
  async function check(id, wait = 0) {
    const turn = nextTurn(id);
    const show = health => { if (latestCheck.current[id] === turn) setChecks(old => ({ ...old, [id]: health })); };
    show({ status: 'checking' });
    try { show(await call(`/api/director/services/${id}/health?wait=${wait}`, password)); }
    catch (err) { show({ status: 'error', message: err.message || 'Prüfung fehlgeschlagen.' }); }
  }
  async function refresh() {
    const list = await call('/api/director/list', password);
    setServices(list);
    return list;
  }
  async function reload() {
    setLoading(true); setNotice(null);
    try {
      for (const service of await refresh()) if (service.state === 'running') check(service.id);
    } catch (err) { setNotice({ type: 'error', text: err.message || 'Verbindung fehlgeschlagen.' }); }
    finally { setLoading(false); }
  }
  // Without a password the list can load right away; otherwise it needs the button below.
  useEffect(() => { if (!authRequired) reload(); }, [authRequired]);

  async function act(id, label, action) {
    setWorking({ id, label }); setNotice(null);
    try { await action(); }
    catch (err) { setNotice({ type: 'error', text: err.message || 'Verbindung fehlgeschlagen.' }); }
    finally { setWorking(null); }
  }
  function publish(service) {
    act(service.id, 'Wird gespeichert …', async () => {
      await call(`/api/director/services/${service.id}/tile`, password);
      await onCatalogChanged();
      setNotice({ type: 'success', text: `${service.name} ist jetzt in deiner Bibliothek.` });
    });
  }
  function remove(tile) {
    if (!window.confirm(`Kachel „${tile.name}“ aus der Bibliothek entfernen? Der Dienst läuft weiter.`)) return;
    act(null, '', async () => { await removeApp(tile.id, password); await onCatalogChanged(); });
  }
  function toggle(service) {
    const stopping = isActive(service);
    act(service.id, stopping ? 'Wird gestoppt …' : 'Wird gestartet …', async () => {
      try { await call(`/api/director/services/${service.id}/${stopping ? 'stop' : 'start'}`, password); }
      catch (err) { await refresh().catch(() => {}); throw err; }
      nextTurn(service.id);
      setChecks(old => ({ ...old, [service.id]: undefined }));
      await refresh();
      if (!stopping) { await onCatalogChanged(); check(service.id, 30); }
    });
  }
  const search = query => call(`/api/director/search?${new URLSearchParams({ q: query })}`, password);
  // Resolves with the port options if one has to be chosen, otherwise with null.
  async function install(details) {
    setNotice(null);
    let service;
    try { service = await call('/api/director/install', password, details); }
    catch (err) {
      // A failed request may still have created something; show what exists.
      await refresh().catch(() => {});
      throw err;
    }
    if (service.port_required) return service.ports;
    setView('list'); setInstalled(count => count + 1);
    setNotice({ type: 'success', text: `${service.name} wurde installiert und in deine Bibliothek gelegt.` });
    window.scrollTo(0, 0);
    try { await onCatalogChanged(); await refresh(); check(service.id, 30); }
    catch (err) { setNotice({ type: 'error', text: `${service.name} wurde installiert, die Liste konnte aber nicht geladen werden. ${err.message}` }); }
    return null;
  }
  function show(next) { setView(next); setNotice(null); }

  return <section className="director-panel" aria-labelledby="director-title">
    <div className="director-head"><div><div className="eyebrow">DIENSTE</div><h1 id="director-title">Dienste verwalten</h1><p>Apps, die auf deinem Rechner zu Hause laufen.</p></div><button type="button" className="button secondary" onClick={onClose}>Zurück</button></div>
    {authRequired && <label className="director-label director-password">Admin-Passwort<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>}
    <div className="segmented director-views" role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={view === 'list'} onClick={() => show('list')}><Icon name="server" size={16} />Meine Dienste</button>
      <button type="button" aria-pressed={view === 'add'} onClick={() => show('add')}><Icon name="plus" size={16} />Neuer Dienst</button>
    </div>
    <div hidden={view !== 'list'}>
      {notice && <Notice type={notice.type}>{notice.text}</Notice>}
      <div className="director-list-head">
        <h2>Meine Dienste</h2>
        <button type="button" className="button quiet" disabled={busy || locked} onClick={reload}>Aktualisieren</button>
      </div>
      {loading && <Notice type="busy">Dienste werden geladen …</Notice>}
      {!loading && services === null && <div className="service-empty"><p>{locked ? 'Gib das Admin-Passwort ein und tippe auf „Aktualisieren“.' : 'Die Liste ist noch nicht geladen.'}</p></div>}
      {services?.length === 0 && <div className="service-empty"><p>Noch keine Dienste installiert.</p><button type="button" className="button primary" onClick={() => show('add')}>Ersten Dienst hinzufügen</button></div>}
      <div className="service-grid">{services?.map(service => {
        const tile = apps.find(app => app.id === tileId(service));
        return <ServiceCard key={service.id} service={service} tile={tile} health={checks[service.id]} favorite={Boolean(tile && favorites.includes(tile.id))}
          disabled={busy} locked={locked} working={working?.id === service.id ? working.label : ''}
          onOpen={onOpen} onFavorite={onFavorite} onConfigure={onConfigure} onPublish={publish} onRemove={remove} onCheck={item => check(item.id)} onToggle={toggle} />;
      })}</div>
    </div>
    {/* Stays mounted so a search survives switching views; a finished installation starts it fresh. */}
    <div hidden={view !== 'add'}><InstallPanel key={installed} locked={locked} onSearch={search} onInstall={install} /></div>
  </section>;
}
