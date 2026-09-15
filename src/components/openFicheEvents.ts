/** Window events so cloche can open a fiche without remounting home. */

export const OPEN_FICHE_EVENT = 'cc-open-fiche';

/** Title / image already hydrated in the inbox sheet (`GET /api/agenda?id=`). */
export type OpenFicheSeed = {
  title?: string;
  image?: string;
  where?: string;
};

export type OpenFicheDetail = OpenFicheSeed & {
  itemKey: string;
  token: string;
  href: string;
};

export function requestOpenFiche(detail: OpenFicheDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenFicheDetail>(OPEN_FICHE_EVENT, { detail }));
}
