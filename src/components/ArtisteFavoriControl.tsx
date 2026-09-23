'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { signIn, useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import {
  ARTISTE_FAVORI_LOGIN,
  artistFavoriOn,
  artistFavoriPayload,
  artistFavoriTap,
  ficheArtistFavoriInput,
} from '@/lib/artistFavori';
import { useSignals } from './SignalsProvider';

type Props = {
  artisteId: string;
  genres?: readonly string[];
  moods?: readonly string[];
  themes?: readonly string[];
  className?: string;
  /**
   * Artiste sheet header. Favori stays in the top-right cell; the guest
   * login row spans the sheet below `sm` so it cannot clip at ~380px.
   */
  sheet?: boolean;
  /** Close control, placed under Favori when `sheet` is set. */
  trailing?: ReactNode;
};

function favoriButtonClass(active: boolean): string {
  return (
    'inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium ' +
    (active
      ? 'border-culture-terracotta bg-culture-terracotta text-white'
      : 'border-culture-line bg-white text-culture-ink hover:bg-culture-sand')
  );
}

export function useArtisteFavoriOn(artisteId: string): boolean {
  const { data: session, status } = useSession();
  if (status !== 'authenticated') return false;
  return artistFavoriOn(session?.user?.tasteState?.signalsRecent ?? [], artisteId);
}

export function ArtisteFavoriBadge({ artisteId }: { artisteId: string }) {
  const on = useArtisteFavoriOn(artisteId);
  if (!on) return null;
  return (
    <span
      data-testid="artiste-favori-badge"
      className="rounded-full bg-culture-terracotta/15 px-2 py-0.5 text-xs font-medium text-culture-terracotta"
    >
      Favori
    </span>
  );
}

const loginButtonClass =
  'inline-flex w-max max-w-full min-h-10 shrink-0 items-center self-end justify-center whitespace-normal rounded-full bg-culture-terracotta px-4 py-2 text-center text-sm font-semibold text-white hover:bg-culture-clay sm:self-auto';

function LoginCluster({
  sheet,
  onLogin,
}: {
  sheet: boolean;
  onLogin: () => void;
}) {
  return (
    <div
      className={
        'flex min-w-0 max-w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end ' +
        (sheet
          ? 'col-span-2 row-start-2 max-sm:w-full sm:col-span-1 sm:col-start-2 sm:max-w-xs sm:justify-self-end'
          : 'mt-2')
      }
    >
      <p className="min-w-0 break-words text-sm text-culture-ink">
        {ARTISTE_FAVORI_LOGIN}
      </p>
      <button
        type="button"
        data-testid="artiste-favori-login"
        onClick={onLogin}
        className={loginButtonClass}
      >
        Continuer avec Google
      </button>
    </div>
  );
}

export default function ArtisteFavoriControl({
  artisteId,
  genres,
  moods,
  themes,
  className = 'mt-2',
  sheet = false,
  trailing = null,
}: Props) {
  const { data: session, status } = useSession();
  const { track } = useSignals();
  const authed = status === 'authenticated' && Boolean(session?.user);
  const persisted = useArtisteFavoriOn(artisteId);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [nudge, setNudge] = useState(false);
  const on = optimistic ?? persisted;

  useEffect(() => {
    setOptimistic(null);
    setNudge(false);
  }, [artisteId]);

  useEffect(() => {
    if (optimistic === null) return;
    if (optimistic === persisted) setOptimistic(null);
  }, [optimistic, persisted]);

  if (!artisteId.trim()) return null;

  function tap() {
    const decision = artistFavoriTap({
      status,
      authed,
      currentlyOn: on,
    });
    if (decision.type === 'login') {
      setNudge(true);
      return;
    }
    if (decision.type !== 'toggle') return;
    const payload = artistFavoriPayload({
      artisteId,
      genres,
      moods,
      themes,
      currentlyOn: decision.currentlyOn,
    });
    if (!payload) return;
    setOptimistic(!decision.currentlyOn);
    track(payload);
  }

  function login() {
    if (typeof window === 'undefined') return;
    void signIn('google', { callbackUrl: window.location.href });
  }

  const favoriButton = (
    <button
      type="button"
      data-testid="artiste-favori"
      aria-pressed={on}
      aria-label={on ? 'Retirer des favoris' : 'Ajouter à mes goûts / favori'}
      onClick={tap}
      className={favoriButtonClass(on)}
    >
      Favori
    </button>
  );

  const loginCluster =
    nudge && !authed ? <LoginCluster sheet={sheet} onLogin={login} /> : null;

  if (sheet) {
    return (
      <>
        <div
          className={`col-start-2 row-start-1 flex flex-col items-end gap-2 ${className}`}
          data-testid="artiste-favori-row"
        >
          {favoriButton}
          {trailing}
        </div>
        {loginCluster}
      </>
    );
  }

  return (
    <div className={className} data-testid="artiste-favori-row">
      {favoriButton}
      {loginCluster}
    </div>
  );
}

/** Event / séance fiche. Hidden when the programme has no catalogue artiste id. */
export function ArtisteFavoriFromItem({ item }: { item: DayItem }) {
  const input = ficheArtistFavoriInput(item);
  if (!input) return null;
  return (
    <ArtisteFavoriControl
      artisteId={input.artisteId}
      genres={input.genres}
      moods={input.moods}
      themes={input.themes}
    />
  );
}
