import React, { useState } from 'react';
import { Icon } from './Icon';
import { ThemeArt } from './themes/ThemeArt';

// The start page's invitation to carry on where you left off. It never loads the app itself.
export function Spotlight({ app, reason, theme, favorite, onOpen, onFavorite }) {
  const [broken, setBroken] = useState('');
  const embed = app.mode === 'embed';
  const launch = { className: 'button spotlight-open', 'aria-label': `Weiter mit ${app.name}${embed ? '' : ' (neuer Tab)'}`, onClick: onOpen };
  const content = <><Icon name={embed ? 'next' : 'external'} size={17} />Öffnen</>;
  return <section className="spotlight" aria-label={reason}>
    <div className="spotlight-art" aria-hidden="true">
      {app.image && broken !== app.image ? <img src={app.image} alt="" onError={() => setBroken(app.image)} /> : <ThemeArt motif={theme.motif} motion={theme.motion} />}
    </div>
    <div className="spotlight-body">
      <span className="spotlight-reason">{reason}</span>
      <p className="spotlight-title">{app.name}</p>
      <p className="spotlight-text">{app.description || `${app.category} · ${embed ? 'öffnet im Hub' : 'öffnet in neuem Tab'}`}</p>
      <div className="spotlight-actions">
        {embed ? <button type="button" {...launch}>{content}</button> : <a {...launch} href={app.url} target="_blank" rel="noopener noreferrer">{content}</a>}
        <button type="button" className="button spotlight-favorite" aria-pressed={favorite} aria-label={favorite ? `${app.name} nicht mehr merken` : `${app.name} merken`} onClick={onFavorite}><Icon name="star" size={16} filled={favorite} />{favorite ? 'Gemerkt' : 'Merken'}</button>
      </div>
    </div>
  </section>;
}
