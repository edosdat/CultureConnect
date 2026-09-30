/**
 * Charte vocabulary that follows the « Avec les enfants » mode.
 * One object per register. Callers never branch on a card or on a chip.
 */

export type CharteRegister = 'default' | 'enfants';

export type CharteCopy = {
  /** Saved-list heading. */
  mesCrushs: string;
  /** Two-evening scarcity line. */
  deuxSoirs: string;
};

export const CHARTE_COPY: Record<CharteRegister, CharteCopy> = {
  default: {
    mesCrushs: 'Mes crushs',
    deuxSoirs: 'Plus que deux soirs pour conclure',
  },
  enfants: {
    mesCrushs: 'Mes plans',
    deuxSoirs: 'Plus que deux dates',
  },
};

/**
 * Register for the current view.
 * `avecEnfants` is the request flag (`enfants=1` / `avec_enfants=1`), never a `cats` value.
 */
export function charteRegister(avecEnfants: boolean): CharteRegister {
  return avecEnfants ? 'enfants' : 'default';
}

/** Copy for the whole view. Item fields are not an input. */
export function charteCopy(avecEnfants: boolean): CharteCopy {
  return CHARTE_COPY[charteRegister(avecEnfants)];
}
