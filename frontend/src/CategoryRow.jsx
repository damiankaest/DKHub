import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function CategoryRow({ name, hidden, visibleCount, viewing, children }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({left:false,right:false});
  useEffect(() => {
    if (hidden || viewing) return;
    const el = track.current;
    function measure() {
      const left = el.scrollLeft > 2, right = el.clientWidth + el.scrollLeft < el.scrollWidth - 2;
      setEdges(old => old.left===left && old.right===right ? old : {left,right});
    }
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    el.addEventListener('scroll',measure,{passive:true});
    return () => { observer?.disconnect(); el.removeEventListener('scroll',measure); };
  }, [visibleCount, hidden, viewing]);
  const scroll = dir => track.current.scrollBy({left:dir * track.current.clientWidth * .82,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  return <section className={'category-row' + (visibleCount===1?' single':'')} hidden={hidden} aria-label={'Kategorie ' + name}>
    <div className="category-heading"><h2>{name}</h2><span className="category-count">{visibleCount}</span><span className="row-rule"/>
      {(edges.left || edges.right) && <div className="carousel-controls"><button className="icon-button" disabled={!edges.left} aria-label={name+' nach links'} onClick={()=>scroll(-1)}><Icon name="back" size={16}/></button><button className="icon-button" disabled={!edges.right} aria-label={name+' nach rechts'} onClick={()=>scroll(1)}><Icon name="next" size={16}/></button></div>}
    </div><div className="category-track" ref={track}>{children}</div>
  </section>;
}

export function handleTvNavigation(event, onExit) {
  if (!event.target.matches('[data-tv-card]')) return;
  if (event.key === 'Escape') { event.preventDefault(); onExit(); return; }
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  const rows = [...event.currentTarget.querySelectorAll('.category-row:not([hidden])')];
  const row = rows.findIndex(el => el.contains(event.target));
  if (row<0) return;
  const cards = el => [...el.querySelectorAll('.card:not([hidden]) [data-tv-card]')];
  const col = cards(rows[row]).indexOf(event.target);
  const dy = event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;
  if (row===0 && dy===-1) { event.preventDefault(); document.querySelector('.tv-exit')?.focus(); return; }
  const next = rows[row+dy] && cards(rows[row+dy]);
  const target = next?.[dy?Math.min(col,next.length-1):col+(event.key==='ArrowRight'?1:-1)];
  event.preventDefault();
  if(target) {target.focus({preventScroll:true}); target.scrollIntoView({block:'nearest', inline:'nearest'});}
}
