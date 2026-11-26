import React from 'react';
import { Icon } from '../Icon';
import { describe, isActive, outdated } from './serviceStatus';

export function ServiceCard({ service, tile, health, favorite, disabled, locked, working, onOpen, onFavorite, onConfigure, onPublish, onRemove, onCheck, onToggle }) {
  const status = describe(service, health);
  const active = isActive(service);
  const stale = outdated(tile, service);
  const off = disabled || locked;
  // Exactly one highlighted next step per service.
  const primary = status.tone === 'bad' && active ? 'stop' : !active ? 'start' : !tile ? 'publish' : stale ? 'update' : 'open';
  const titleId = 'service-' + service.id;
  const toggleLabel = working || (active ? 'Stoppen' : 'Starten');
  const publish = className => <button type="button" className={'button ' + className} disabled={off || !service.host_port} onClick={() => onPublish(service)}>{tile ? 'Adresse aktualisieren' : 'Zur Bibliothek hinzufügen'}</button>;

  return <article className={'service-card tone-' + status.tone} aria-labelledby={titleId}>
    <header className="service-card-head">
      <div>
        <h3 id={titleId}>{service.name}</h3>
        <p className="service-status" role="status"><span className="service-dot" aria-hidden="true" />{status.label}</p>
      </div>
      {tile && <button type="button" className="icon-button service-favorite" aria-pressed={favorite} aria-label={favorite ? 'Favorit entfernen' : 'Als Favorit'} title={favorite ? 'Favorit entfernen' : 'Als Favorit'} onClick={() => onFavorite(tile.id)}><Icon name="star" size={19} filled={favorite} /></button>}
    </header>
    {status.text && <p className="service-hint">{status.text}</p>}
    <p className="service-library">{!tile ? 'Nicht in der Bibliothek' : stale ? 'Die Kachel zeigt noch auf eine alte Adresse' : 'In der Bibliothek'}</p>
    <div className="service-actions" role="group" aria-label={`Aktionen für ${service.name}`}>
      {primary === 'open' && (tile.mode === 'external'
        ? <a className="button primary" href={tile.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(tile)}>Öffnen<Icon name="external" size={15} /></a>
        : <button type="button" className="button primary" onClick={() => onOpen(tile)}>Öffnen</button>)}
      {(primary === 'start' || primary === 'stop') && <button type="button" className="button primary" disabled={off} onClick={() => onToggle(service)}>{toggleLabel}</button>}
      {(primary === 'publish' || primary === 'update') && publish('primary')}
      {tile && <button type="button" className="button secondary" disabled={disabled} onClick={() => onConfigure(tile)}>Konfigurieren</button>}
      {!tile && primary !== 'publish' && service.host_port && publish('secondary')}
      {stale && primary !== 'update' && publish('secondary')}
    </div>
    <details className="service-more">
      <summary>Mehr Optionen<Icon name="down" size={15} /></summary>
      <div className="service-actions">
        <button type="button" className="button secondary" disabled={off} onClick={() => onCheck(service)}>Erneut prüfen</button>
        {primary !== 'start' && primary !== 'stop' && <button type="button" className="button secondary" disabled={off} onClick={() => onToggle(service)}>{toggleLabel}</button>}
        {tile && <button type="button" className="button danger-quiet" disabled={off} onClick={() => onRemove(tile)}>Aus Bibliothek entfernen</button>}
      </div>
      {(service.fixed_port === false || service.autostart === false) && <p>Älterer Dienst: {service.fixed_port === false ? 'Seine Adresse kann sich bei jedem Start ändern. ' : ''}{service.autostart === false ? 'Er startet nach einem Neustart des Rechners nicht von selbst.' : ''}</p>}
      <dl>
        <dt>Vorlage</dt><dd>{service.image}</dd>
        {service.host_port && <><dt>Adresse</dt><dd>{service.host_ip ? `${service.host_ip}:` : 'Port '}{service.host_port}</dd></>}
        {health?.status === 'reachable' && <><dt>Antwort</dt><dd>HTTP {health.http_status}</dd></>}
      </dl>
    </details>
  </article>;
}
