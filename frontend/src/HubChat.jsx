import React, { useState } from 'react';
import { decideChat } from './chatDecision';

const welcome = { role: 'assistant', text: 'Hallo! Ich kann deine registrierten Apps suchen und öffnen. Probiere „Öffne Wetter“ oder „Suche Musik“.' };

export function HubChat({ apps, status, favorites, onOpen, onHome }) {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([welcome]);
  function submit(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;
    const decision = status === 'ready' ? decideChat(message, apps, favorites) : { kind: 'message', text: 'Die App-Liste ist gerade nicht verfügbar. Bitte prüfe die Verbindung und lade die Seite neu.' };
    setMessages(current => [...current, { role: 'user', text: message }, { role: 'assistant', text: decision.text, ids: decision.ids || [] }]);
    setInput('');
    if (decision.kind === 'open') {
      const app = apps.find(item => item.id === decision.id);
      if (app) onOpen(app);
    } else if (decision.kind === 'home') onHome();
  }
  return <div className="hub-chat">
    {!visible && <button className="chat-launcher" type="button" onClick={() => setVisible(true)} aria-label="DKHub Chat öffnen">✦ <span>Chat</span></button>}
    {visible && <section className="chat-panel" aria-label="DKHub Chat">
      <header className="chat-header"><div><strong>DKHub Chat</strong><small>Regelbasiert · Deine Apps</small></div><button type="button" onClick={() => setVisible(false)} aria-label="Chat schließen">×</button></header>
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Chatverlauf">{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><p>{message.text}</p>{message.ids?.map(id => {
        const app = apps.find(item => item.id === id);
        if (!app) return null;
        return app.mode === 'embed' ? <button type="button" className="chat-result" key={id} onClick={() => onOpen(app)}>{app.name} öffnen ↗</button> : <a className="chat-result" key={id} href={app.url} target="_blank" rel="noopener noreferrer">{app.name} im neuen Tab öffnen ↗</a>;
      })}</div>)}</div>
      <form className="chat-form" onSubmit={submit}><label className="sr-only" htmlFor="chat-input">Nachricht an DKHub</label><input id="chat-input" value={input} onChange={event => setInput(event.target.value)} maxLength="200" placeholder="Schreibe eine Nachricht …" autoComplete="off"/><button type="submit" disabled={!input.trim()} aria-label="Nachricht senden">➜</button></form>
    </section>}
  </div>;
}
