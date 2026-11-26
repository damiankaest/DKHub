// Soft changes of view through the View Transitions API. Without support, or with
// reduced motion, the update simply happens at once.
import { flushSync } from 'react-dom';

const NAME = 'app-zoom';
const supported = () => Boolean(document.startViewTransition) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// With view transitions the CSS entrance animations would fade a second time.
if (typeof document !== 'undefined' && document.startViewTransition) document.documentElement.classList.add('view-transitions');

const visible = element => Boolean(element?.getClientRects().length);

// The picture of an app: its card in the library, or the whole window once it is open.
export function appFrame(id) {
  return document.querySelector(`.cards [data-app-id="${CSS.escape(id)}"]`)?.closest('.card')?.querySelector('.card-preview') || null;
}

// `from` is the element that grows or shrinks; `to` finds its counterpart after the update.
export function transition(update, { from, to } = {}) {
  if (!supported()) { update(); return; }
  const source = visible(from) ? from : null;
  if (source) source.style.viewTransitionName = NAME;
  let target = null;
  const run = document.startViewTransition(() => {
    if (source) source.style.viewTransitionName = '';
    flushSync(update);
    const found = source && to?.();
    if (visible(found)) { target = found; target.style.viewTransitionName = NAME; }
  });
  // A newer click may skip this transition; the update still runs.
  run.ready.catch(() => {});
  run.finished.finally(() => { if (target) target.style.viewTransitionName = ''; });
}
