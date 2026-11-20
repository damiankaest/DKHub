import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultTheme, themeVars, validTheme } from './palette';

const cache = 'dkhub.appearance.v1';
function cachedTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(cache));
    if (validTheme(saved)) return saved;
  } catch { /* The catalog also works without browser storage. */ }
  return defaultTheme;
}

export function useAppearance() {
  const [active, setActive] = useState(cachedTheme);
  const [preview, setPreview] = useState(null);
  const revision = useRef(0);
  const remember = useCallback(theme => {
    if (!validTheme(theme)) return;
    setActive(theme);
    try { localStorage.setItem(cache, JSON.stringify(theme)); } catch { /* Optional paint cache. */ }
  }, []);
  const activate = useCallback(theme => {
    revision.current++;
    remember(theme);
    setPreview(null);
  }, [remember]);
  useEffect(() => {
    let controller;
    async function sync() {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      const version = ++revision.current;
      try {
        const res = await fetch('/api/theme', { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) return;
        const theme = await res.json();
        if (version === revision.current) remember(theme);
      } catch { /* A missing theme must never prevent opening apps. */ }
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { controller?.abort(); document.removeEventListener('visibilitychange', sync); };
  }, [remember]);
  const visible = preview || active;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(visible);
    for (const [key, value] of Object.entries(vars)) {
      if (key !== 'colorScheme') root.style.setProperty(key, value);
    }
    root.style.colorScheme = visible.mode;
    Object.assign(root.dataset, { mode: visible.mode, motif: visible.motif, motion: visible.motion ? 'on' : 'off' });
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg']);
  }, [visible]);
  return { active, preview, visible, setPreview, activate };
}
