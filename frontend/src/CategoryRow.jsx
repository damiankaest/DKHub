import React, { useRef } from 'react';

export function CategoryRow({ name, hidden, children }) {
  const track = useRef(null);
  const scroll = direction => track.current?.scrollBy({left:direction * track.current.clientWidth * 0.8, behavior:'smooth'});
  return <section className="category-row" hidden={hidden} aria-label={`Kategorie ${name}`}>
    <div className="category-heading"><h2>{name}</h2><div className="carousel-controls"><button type="button" aria-label={`${name} nach links`} onClick={() => scroll(-1)}>‹</button><button type="button" aria-label={`${name} nach rechts`} onClick={() => scroll(1)}>›</button></div></div>
    <div className="category-track" ref={track}>{children}</div>
  </section>;
}

export function handleTvNavigation(event) {
  if (!event.target.matches('[data-tv-card]') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const rows = [...event.currentTarget.querySelectorAll('.category-row:not([hidden])')];
  const rowIndex = rows.findIndex(row => row.contains(event.target));
  if (rowIndex < 0) return;
  const cardsIn = row => [...row.querySelectorAll('.card:not([hidden]) [data-tv-card]')];
  const cards = cardsIn(rows[rowIndex]);
  const index = cards.indexOf(event.target);
  const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
  const nextRow = vertical ? rows[rowIndex + offset] : rows[rowIndex];
  if (!nextRow) return;
  const choices = cardsIn(nextRow);
  const next = choices[vertical ? Math.min(index, choices.length - 1) : index + offset];
  if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({block:'nearest', inline:'nearest'}); }
}
