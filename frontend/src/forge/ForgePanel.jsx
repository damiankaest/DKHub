import React, { useEffect, useRef, useState } from 'react';
import { Notice } from '../director/Notice';
import './forge.css';

const base = '/api/forge/projects';
const active = status => ['queued', 'running'].includes(status);
const lines = value => value.split('\n').map(line => line.trim()).filter(Boolean);
const blank = { name: '', description: '', features: '', design: '', sqlite: false, use_ai: false };
const fields = [
  ['description', 'Projektbeschreibung und Ziel'], ['audience', 'Zielgruppe'], ['design', 'Designvorstellung'],
  ['pages', 'Vorgeschlagene Seiten', true], ['features', 'Gewünschte Funktionen', true],
  ['data_model', 'Grobes Datenmodell', true], ['roadmap', 'Priorisierte Roadmap', true],
  ['assumptions', 'Technische Annahmen', true],
];
const phaseText = {
  plan: 'Planung', generate: 'Projektordner erzeugen', build: 'Docker-Image bauen',
  start: 'Dienst starten', health: 'HTTP-Erreichbarkeit prüfen', catalog: 'Kachel registrieren',
};

function ProjectField({ label, value, onChange, multiple = false }) {
  return <label className="director-label">{label}
    <textarea required rows={multiple ? 3 : 2} maxLength={multiple ? 9000 : 800}
      value={value} onChange={event => onChange(event.target.value)} />
    {multiple && <small>Ein Eintrag pro Zeile.</small>}
  </label>;
}

function ProjectProgress({ project, disabled, onBuild, onRedeploy, onWatch, onBackup }) {
  const [copyMessage, setCopyMessage] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const command = `code '${project.path.replaceAll("'", "''")}'`;
  const working = active(project.status);
  const ready = project.status === 'ready';
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyMessage('Befehl kopiert.');
    } catch {
      setCopyMessage('Markiere den Befehl im Feld und kopiere ihn manuell.');
    }
  }
  return <section className="service-box forge-panel" aria-label="Projektstatus">
    <h2>{project.plan.name}</h2>
    <p>Das Projekt enthält die Beispiel-App. Die geplanten Fachfunktionen stehen in der Roadmap im Projektordner.</p>
    <dl className="forge-progress">
      <dt>Projektordner auf dem DKHub-Server</dt><dd><code>{project.path}</code></dd>
      <dt>Docker-Image</dt><dd>{project.image_built ? <code>{project.image}</code> : 'Ausstehend'}</dd>
      {project.published_image && <><dt>Letzte erfolgreiche Veröffentlichung</dt><dd><code>{project.published_image}</code></dd></>}
      <dt>Dienst</dt><dd>{project.service_id ? <code>{project.service_id}</code> :
        (project.image_built && project.phase === 'start' ? <>Start noch nicht bestätigt. Vorgesehene ID <code>{project.expected_service_id}</code></> : 'Ausstehend')}</dd>
      <dt>DKHub-Kachel</dt><dd>{project.tile_id ? 'Registriert' : 'Ausstehend'}</dd>
    </dl>
    {project.status === 'queued' && <Notice type="busy">Der Build ist in der Warteschlange.</Notice>}
    {project.status === 'running' && <Notice type="busy">{phaseText[project.phase]} …</Notice>}
    {project.error && <Notice type="error">{phaseText[project.phase]} fehlgeschlagen. {project.error}</Notice>}
    {project.log && project.phase === 'build' && project.error && <p>Build-Protokoll auf dem Server <code>{project.log}</code></p>}
    {ready ? <><Notice type="success">Die Beispiel-App ist erreichbar und im Hub registriert.</Notice>
      <a className="button primary forge-action" href={project.url} target="_blank" rel="noreferrer">Beispiel-App öffnen</a></> :
      <button type="button" className="button primary forge-action" disabled={disabled || working} onClick={onBuild}>
        {project.status === 'failed' ? 'Ab gespeichertem Stand erneut versuchen' : 'Bauen und starten'}
      </button>}
    {(ready || project.published_image) && <div className="forge-editor-link">
      <h3>Veröffentlichung</h3>
      <p>Die App wird beim Wechsel kurz angehalten. Daten und Port bleiben erhalten. Eine fehlerhafte Version löst einen Container-Rollback aus.</p>
      <button type="button" className="button secondary forge-action" disabled={disabled || working} onClick={onRedeploy}>Neu veröffentlichen</button>
      <label className="forge-check"><input type="checkbox" checked={Boolean(project.watch)}
        disabled={disabled} onChange={event => onWatch(event.target.checked)} /> Lokale Quelländerungen automatisch veröffentlichen</label>
    </div>}
    {project.plan.postgres && project.service_id && <div className="forge-editor-link">
      <h3>PostgreSQL</h3>
      <button type="button" className="button secondary forge-action" disabled={disabled || working}
        onClick={() => onBackup(setBackupPath)}>Datenbank sichern</button>
      {backupPath && <p role="status">Dump auf dem DKHub-Server <code>{backupPath}</code></p>}
    </div>}
    <div className="forge-editor-link">
      <h3>In VS Code weiterarbeiten</h3>
      <p>Führe den Befehl in PowerShell auf dem Windows-PC aus, auf dem DKHub läuft. Auf anderen Geräten ist dies ein Serverpfad.</p>
      <label className="director-label">PowerShell-Befehl<input readOnly value={command} onFocus={event => event.target.select()} /></label>
      <button type="button" className="button secondary forge-action" onClick={copy}>Befehl kopieren</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>
  </section>;
}

export function ForgePanel({ locked, visible, request, onCompleted }) {
  const [idea, setIdea] = useState(blank);
  const [draft, setDraft] = useState(null);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState(null);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const latestRequest = useRef(request);
  latestRequest.current = request;
  const completed = useRef(new Set());
  const loading = locked || Boolean(pending);
  const projectId = project?.id;
  const working = active(project?.status);

  useEffect(() => {
    if (!visible || locked || !projectId || (!working && !project.watch)) return;
    let disposed = false;
    let timer;
    async function poll() {
      try {
        const next = await latestRequest.current(`${base}/${projectId}/status`);
        if (disposed) return;
        setProject(next);
        setError('');
        if (!active(next.status) && !next.watch) return;
      } catch (err) {
        if (disposed) return;
        setError(err.message);
      }
      timer = setTimeout(poll, 1800);
    }
    timer = setTimeout(poll, 700);
    return () => { disposed = true; clearTimeout(timer); };
  }, [visible, locked, projectId, working, project?.watch]);

  useEffect(() => {
    const release = project?.published_image || project?.id;
    if (project?.status !== 'ready' || completed.current.has(release)) return;
    completed.current.add(release);
    Promise.resolve().then(onCompleted).catch(() => setError('Die Kachel ist gespeichert. Lade die Bibliothek erneut, um sie zu sehen.'));
  }, [project, onCompleted]);

  async function run(label, callback) {
    setPending(label);
    setError('');
    try { await callback(); }
    catch (err) { setError(err.message || 'Die Anfrage ist fehlgeschlagen.'); }
    finally { setPending(''); }
  }
  function select(record) {
    setProject(record);
    setDraft(Object.fromEntries(Object.entries(record.plan).map(
      ([key, value]) => [key, Array.isArray(value) ? value.join('\n') : value])));
  }
  function createDraft(event) {
    event.preventDefault();
    run('Projektplan wird erstellt …', async () => select(await request(base, { ...idea, features: lines(idea.features) })));
  }
  function generate(event) {
    event.preventDefault();
    run('Projektordner wird erzeugt …', async () => {
      const plan = { ...draft, data_model: [] };
      for (const [key, , multiple] of fields) if (multiple && (key !== 'data_model' || draft.sqlite || draft.postgres)) plan[key] = lines(draft[key]);
      const saved = await request(`${base}/${project.id}/plan`, { revision: project.revision, plan }, 'PUT');
      setProject(saved);
      setProject(await request(`${base}/${project.id}/generate`, { revision: saved.revision }));
    });
  }
  const setIdeaField = (key, value) => setIdea(current => ({ ...current, [key]: value }));
  const setDraftField = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  return <div className="forge-view">
    <div className="forge-toolbar">
      <button type="button" className="button secondary" disabled={loading}
        onClick={() => run('Projekte werden geladen …', async () => setProjects(await request(base + '/list')))}>Gespeicherte Projekte</button>
      {projects && <label className="director-label">Projekt öffnen
        <select value={projectId ?? ''} disabled={loading} onChange={event => {
          const id = event.target.value;
          if (id) run('Projekt wird geladen …', async () => select(await request(`${base}/${id}/status`)));
        }}>
          <option value="">{projects.length ? 'Projekt auswählen' : 'Keine Projekte vorhanden'}</option>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {project && <button type="button" className="button quiet" disabled={Boolean(pending)} onClick={() => {
        setProject(null); setDraft(null); setIdea(blank); setError('');
      }}>Neue Idee</button>}
    </div>
    {locked && <Notice>Gib das Admin-Passwort ein, um Projekte zu planen oder zu bauen.</Notice>}
    {pending && <Notice type="busy">{pending}</Notice>}
    {error && <Notice type="error">{error}</Notice>}
    {!project && <form className="service-box forge-panel" onSubmit={createDraft}>
      <h2>Neuen eigenen Dienst erstellen</h2>
      <p>Beschreibe deine Web-App. DKForge erstellt einen bearbeitbaren Plan und eine lauffähige Vorlage.</p>
      <fieldset className="forge-fields" disabled={loading} aria-label="Projektidee">
        <label className="director-label">Projektname<input required maxLength={60} value={idea.name} onChange={event => setIdeaField('name', event.target.value)} /></label>
        <ProjectField label="Beschreibung und Ziel" value={idea.description} onChange={value => setIdeaField('description', value)} />
        <ProjectField label="Gewünschte Funktionen" multiple value={idea.features} onChange={value => setIdeaField('features', value)} />
        <ProjectField label="Grobe Designvorstellung" value={idea.design} onChange={value => setIdeaField('design', value)} />
        <label className="forge-check"><input type="checkbox" checked={idea.sqlite} disabled={idea.postgres} onChange={event => setIdeaField('sqlite', event.target.checked)} /> SQLite für dauerhafte Daten</label>
        <label className="forge-check"><input type="checkbox" checked={Boolean(idea.postgres)} disabled={idea.sqlite} onChange={event => setIdeaField('postgres', event.target.checked)} /> Gemeinsames PostgreSQL mit eigener Projektdatenbank</label>
        <label className="forge-check"><input type="checkbox" checked={idea.use_ai} onChange={event => setIdeaField('use_ai', event.target.checked)} /> Konfigurierte KI für den Plan verwenden</label>
        <button className="button primary forge-action">Plan entwerfen</button>
      </fieldset>
    </form>}
    {project && !project.generated && <form className="service-box forge-panel" onSubmit={generate}>
      <h2>Projektplan bearbeiten</h2>
      <p>{project.source === 'ai' ? 'KI-Entwurf' : 'Manueller Entwurf'} für das Grundgerüst und die weitere Entwicklung.</p>
      {project.notice && <Notice>{project.notice}</Notice>}
      {project.error && <Notice type="error">{project.error}</Notice>}
      <fieldset className="forge-fields" disabled={loading} aria-label="Projektplan">
        <label className="director-label">Projektname<input required maxLength={60} value={draft.name} onChange={event => setDraftField('name', event.target.value)} /></label>
        <label className="forge-check"><input type="checkbox" checked={draft.sqlite} disabled={draft.postgres} onChange={event => setDraftField('sqlite', event.target.checked)} /> SQLite für dauerhafte Daten</label>
        <label className="forge-check"><input type="checkbox" checked={Boolean(draft.postgres)} disabled={draft.sqlite} onChange={event => setDraftField('postgres', event.target.checked)} /> Gemeinsames PostgreSQL mit eigener Projektdatenbank</label>
        {fields.filter(([key]) => key !== 'data_model' || draft.sqlite || draft.postgres).map(([key, label, multiple]) =>
          <ProjectField key={key} label={label} value={draft[key]} multiple={multiple} onChange={value => setDraftField(key, value)} />)}
        <button className="button primary forge-action">Bestätigen und Projekt erzeugen</button>
      </fieldset>
    </form>}
    {project?.generated && <ProjectProgress key={project.id} project={project} disabled={loading}
      onRedeploy={() => run('Neuveröffentlichung wird gestartet …', async () => {
        setProject(await request(`${base}/${project.id}/redeploy`, { revision: project.revision }));
      })}
      onWatch={enabled => run('Veröffentlichungseinstellung wird gespeichert …', async () => {
        setProject(await request(`${base}/${project.id}/watch`, { enabled }, 'PUT'));
      })}
      onBackup={show => run('PostgreSQL wird gesichert …', async () => {
        const backup = await request(`${base}/${project.id}/postgres/backup`);
        show(backup.path);
      })}
      onBuild={() => run('Build wird gestartet …', async () => {
        setProject(await request(`${base}/${project.id}/build`, { revision: project.revision }));
      })} />}
  </div>;
}
