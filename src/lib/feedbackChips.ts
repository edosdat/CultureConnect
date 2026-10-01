/** Track stubs and subtype labels for the feedback panel. */

export const BUG_STUB = 'J’ai repéré un bug : ';
export const SUGGESTION_STUB = 'Voici une suggestion : ';

export const BUG_QUESTION = 'Quel type de bug ?';
export const SUGGESTION_QUESTION = 'Quel type de suggestion ?';

export const BUG_SUBTYPES = ['Affichage', 'Filtres', 'Connexion', 'Autre'] as const;
export const SUGGESTION_SUBTYPES = [
  'Idée produit',
  'Contenu manquant',
  'Amélioration',
  'Autre',
] as const;

/**
 * Inject the next stub only when the field is empty or still the previous stub.
 * Text the user already wrote stays put.
 */
export function fieldForTrack(
  current: string,
  previousStub: string | null,
  nextStub: string,
): string {
  if (current.trim() === '' || (previousStub != null && current === previousStub)) {
    return nextStub;
  }
  return current;
}

export function clearStub(current: string, stub: string): string {
  return current === stub ? '' : current;
}
