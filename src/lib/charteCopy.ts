/**
 * Charte vocabulary that follows the Enfants chip (QUOI).
 * One object per register. Callers never branch on a card.
 * The removed « Avec les enfants » séance mode no longer selects a register.
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
 * `enfantsChipActive` is true when the Enfants QUOI chip (`enfants_famille`) is on.
 */
export function charteRegister(enfantsChipActive: boolean): CharteRegister {
  return enfantsChipActive ? 'enfants' : 'default';
}

/** Copy for the whole view. Item fields are not an input. */
export function charteCopy(enfantsChipActive: boolean): CharteCopy {
  return CHARTE_COPY[charteRegister(enfantsChipActive)];
}
