export const defaultTheme = {
  id: 'light', name: 'Hell', mode: 'light', accent: '#137C68', highlight: '#E7B363',
  motif: 'grid', shape: 'soft', motion: false,
};
export const motifs = { grid: 'Raster', orbit: 'Umlaufbahnen', manga: 'Manga', snow: 'Schnee', aurora: 'Polarlicht' };
export const shapes = { crisp: 'Kantig', soft: 'Leicht gerundet', round: 'Rund' };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function mix(base, tint, amount) {
  const other = rgb(tint);
  return '#' + rgb(base).map((n, i) => Math.round(n + (other[i] - n) * amount).toString(16).padStart(2, '0')).join('');
}
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map(n => n / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}
function legible(color, background, direction) {
  for (let i = 0; i <= 10; i++) {
    const candidate = mix(color, direction, i / 10);
    if (contrast(candidate, background) >= 4.8) return candidate;
  }
  return direction;
}
export function validTheme(t) {
  return t && typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 48 &&
    ['light', 'dark'].includes(t.mode) && Object.hasOwn(motifs, t.motif) && Object.hasOwn(shapes, t.shape) &&
    [t.accent, t.highlight].every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) && typeof t.motion === 'boolean';
}
export function themeVars(spec) {
  const { mode, accent, highlight, shape } = spec;
  const dark = mode === 'dark';
  const bg = mix(dark ? '#10151E' : '#F7F8FB', accent, dark ? 0.045 : 0.023);
  const surface = dark ? mix('#161C26', accent, 0.055) : '#FFFFFF';
  const soft = mix(surface, accent, dark ? 0.115 : 0.075);
  const ink = dark ? '#F2F6F6' : '#172832';
  const accentInk = legible(accent, soft, dark ? '#FFFFFF' : '#092B29');
  const paint = dark ? mix(accent, '#FFFFFF', 0.1) : legible(accent, '#FFFFFF', '#183632');
  const paintInk = contrast('#FFFFFF', paint) >= 4.5 ? '#FFFFFF' :
    contrast('#0A1014', paint) >= 4.5 ? '#0A1014' : '#000000';
  return {
    '--bg': bg, '--surface': surface, '--soft': soft, '--ink': ink, '--muted': dark ? '#B1BEC6' : '#51636D',
    '--line': mix(surface, ink, dark ? 0.17 : 0.16), '--control-line': mix(surface, ink, dark ? 0.32 : 0.31),
    '--accent': accent, '--accent-ink': accentInk, '--highlight': highlight, '--paint': paint, '--paint-ink': paintInk,
    '--rail': mix('#101923', accent, 0.11), '--rail-tint': mix('#1A2934', accent, 0.2),
    '--rail-glow': mix(accent, '#FFFFFF', 0.65), '--art-base': mix('#0E1C2B', accent, 0.18),
    '--art-line': mix(accent, '#FFFFFF', 0.48), '--art-flare': mix(highlight, '#FFFFFF', 0.14),
    '--r': { crisp: '4px', soft: '12px', round: '20px' }[shape], '--r-sm': { crisp: '3px', soft: '8px', round: '12px' }[shape],
    '--danger': dark ? '#FFB8AE' : '#A62F35', '--danger-bg': dark ? '#40282C' : '#FFF0EF',
    colorScheme: mode,
  };
}
