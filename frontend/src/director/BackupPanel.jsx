import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { Notice } from './Notice';
import './storage.css';

const stoppedStates = new Set(['exited', 'created', 'dead']);
const timeFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'medium' });

function backupError(err, operation) {
  const detail = err.message || 'Verbindung fehlgeschlagen.';
  if (/backup incomplete/i.test(detail)) return `Das Backup ist unvollständig. Ein Teil der Sicherungsdateien kann bereits auf dem Rechner liegen. ${detail}`;
  if (/restore incomplete/i.test(detail)) {
    return `Wiederherstellung unvollständig. Ziel-Volumes können Teildaten enthalten. Prüfe die betroffenen Volumes vor der Aktivierung. ${detail}`;
  }
  if (/expired|does not match this backup/i.test(detail)) return 'Der Wiederherstellungsplan ist abgelaufen oder ungültig. Lade eine neue Vorschau.';
  if (/checksum mismatch/i.test(detail)) return 'Die Prüfsumme stimmt nicht. Die Sicherungsdatei ist beschädigt oder wurde verändert.';
  if (/backup changed after restore preview/i.test(detail)) return 'Das Backup wurde seit der Vorschau geändert. Prüfe das Backup und lade eine neue Vorschau.';
  if (/no recorded managed volumes|no managed volumes|volumes? (differ|ownership)|mounts differ/i.test(detail)) {
    return `Verwaltete Volumes fehlen oder stimmen nicht mit der Dienstdefinition überein. ${detail}`;
  }
  if (/stop .* before backup|stop the service/i.test(detail)) return 'Stoppe den Dienst und alle Container, die seine Volumes verwenden, bevor du ein Backup erstellst.';
  if (/already exists|another director data|too many pending/i.test(detail)) return `Konflikt bei der Sicherungsaktion. ${detail}`;
  if (err.status === 404) return 'Dieses Backup ist nicht mehr verfügbar. Aktualisiere die Backup-Liste.';
  if (operation === 'restore') return `Der Restore konnte nicht bestätigt werden. Prüfe, ob Ziel-Volumes entstanden sind, bevor du es erneut versuchst. ${detail}`;
  return detail;
}

function backupTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? timeFormat.format(date) : 'Unbekanntes Datum';
}

function VolumeList({ volumes }) {
  return <ul className="storage-volumes">
    {volumes.map(volume => <li key={volume.name}>
      <strong>{volume.key}</strong> <code>{volume.target}</code>
      <code className="storage-volume-name">{volume.name}</code>
    </li>)}
  </ul>;
}

export function BackupPanel({ service, locked, disabled, request, onBusyChange }) {
  const id = useId();
  const planHeading = useRef(null);
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState(null);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState(null);
  const [plan, setPlan] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [expired, setExpired] = useState(false);
  const [restored, setRestored] = useState(null);

  const base = `/api/director/services/${service.id}/backups`;
  const volumes = service.volumes ?? [];
  const stopped = stoppedStates.has(service.state);
  const off = locked || disabled || Boolean(pending);

  useEffect(() => {
    if (!plan) return;
    planHeading.current?.focus();
    const timer = setTimeout(() => setExpired(true), Math.max(0, plan.deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [plan]);

  async function run(label, action, operation) {
    setPending(label);
    onBusyChange(true);
    setMessage(null);
    try { await action(); }
    catch (err) { setMessage({ type: 'error', text: backupError(err, operation) }); }
    finally { setPending(''); onBusyChange(false); }
  }

  function refresh() {
    run('Backups werden geladen …', async () => setBackups(await request(base + '/list')));
  }

  function toggle() {
    if (!open && !locked && backups === null) refresh();
    setOpen(!open);
  }

  function create() {
    run('Backup wird erstellt …', async () => {
      const backup = await request(base);
      setBackups(previous => [backup, ...(previous ?? []).filter(item => item.id !== backup.id)]);
      setMessage({ type: 'success', text: 'Backup wurde erstellt.' });
    });
  }

  function preview(backupId) {
    setPlan(null);
    setConfirmation('');
    setExpired(false);
    setRestored(null);
    run('Vorschau wird geladen und Backup geprüft …', async () => {
      const data = await request(`${base}/${backupId}/restore/preview`);
      const deadline = Date.now() + data.expires_in * 1000;
      setPlan({ ...data, backupId, deadline });
    });
  }

  function restore(event) {
    event.preventDefault();
    if (off || !plan || expired || confirmation !== plan.confirmation) return;
    if (Date.now() >= plan.deadline) { setExpired(true); return; }
    const attempt = plan;
    setPlan(null);
    setConfirmation('');
    run('Daten werden in neue Volumes geschrieben …', async () => {
      const result = await request(`${base}/${attempt.backupId}/restore`, {
        plan_id: attempt.plan_id, confirmation,
      });
      setRestored(result.volumes);
    }, 'restore');
  }

  return <div className="storage-disclosure">
    <button type="button" className="button secondary" aria-expanded={open} aria-controls={id}
      disabled={Boolean(pending) || (!open && disabled)} onClick={toggle}>
      <Icon name="server" size={16} />Daten und Backups
    </button>
    <section className="director-storage" id={id} hidden={!open} aria-labelledby={id + '-heading'}>
      <h4 id={id + '-heading'}>Verwaltete Volumes</h4>
      {volumes.length > 0 ? <VolumeList volumes={volumes} /> :
        !service.volume_issue && <p>Für diesen Dienst sind keine Volumes in DKHub eingerichtet.</p>}
      <h4>Backups</h4>
      <p>Backup-Dateien liegen unverschlüsselt auf dem DKHub-Rechner und können Zugangsdaten enthalten.</p>
      <p>{stopped ? 'Der Dienst ist gestoppt.' : 'Stoppe den Dienst, um ein Backup zu erstellen.'}</p>
      {locked && <p>Gib das Admin-Passwort ein, um Backups zu laden oder zu verwalten.</p>}
      <div className="service-actions">
        <button type="button" className="button secondary" disabled={off} onClick={refresh}>Backups laden</button>
        <button type="button" className="button secondary" disabled={off || !stopped || !volumes.length || Boolean(service.volume_issue)}
          onClick={create}>Backup erstellen</button>
      </div>
      {pending && <Notice type="busy">{pending}</Notice>}
      {message && <Notice type={message.type}>{message.text}</Notice>}
      {backups?.length === 0 && <p>Es gibt noch keine Backups für diesen Dienst.</p>}
      {backups?.length > 0 && <ul className="storage-backups" aria-label="Vorhandene Backups">
        {backups.map(backup => <li key={backup.id}>
          <time dateTime={backup.created_utc}>{backupTime(backup.created_utc)}</time>
          <small>{backup.volumes.length} {backup.volumes.length === 1 ? 'Volume' : 'Volumes'}</small>
          <button type="button" className="button secondary" disabled={off} onClick={() => preview(backup.id)}>Restore-Vorschau</button>
        </li>)}
      </ul>}
      {plan && <form className="storage-restore" onSubmit={restore}>
        <h4 ref={planHeading} tabIndex={-1}>Restore-Vorschau</h4>
        <p>Der Restore schreibt in neue Volumes. Der Dienst behält seine bisherigen Mounts. Die neuen Volumes musst du anschließend manuell aktivieren.</p>
        <dl className="storage-targets">
          {plan.targets.map(target => <div key={target.name}>
            <dt>{target.key} <code>{target.target}</code></dt>
            <dd>Quelle <code>{target.source}</code></dd>
            <dd>Neues Ziel <code>{target.name}</code></dd>
          </div>)}
        </dl>
        {expired ? <Notice type="error">Die Vorschau ist abgelaufen. Lade eine neue Vorschau für dieses Backup.</Notice> :
          <label className="director-label">Zur Bestätigung {plan.confirmation} eingeben
            <input value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={off} autoComplete="off" spellCheck={false} />
          </label>}
        <div className="service-actions">
          <button type="button" className="button secondary" onClick={() => setPlan(null)}>Abbrechen</button>
          {expired ? <button type="button" className="button secondary" disabled={off} onClick={() => preview(plan.backupId)}>Neue Vorschau laden</button> :
            <button type="submit" className="button primary" disabled={off || confirmation !== plan.confirmation}>In neue Volumes wiederherstellen</button>}
        </div>
      </form>}
      {restored && <div className="storage-restore">
        <Notice type="success">Daten wurden in neue Volumes kopiert. Der Dienst nutzt weiterhin seine bisherigen Volumes. Die Aktivierung erfolgt manuell.</Notice>
        <VolumeList volumes={restored} />
      </div>}
    </section>
  </div>;
}
