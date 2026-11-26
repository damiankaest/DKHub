import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandMark } from '../Icon';

// `targets` are tried in order; the first visible one is highlighted. Without any,
// the card stays centred, so the tour works on every screen size.
const steps = [
  { title: 'Willkommen bei DKHub', targets: [], text: 'Hier liegen deine Apps und Links für zu Hause an einem Ort. Die kurze Tour zeigt dir in fünf Schritten, wo was ist.' },
  { title: 'Bibliothek und Favoriten', targets: ['favorites'], text: 'Alle Apps stehen nach Kategorien in der Bibliothek. Mit dem Stern auf einer Kachel merkst du dir Favoriten. Sie gelten für diesen Browser.' },
  { title: 'Dienste installieren und verwalten', targets: ['services', 'menu'], text: 'Unter „Dienste“ installierst du einfache Web-Apps aus Docker Hub und startest oder stoppst sie. Dafür muss die Dienstverwaltung auf dem Server eingeschaltet sein.' },
  { title: 'DK-Assistent', targets: ['assistant'], text: 'Er findet und öffnet deine Apps. „Lokal“ funktioniert ohne Cloud. Der KI-Chat ist freiwillig und muss erst eingerichtet werden.' },
  { title: 'Themes und Einstellungen', targets: ['settings', 'menu'], text: 'In den Einstellungen wählst du ein Design. Ein aktiviertes Design gilt für alle Geräte. Dort kannst du auch diese Tour erneut starten.' },
];

function findTarget(names) {
  for (const name of names) {
    const element = [...document.querySelectorAll(`[data-tour="${name}"]`)].find(el => el.getClientRects().length);
    if (element) return { name, element };
  }
  return null;
}

// Beside the highlighted control where there is room, on phones in the free half of the screen.
function place(rect, card) {
  const gap = 14, width = window.innerWidth, height = window.innerHeight;
  if (!rect) return null;
  if (width <= 740) return rect.top + rect.height / 2 < height / 2 ? { bottom: 12, left: 12, right: 12 } : { top: 12, left: 12, right: 12 };
  const clamp = (value, size, limit) => Math.max(12, Math.min(value, limit - size - 12));
  if (rect.right + gap + card.width < width) return { left: rect.right + gap, top: clamp(rect.top - 20, card.height, height) };
  const top = rect.bottom + gap + card.height < height ? rect.bottom + gap : clamp(rect.top - card.height - gap, card.height, height);
  return { top, left: clamp(rect.left, card.width, width) };
}

export function Tour({ onClose }) {
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState({ rect: null, position: null, viaMenu: false });
  const dialog = useRef(null);
  const card = useRef(null);
  const heading = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    const previous = document.activeElement;
    const el = dialog.current;
    el.showModal();
    return () => { el.close(); previous?.focus?.({ preventScroll: true }); };
  }, []);
  useLayoutEffect(() => {
    function measure() {
      const target = findTarget(step.targets);
      target?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = target?.element.getBoundingClientRect() || null;
      // Before showModal the card has no size yet; assume its widest form.
      const size = card.current.getBoundingClientRect();
      setLayout({ rect, position: place(rect, { width: size.width || 380, height: size.height || 300 }), viaMenu: target?.name === 'menu' });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [index]);

  const { rect, position, viaMenu } = layout;
  return <dialog ref={dialog} className={'tour' + (rect ? ' anchored' : '')} aria-labelledby="tour-title" aria-describedby="tour-text"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    {rect && <span className="tour-spot" aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} />}
    <div ref={card} className="tour-card" style={position || undefined}>
      <div className="tour-top"><span className="tour-count">Schritt {index + 1} von {steps.length}</span>
        <button type="button" className="button quiet compact-button" onClick={onClose}>Überspringen</button></div>
      {index === 0 && <span className="tour-mark" aria-hidden="true"><BrandMark /></span>}
      <h2 id="tour-title" ref={heading} tabIndex={-1}>{step.title}</h2>
      <p id="tour-text">{step.text}{viaMenu && ' Auf diesem Bildschirm findest du das im Menü oben rechts.'}</p>
      <div className="tour-progress" aria-hidden="true">{steps.map((item, i) => <span key={item.title} className={i <= index ? 'done' : undefined} />)}</div>
      <div className="tour-actions">
        {index > 0 && <button type="button" className="button secondary" onClick={() => setIndex(index - 1)}>Zurück</button>}
        <button type="button" className="button primary" onClick={() => last ? onClose() : setIndex(index + 1)}>{last ? 'Abschließen' : 'Weiter'}</button>
      </div>
    </div>
  </dialog>;
}
