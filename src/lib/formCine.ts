/**
 * form=cine when an official film_id is present.
 * Fill-empty only — never overwrite a form that is already set.
 */

export function hasOfficialFilmId(
  filmId: string | undefined | null,
): boolean {
  return Boolean((filmId || '').trim());
}

/**
 * Ingest / merge / CSV load: if film_id is present and form is empty → cine.
 * Existing form (festival, theatre, …) is kept as-is.
 */
export function fillEmptyCineForm(
  form: string | undefined | null,
  filmId: string | undefined | null,
): string {
  const existing = (form || '').trim();
  if (existing) return existing;
  if (hasOfficialFilmId(filmId)) return 'cine';
  return '';
}
