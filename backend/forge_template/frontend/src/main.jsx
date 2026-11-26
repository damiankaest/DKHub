import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Field, Panel } from '@dkforge/ui';
import '@dkforge/ui/styles.css';
import './style.css';

async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Die Anfrage ist fehlgeschlagen (HTTP ${response.status}).`);
  return response.json();
}

function App() {
  const [project, setProject] = useState(null);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const item = await request('/api/project');
      document.title = item.name;
      setProject(item);
      if (item.sqlite || item.postgres) setNotes(await request('/api/notes'));
    }
    load().catch(err => setError(err.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const note = await request('/api/notes', { text });
      setNotes(previous => [note, ...previous].slice(0, 50));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <main>
    <header>
      <h1>{project?.name ?? 'Projekt wird geladen …'}</h1>
      {project && <p>{project.description}</p>}
    </header>
    {error && <p role="alert">{error}</p>}
    {project && <Panel className="notes">
      <h2>{project.sqlite || project.postgres ? 'Beispiel-Notizen' : 'Das Projekt läuft'}</h2>
      {project.sqlite || project.postgres ? <>
        <p>Die Notizen werden in {project.postgres ? 'PostgreSQL' : 'SQLite'} gespeichert.</p>
        <form onSubmit={save}>
          <Field id="note" label="Neue Notiz" value={text} maxLength={300} onChange={event => setText(event.target.value)} />
          <Button type="submit" disabled={saving || !text.trim()}>Speichern</Button>
        </form>
        {notes.length ? <ul>{notes.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>Noch keine Notizen.</p>}
      </> : <p>Frontend und Backend sind verbunden. Die geplanten Funktionen stehen in <code>docs/roadmap.md</code>.</p>}
    </Panel>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
