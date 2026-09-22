/**
 * Artist favori — same favorite / unfavorite taste signal as the fiche heart.
 * Persists on the account taste log (artiste_id only). Not an RSVP, not Matching C.
 */
import type { DayItem } from '@/lib/types';
import {
  artistSignalTarget,
  favoriteToggleKind,
  sanitizeArtisteId,
  signalTarget,
  tasteTagsFromDayItem,
  type Signal,
  type TrackPayload,
} from '@/lib/signals';

export const ARTISTE_FAVORI_LOGIN = 'Connecte-toi pour garder ce favori.';

export type ArtistFavoriTap =
  | { type: 'ignore' }
  | { type: 'login' }
  | { type: 'toggle'; currentlyOn: boolean };

/** True while a favorite signal for this catalogue id is still in the log. */
export function artistFavoriOn(
  signals: readonly Pick<
    Signal,
    'kind' | 'film_id' | 'event_id' | 'programme_id' | 'artiste_id' | 'chip' | 'query'
  >[],
  artisteId: string,
): boolean {
  const target = artistSignalTarget(artisteId);
  if (!target) return false;
  return signals.some((s) => s.kind === 'favorite' && signalTarget(s) === target);
}

/** First catalogue id in a programme.artiste_id cell. Drops names and emails. */
export function primaryArtisteId(raw?: string | null): string {
  const first = String(raw || '').split(/[|,;]/)[0] ?? '';
  return sanitizeArtisteId(first);
}

export function artistFavoriTap(opts: {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  authed: boolean;
  currentlyOn: boolean;
}): ArtistFavoriTap {
  if (opts.status === 'loading') return { type: 'ignore' };
  if (!opts.authed) return { type: 'login' };
  return { type: 'toggle', currentlyOn: opts.currentlyOn };
}

/** favorite / unfavorite payload. No event ids, no name, no email. */
export function artistFavoriPayload(opts: {
  artisteId: string;
  genres?: readonly string[];
  moods?: readonly string[];
  themes?: readonly string[];
  currentlyOn: boolean;
}): TrackPayload | null {
  const artiste_id = sanitizeArtisteId(opts.artisteId);
  if (!artiste_id) return null;
  return {
    kind: favoriteToggleKind(opts.currentlyOn),
    artiste_id,
    genres: [...(opts.genres ?? [])],
    moods: [...(opts.moods ?? [])],
    themes: [...(opts.themes ?? [])],
  };
}

export type ArtistFavoriInput = {
  artisteId: string;
  genres: string[];
  moods: string[];
  themes: string[];
};

/**
 * Event fiche → artist favori uses the fiche's existing taste tags.
 * No new matcher: same moods/genres the event heart already reads.
 */
export function ficheArtistFavoriInput(item: DayItem): ArtistFavoriInput | null {
  if (item.kind !== 'programme') return null;
  const artisteId = primaryArtisteId(item.programme.artiste_id);
  if (!artisteId) return null;
  const tags = tasteTagsFromDayItem(item);
  return {
    artisteId,
    genres: tags.genres,
    moods: tags.moods,
    themes: tags.themes,
  };
}
