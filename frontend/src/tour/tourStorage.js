// Like favorites and recently opened apps, the finished tour belongs to this browser.
export const TOUR_KEY = 'dkhub-tour';

export function tourDone() {
  try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return false; }
}

export function finishTour() {
  try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* Storage may be disabled. */ }
}
