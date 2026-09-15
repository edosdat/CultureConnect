/** Window events so cloche can open a fiche without remounting home. */

export const OPEN_FICHE_EVENT = 'cc-open-fiche';

export type OpenFicheDetail = {
  itemKey: string;
  token: string;
  href: string;
};

export function requestOpenFiche(detail: OpenFicheDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenFicheDetail>(OPEN_FICHE_EVENT, { detail }));
}
