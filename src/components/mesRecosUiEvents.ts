/** Window events so Mes recos overlay open state can live outside the avatar menu. */

export const OPEN_MES_RECOS_EVENT = 'cc-open-mes-recos';
export const CLOSE_MES_RECOS_EVENT = 'cc-close-mes-recos';

export function requestOpenMesRecos() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_MES_RECOS_EVENT));
}

export function requestCloseMesRecos() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLOSE_MES_RECOS_EVENT));
}
