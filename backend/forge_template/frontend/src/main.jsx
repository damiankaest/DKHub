import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
      if (item.sqlite) setNotes(await request('/api/notes'));
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
    {project && <section>
      <h2>{project.sqlite ? 'Beispiel-Notizen' : 'Das Projekt läuft'}</h2>
      {project.sqlite ? <>
        <p>Die Notizen werden in SQLite gespeichert.</p>
        <form onSubmit={save}>
          <label htmlFor="note">Neue Notiz</label>
          <input id="note" value={text} maxLength={300} onChange={event => setText(event.target.value)} />
          <button disabled={saving || !text.trim()}>Speichern</button>
        </form>
        {notes.length ? <ul>{notes.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>Noch keine Notizen.</p>}
      </> : <p>Frontend und Backend sind verbunden. Die geplanten Funktionen stehen in <code>docs/roadmap.md</code>.</p>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
