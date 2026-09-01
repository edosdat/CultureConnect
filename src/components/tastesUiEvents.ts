/** Window events so overlay open state can live outside the avatar menu. */

export const OPEN_TASTES_EVENT = 'cc-open-tastes';
export const CLOSE_TASTES_EVENT = 'cc-close-tastes';

export function requestOpenTastes() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_TASTES_EVENT));
}

export function requestCloseTastes() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLOSE_TASTES_EVENT));
}
