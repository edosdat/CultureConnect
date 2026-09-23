import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  artistFavoriOn,
  artistFavoriPayload,
  artistFavoriTap,
  ficheArtistFavoriInput,
  primaryArtisteId,
} from './artistFavori';
import { formatTasteExportCsv } from './adminAnalytics';
import {
  commitTasteSignals,
  emptyProfile,
  inheritTasteTagsFromPeers,
  makeSignal,
  parseTasteState,
  TASTE_GENRE_SLUGS,
} from './signals';
import type { DayItem, Evenement, ProgrammeItem } from './types';

function programmeItem(
  artisteId: string,
  extra?: Partial<ProgrammeItem>,
): DayItem {
  const programme: ProgrammeItem = {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Soirée',
    type_item: 'artiste',
    date: '2026-09-22',
    heure_debut: '21:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'electro_techno',
    artiste_id: artisteId,
    moods: 'dansant',
    ...extra,
  };
  return {
    kind: 'programme',
    key: 'p:P1',
    dayIso: '2026-09-22',
    programme,
    evenement: null,
    lieu: null,
  };
}

describe('artist favori toggle', () => {
  it('on writes favorite, off cancels it, state survives parse', () => {
    const onPayload = artistFavoriPayload({
      artisteId: 'A0004',
      genres: ['electro_techno'],
      currentlyOn: false,
    });
    assert.ok(onPayload);
    assert.equal(onPayload.kind, 'favorite');
    assert.equal(onPayload.artiste_id, 'A0004');
    assert.equal(onPayload.event_id, undefined);
    assert.equal(JSON.stringify(onPayload).includes('@'), false);

    const on = makeSignal(onPayload);
    assert.equal(on.artiste_id, 'A0004');
    assert.equal(on.kind, 'favorite');
    assert.ok(on.genres.includes('electro'));
    assert.equal(on.genres.includes('techno'), false);
    assert.ok(on.genres.every((g) => (TASTE_GENRE_SLUGS as readonly string[]).includes(g)));

    const added = commitTasteSignals({ events: [], profile: emptyProfile() }, [on], 40);
    assert.equal(artistFavoriOn(added.events, 'A0004'), true);
    assert.ok((added.profile.genres.electro?.weight ?? 0) > 0);

    const stored = parseTasteState({
      signalsRecent: added.events,
      profile: added.profile,
    });
    assert.equal(stored?.signalsRecent[0]?.artiste_id, 'A0004');
    assert.equal(artistFavoriOn(stored?.signalsRecent ?? [], 'A0004'), true);

    const offPayload = artistFavoriPayload({
      artisteId: 'A0004',
      genres: ['electro_techno'],
      currentlyOn: true,
    });
    assert.equal(offPayload?.kind, 'unfavorite');
    const cleared = commitTasteSignals(added, [makeSignal(offPayload!)], 40);
    assert.equal(artistFavoriOn(cleared.events, 'A0004'), false);
    assert.equal(cleared.profile.genres.electro, undefined);
  });

  it('catalogue humour_standup uses the existing taste map', () => {
    const signal = makeSignal(
      artistFavoriPayload({
        artisteId: 'A0002',
        genres: ['humour_standup'],
        currentlyOn: false,
      })!,
    );
    assert.ok(signal.genres.includes('standup'));
    assert.ok(signal.genres.includes('comedie'));
    assert.ok(signal.moods.includes('rigolo'));
    assert.equal(signal.artiste_id, 'A0002');
  });

  it('drops names and emails; keeps the first catalogue id', () => {
    assert.equal(primaryArtisteId('A0004|A0009'), 'A0004');
    assert.equal(primaryArtisteId(' edosdat@gmail.com '), '');
    assert.equal(primaryArtisteId('Les faux british'), '');
    assert.equal(artistFavoriPayload({ artisteId: 'edosdat@gmail.com', currentlyOn: false }), null);
    assert.equal(artistFavoriPayload({ artisteId: '', currentlyOn: false }), null);
  });

  it('guest and loading do not toggle; signed-in does', () => {
    assert.deepEqual(
      artistFavoriTap({ status: 'loading', authed: false, currentlyOn: false }),
      { type: 'ignore' },
    );
    assert.deepEqual(
      artistFavoriTap({ status: 'unauthenticated', authed: false, currentlyOn: false }),
      { type: 'login' },
    );
    assert.deepEqual(
      artistFavoriTap({ status: 'authenticated', authed: true, currentlyOn: true }),
      { type: 'toggle', currentlyOn: true },
    );
  });

  it('event favori does not mark the artiste, and fiche tags do not copy event ids', () => {
    const eventFavori = makeSignal({
      kind: 'favorite',
      event_id: 'E9',
      genres: ['jazz'],
      moods: [],
    });
    assert.equal(artistFavoriOn([eventFavori], 'E9'), false);
    assert.equal(artistFavoriOn([eventFavori], 'A0004'), false);

    const input = ficheArtistFavoriInput(programmeItem('A0004'));
    assert.equal(input?.artisteId, 'A0004');
    assert.ok(input?.genres.includes('electro_techno'));
    assert.ok(input?.moods.includes('dansant'));
    const payload = artistFavoriPayload({ ...input!, currentlyOn: false });
    assert.equal(payload?.artiste_id, 'A0004');
    assert.equal(payload?.event_id, undefined);
    assert.equal(payload?.programme_id, undefined);
    const signal = makeSignal(payload!);
    assert.equal(signal.event_id, undefined);
    assert.ok(signal.moods.includes('dansant'));

    const peer = makeSignal({
      kind: 'open_card',
      event_id: 'E1',
      programme_id: 'P1',
      moods: ['angoissant'],
      genres: ['thriller'],
    });
    const inherited = inheritTasteTagsFromPeers(signal, [peer]);
    assert.equal(inherited.moods.includes('angoissant'), false);
    assert.equal(inherited.artiste_id, 'A0004');

    const fallback: DayItem = {
      kind: 'fallback',
      key: 'e:E1',
      dayIso: '2026-09-22',
      evenement: { event_id: 'E1' } as Evenement,
      lieu: null,
    };
    assert.equal(ficheArtistFavoriInput(fallback), null);
  });
});

describe('fiche Envie / J’y vais smoke + favori surfaces', () => {
  it('fiche keeps Envie / J’y vais beside artist favori; favori is not an RSVP', async () => {
    const detail = await readFile(
      new URL('../components/EventDetail.tsx', import.meta.url),
      'utf8',
    );
    const social = await readFile(
      new URL('../components/ShareSocial.tsx', import.meta.url),
      'utf8',
    );
    const artiste = await readFile(
      new URL('../components/ArtisteDetail.tsx', import.meta.url),
      'utf8',
    );
    const control = await readFile(
      new URL('../components/ArtisteFavoriControl.tsx', import.meta.url),
      'utf8',
    );
    const lib = await readFile(new URL('./artistFavori.ts', import.meta.url), 'utf8');

    const block = detail.slice(
      detail.indexOf('function FicheSocialBlock'),
      detail.indexOf('function creditNamesOf'),
    );
    const favoriAt = block.indexOf('<ArtisteFavoriFromItem');
    const socialAt = block.indexOf('<ShareSocial');
    assert.ok(favoriAt >= 0 && socialAt > favoriAt);
    assert.match(social, /Envie/);
    assert.match(social, /J’y vais/);
    assert.match(social, /share-rsvp-daughter/);
    assert.match(social, /aria-pressed=\{mine === 'envie'\}/);
    assert.match(social, /aria-pressed=\{mine === 'going'\}/);
    assert.match(social, /if \(token\) \{\s*return <DaughterRsvp/);
    assert.match(social, /data-testid="mother-rsvp-envie"/);
    assert.match(social, /data-testid="mother-rsvp-going"/);
    assert.match(social, /JSON\.stringify\(\{ kind, itemKey \}\)/);

    assert.match(artiste, /<ArtisteFavoriControl/);
    assert.match(artiste, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(artiste, /min-w-0 max-w-2xl overflow-y-auto overflow-x-hidden/);
    assert.match(control, /flex min-w-0 max-w-full flex-col items-stretch gap-2/);
    assert.match(control, /sm:flex-row sm:flex-wrap/);
    assert.match(control, /col-span-2/);
    assert.equal(/j[’']aime artiste/i.test(artiste + detail), false);
    assert.equal(detail.includes('<FavoriteButton'), false);
    assert.equal(/J’y vais/.test(artiste), false);
    assert.equal(/envie|going/.test(lib), false);
    assert.equal(lib.includes("from '@/lib/reco'"), false);
    assert.equal(control.includes('/api/share'), false);
    assert.equal(control.includes('seedSharerEnvie'), false);

    const tapStart = control.indexOf('function tap()');
    const tap = control.slice(tapStart, control.indexOf('return (', tapStart));
    const loginAt = tap.indexOf("decision.type === 'login'");
    const trackAt = tap.indexOf('track(');
    assert.ok(tapStart >= 0 && loginAt >= 0 && trackAt > loginAt);
    assert.equal(control.includes('if (!artisteId.trim()) return null'), true);
  });

  it('taste CSV stays on the hash allowlist — no artiste id or clear email column', () => {
    const csv = formatTasteExportCsv([]);
    assert.match(csv, /email_hash/);
    assert.equal(csv.includes('artiste_id'), false);
    assert.equal(csv.includes('edosdat@gmail.com'), false);
    assert.match(csv, /0 e-mail clair/);
  });
});
