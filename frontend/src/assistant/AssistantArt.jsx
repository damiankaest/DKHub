import React, { useId } from 'react';

// Original "signal" mark: two voices meeting around one point.
export function SignalMark({size=28}) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
      <path d="M7 23c0-9 6-16 14-16M12 23c0-6 4-11 9-11M33 17c0 9-6 16-14 16M28 17c0 6-4 11-9 11"/>
    </g><circle cx="20" cy="20" r="3.6" fill="currentColor"/>
  </svg>;
}

export function SignalArt() {
  const id=useId().replace(/[^\w-]/g,'');
  return <svg className="assistant-art" viewBox="0 0 350 104" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id+'grid'} width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".85" fill="var(--rail-glow)" opacity=".34"/></pattern>
      <linearGradient id={id+'fade'}><stop stopColor="var(--art-base)"/><stop offset="1" stopColor="var(--rail-tint)"/></linearGradient>
    </defs>
    <rect width="350" height="104" fill={'url(#'+id+'fade)'}/><rect width="350" height="104" fill={'url(#'+id+'grid)'}/>
    <g fill="none" stroke="var(--rail-glow)" opacity=".42" strokeWidth=".9">
      <path d="M-10 55h52l16-12h26l12 9h19m119 0h42l10-9h36l13 12h30"/><path d="M-10 64h64l12-9h18l7 6h30m109-18h26l13-10h34l8 6h48" opacity=".48"/>
      <ellipse cx="175" cy="52" rx="67" ry="31" transform="rotate(-19 175 52)"/><ellipse cx="175" cy="52" rx="79" ry="39" strokeDasharray="2 7" transform="rotate(-19 175 52)"/>
    </g>
    <g transform="translate(175 52)"><circle r="32" fill="var(--art-base)" stroke="var(--art-line)" strokeWidth="1.2"/>
      <circle r="26.6" fill="none" stroke="var(--art-line)" opacity=".28"/><g transform="translate(-20 -20)" color="var(--rail-glow)"><SignalMark size={40}/></g></g>
    <g fill="var(--art-flare)"><circle cx="224" cy="25" r="3.2"/><circle cx="65" cy="43" r="2"/><circle cx="285" cy="43" r="1.6"/></g>
  </svg>;
}
