import React, { useState } from 'react';
import { decideChat } from './chatDecision';

const welcome = { role: 'assistant', text: 'Hallo! Ich kann deine registrierten Apps suchen und öffnen. Probiere „Öffne Wetter“ oder „Suche Musik“.' };

export function HubChat({ apps, status, favorites, onOpen, onHome }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([welcome]);
  async function submit(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setMessages(current => [...current, { role: 'user', text: message }]);
    if (status !== 'ready') {
      setMessages(current => [...current, { role:'assistant', text:'Die App-Liste ist gerade nicht verfügbar. Bitte prüfe die Verbindung und lade die Seite neu.' }]);
      return;
    }
    if (mode === 'ai') {
      setBusy(true);
      try {
        const history = messages.slice(-6).map(item => ({role:item.role, text:item.text.slice(0,500)}));
        const response = await fetch('/api/chat/ai', { method:'POST', headers:{'Content-Type':'application/json', 'X-DKHub-Admin':password}, body:JSON.stringify({message, history}) });
        if (response.status === 403) throw new Error('Das Admin-Passwort oder die Anfrage ist ungültig.');
        if (response.status === 503) throw new Error('Der KI-Chat ist noch nicht eingerichtet. Bitte die Hinweise in der README prüfen.');
        if (response.status === 429) throw new Error('Eine Anfrage läuft bereits. Bitte kurz warten.');
        if (!response.ok) throw new Error('Die KI-Anfrage ist fehlgeschlagen. Bitte versuche es später erneut.');
        const data = await response.json();
        setMessages(current => [...current, { role:'assistant', text:data.reply, ids:data.app_ids }]);
      } catch (error) {
        setMessages(current => [...current, { role:'assistant', text:error.message || 'Die KI-Anfrage ist fehlgeschlagen.' }]);
      } finally { setBusy(false); }
      return;
    }
    const decision = decideChat(message, apps, favorites);
    setMessages(current => [...current, { role:'assistant', text:decision.text, ids:decision.ids || [] }]);
    if (decision.kind === 'open') {
      const app = apps.find(item => item.id === decision.id);
      if (app) onOpen(app);
    } else if (decision.kind === 'home') onHome();
  }
  return <div className="hub-chat">
    {!visible && <button className="chat-launcher" type="button" onClick={() => setVisible(true)} aria-label="DKHub Chat öffnen">✦ <span>Chat</span></button>}
    {visible && <section className="chat-panel" aria-label="DKHub Chat">
      <header className="chat-header"><div><strong>DKHub Chat</strong><small>{mode === 'ai' ? 'KI · Jev + Sprachmodell' : 'Regelbasiert · Deine Apps'}</small></div><button type="button" onClick={() => setVisible(false)} aria-label="Chat schließen">×</button></header>
      <div className="chat-mode"><button type="button" aria-pressed={mode === 'local'} onClick={() => {setMode('local'); setPassword('');}}>Lokal</button><button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}>KI-Chat</button></div>
      {mode === 'ai' && <div className="chat-ai-info"><p>Deine Nachricht geht an TypeSafe; Nachricht, Chatverlauf sowie App-Namen, Kategorien und Kurz- und ausführliche Beschreibungen gehen an OpenAI. Es können API-Kosten entstehen.</p><label>Admin-Passwort<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label></div>}
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Chatverlauf">{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><p>{message.text}</p>{message.ids?.map(id => {
        const app = apps.find(item => item.id === id);
        if (!app) return null;
        return app.mode === 'embed' ? <button type="button" className="chat-result" key={id} onClick={() => onOpen(app)}>{app.name} öffnen ↗</button> : <a className="chat-result" key={id} href={app.url} target="_blank" rel="noopener noreferrer">{app.name} im neuen Tab öffnen ↗</a>;
      })}</div>)}</div>
      <form className="chat-form" onSubmit={submit}><label className="sr-only" htmlFor="chat-input">Nachricht an DKHub</label><input id="chat-input" value={input} onChange={event => setInput(event.target.value)} maxLength="500" placeholder="Schreibe eine Nachricht …" autoComplete="off"/><button type="submit" disabled={!input.trim() || busy || (mode === 'ai' && !password)} aria-label="Nachricht senden">{busy ? '…' : '➜'}</button></form>
    </section>}
  </div>;
}
