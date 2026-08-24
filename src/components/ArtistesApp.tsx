'use client';

import { useMemo, useState } from 'react';
import type { ArtisteWithDates, GenreLegend } from '@/lib/types';
import {
  filterArtistes,
  labelGenre,
  musicGenresFromLegend,
} from '@/lib/artists';
import ArtisteDetail from './ArtisteDetail';

type Props = {
  artistes: ArtisteWithDates[];
  genresLegend: GenreLegend[];
  mode: 'table' | 'derived';
};

export default function ArtistesApp({ artistes, genresLegend, mode }: Props) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const musicGenres = useMemo(
    () => musicGenresFromLegend(genresLegend),
    [genresLegend],
  );

  // Only show chips that appear on at least one artist (or are selected)
  const availableMusic = useMemo(() => {
    const present = new Set<string>();
    for (const a of artistes) {
      for (const g of a.genres) present.add(g);
    }
    return musicGenres.filter(
      (g) => present.has(g.slug) || selectedGenres.includes(g.slug),
    );
  }, [artistes, musicGenres, selectedGenres]);

  const filtered = useMemo(
    () =>
      filterArtistes(artistes, {
        genres: selectedGenres,
        query,
      }),
    [artistes, selectedGenres, query],
  );

  const selected =
    filtered.find((a) => a.artiste_id === selectedId) ??
    artistes.find((a) => a.artiste_id === selectedId) ??
    null;

  function toggleGenre(slug: string) {
    setSelectedGenres((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-culture-terracotta">
          Toulouse & alentours
        </p>
        <h1 className="mt-1 font-display text-4xl text-culture-ink sm:text-5xl">
          Artistes
        </h1>
        <p className="mt-3 max-w-2xl text-culture-muted">
          Concerts et DJs du programme — filtrez par genre, cherchez un nom,
          puis consultez les dates autour de Toulouse.
        </p>
      </header>

      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
            Genres musicaux
          </h2>
          {selectedGenres.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedGenres([])}
              className="text-xs text-culture-terracotta hover:underline"
            >
              Tout effacer
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {availableMusic.map((g) => {
            const active = selectedGenres.includes(g.slug);
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => toggleGenre(g.slug)}
                aria-pressed={active}
                className={
                  'rounded-full border px-3 py-1.5 text-sm transition ' +
                  (active
                    ? 'border-culture-sage bg-culture-sage text-white shadow-sm'
                    : 'border-culture-sand bg-white text-culture-ink hover:border-culture-sage/60')
                }
              >
                {g.label_fr}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <label
          htmlFor="artiste-search"
          className="mb-1.5 block text-sm font-semibold uppercase tracking-wide text-culture-muted"
        >
          Recherche
        </label>
        <input
          id="artiste-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de l’artiste…"
          className="w-full max-w-md rounded-2xl border border-culture-sand bg-white px-4 py-2.5 text-culture-ink placeholder:text-culture-muted/60 outline-none ring-culture-sage/40 focus:ring-2"
        />
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm text-culture-muted">
          {filtered.length} artiste{filtered.length !== 1 ? 's' : ''}
          {mode === 'derived' ? ' (dérivés du programme)' : ''}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-culture-sand bg-white/50 px-4 py-8 text-center text-culture-muted">
          Aucun artiste pour cette sélection.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <li key={a.artiste_id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.artiste_id)}
                className="flex h-full w-full flex-col rounded-2xl border border-culture-sand bg-white p-4 text-left shadow-sm transition hover:border-culture-terracotta/40 hover:shadow-md"
              >
                <span className="font-display text-xl text-culture-ink">
                  {a.nom}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {a.genres.map((slug) => (
                    <span
                      key={slug}
                      className="rounded-full bg-culture-sage/15 px-2 py-0.5 text-xs text-culture-sage"
                    >
                      {labelGenre(slug, genresLegend)}
                    </span>
                  ))}
                </span>
                <span className="mt-auto pt-3 text-sm text-culture-muted">
                  {a.upcomingCount > 0
                    ? `${a.upcomingCount} date${a.upcomingCount > 1 ? 's' : ''} à venir`
                    : a.pastCount > 0
                      ? `${a.pastCount} date${a.pastCount > 1 ? 's' : ''} passée${a.pastCount > 1 ? 's' : ''}`
                      : 'Pas de date'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ArtisteDetail
        artiste={selected}
        legend={genresLegend}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
