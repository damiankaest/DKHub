import React from 'react';

const paths = {
  home:'m3 10 9-7 9 7 M5.5 9.2V21h13V9.2 M10 21v-7h4v7',
  library:'M3 4h4v16H3z M10 4h3v16h-3z m6 1 3-1 4 15-3 1z',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  spark:'m12 3 2.1 5.9 5.9 2.1-5.9 2.1-2.1 5.9-2.1-5.9L4 11l5.9-2.1z m7 13 1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18z',
  external:'M14 3h7v7 M21 3 11 13 M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
  back:'m14.5 5-7 7 7 7', next:'m9.5 5 7 7-7 7', down:'m6 9 6 6 6-6',
  plus:'M12 5v14 M5 12h14', close:'m6 6 12 12 M18 6 6 18',
  search:'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 1 1 13 0 M15 15l6 6',
  star:'m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.4l6.2-.9z',
  tv:'M3 4h18v13H3z M8 21h8 M12 17v4',
  server:'M3 4h18v6H3z M3 14h18v6H3z M6 7h.1 M6 17h.1 M10 7h7 M10 17h7',
  settings:'M4 6h5m5 0h6 M4 12h10m4 0h2 M4 18h2m5 0h9 M9 3v6h4V3z M14 9v6h4V9z M6 15v6h4v-6z',
  sort:'M4 7h15 M4 12h11 M4 17h7', menu:'M3 5h18M3 12h18M3 19h18',
  panel:'M3 4h18v16H3z M9 4v16', window:'M3 4h18v16H3z M3 8h18', more:'M4 12h1 M11.5 12h1 M19 12h1',
  palette:'M21 11c0-5-4-8-9-8a9 9 0 1 0 0 18c2.4 0 3.2-1.6 2.4-3-1-2 .5-3.3 2.4-3.3 2.6 0 4.2-1.1 4.2-3.7z M7 10h.2 M10 7h.2 M14 7h.2 M17 10h.2',
  chat:'M3 4h18v12H9l-6 5z M7 8h10 M7 12h6', send:'M4 4l17 8-17 8 3-8z M7 12h14',
  check:'m4 12 5 5L20 6', link:'m10 13 4-4 M8 15l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 5 0 M16 9l1-1a3 3 0 1 0-4-4l-3 3',
  filter:'M3 6h18 M6 12h12 M9 18h6', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M12 6v6l4 2',
};
export function Icon({name, size=20, filled=false}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth={name==='more'?3:1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>;
}
export function BrandMark() {
  return <svg className="brand-mark" width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="10" fill="currentColor"/><g fill="#142823"><path d="M8 10h10l3 3-13 8z"/><path d="m8 25 17-10 7 5-18 11-6-3z"/></g><path d="m23 28 9-5v7l-6 3z" fill="#142823" opacity=".68"/></svg>;
}
