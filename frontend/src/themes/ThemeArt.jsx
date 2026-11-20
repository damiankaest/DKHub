import React, { useId } from 'react';

// Original vector covers. Geometry is bundled; recipes can only select a motif.
export function ThemeArt({ motif = 'grid', motion = false }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fill = name => 'url(#' + id + name + ')';
  return <svg className="theme-art" data-motion={motion ? 'on' : 'off'} viewBox="0 0 480 172" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id + 'grid'} width="21" height="21" patternUnits="userSpaceOnUse"><path d="M21 0H0V21" fill="none" stroke="var(--art-line)" opacity=".18" strokeWidth=".8"/></pattern>
      <pattern id={id + 'dots'} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--art-line)" opacity=".38"/></pattern>
      <linearGradient id={id + 'pane'} x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--art-base)"/><stop offset="1" stopColor="var(--accent)"/></linearGradient>
      <linearGradient id={id + 'light'}><stop stopColor="var(--accent)"/><stop offset=".62" stopColor="var(--art-line)"/><stop offset="1" stopColor="var(--art-flare)"/></linearGradient>
    </defs>
    <rect width="480" height="172" fill="var(--art-base)"/>
    {motif === 'grid' && <>
      <rect width="480" height="172" fill={fill('grid')}/>
      <g transform="translate(244,102)" strokeLinejoin="round" stroke="var(--art-line)">
        {[24, 6, -12, -30].map((y, i) => <g key={y} transform={'translate(0 ' + y + ')'}>
          <path d="M-94 -4 0 -44 96 -4 96 1 0 43 -94 1Z" fill="var(--art-base)" opacity=".96"/>
          <path d="M-94 -5 0 -47 96 -5 0 37Z" fill={i === 3 ? fill('pane') : 'var(--art-base)'}/>
        </g>)}
        <path d="m-46 -34 46 -20 47 20 -47 20Z" fill="none" strokeDasharray="3 4"/>
        <path className="art-pulse" d="m-15 -34 15 -7 16 7 -16 7Z" fill="var(--art-flare)" stroke="none"/>
      </g>
    </>}
    {motif === 'orbit' && <>
      <rect width="480" height="172" fill={fill('dots')} opacity=".5"/>
      <g transform="translate(242,85) rotate(-20)" fill="none" stroke={fill('light')}>
        {[40, 69, 98, 127, 156].map(r => <ellipse key={r} rx={r} ry={r * .37} strokeWidth={r === 98 ? 2.6 : 1.2}/>)}
        <circle r="22" fill={fill('pane')}/><circle className="art-orbit" cx="96" cy="-5" r="6" fill="var(--art-flare)" stroke="none"/>
      </g>
    </>}
    {motif === 'manga' && <>
      <path d="M0 0h285L82 172H0z" fill={fill('dots')}/>
      <circle cx="302" cy="84" r="63" fill={fill('light')}/>
      <g className="art-strike" fill="var(--art-base)">{[0,1,2,3,4,5,6].map(n => <path key={n} d="m97 128 250 -88 -153 66Z" transform={'translate(' + (16 * n) + ' ' + (n * 10) + ')'}/>)}</g>
      <g fill="var(--art-flare)"><path d="m19 146 157 -61 -129 61zm39 7 121 -46 -106 46zm269 -103 119 -43 -91 43z"/></g>
    </>}
    {motif === 'snow' && <>
      <circle cx="321" cy="50" r="30" fill="var(--art-flare)"/>
      <path d="m0 135 101 -66 50 38 78 -66 100 70 52 -37 99 56v42H0Z" fill={fill('pane')}/>
      <path d="m0 151 96 -46 45 21 74 -38 68 31 74 -21 123 38v36H0Z" fill="var(--art-line)" opacity=".38"/>
      <g fill="var(--art-base)">{[40,68,135,173,349,400,438].map((x, i) => <path key={x} transform={'translate(' + x + ' ' + (108 + i%3*10) + ')'} d="m0 -37 -13 24h7l-16 19h11l-16 16h23v19h8V22h24L12 6h10L6 -13h7Z"/>)}</g>
      <g className="art-snow" fill="#fff">{Array.from({length:38}, (_,i) => <circle key={i} cx={(i*73+13)%480} cy={(i*31)%169-4} r={i%3===0?2:1.2}/>)}</g>
    </>}
    {motif === 'aurora' && <>
      <rect width="480" height="172" fill={fill('dots')} opacity=".6"/>
      <g className="art-wave" fill="none" stroke={fill('light')}>{Array.from({length:15},(_,i) => <path key={i} transform={'translate(0,'+(i*3-22)+')'} opacity={.35+i*.04} strokeWidth="1.6" d={'M-20 118 C90 '+(58-i*2)+' 146 184 229 91 S348 2 505 '+(57+i*2)}/>)}</g>
    </>}
  </svg>;
}
