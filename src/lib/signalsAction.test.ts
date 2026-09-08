import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNAL_WEIGHTS,
  applyIncomingSignals,
  applySignalToProfile,
  cancelFavoriteSignals,
  commitTasteSignals,
  dedupAppend,
  emptyProfile,
  favoriteToggleKind,
  ingestMapSignal,
  isKnownSignalKind,
  isTasteWritingSignal,
  makeSignal,
  inheritTasteTagsFromPeers,
  payloadFromDayItem,
  resolveLoginMerge,
  shouldMapTasteIngest,
  shouldPostLoginMerge,
  shouldPromptLogin,
  signalHasMappedTasteTags,
  type Signal,
} from './signals';
import { detailDayItem, relatedSeanceDayItem } from './slim';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: '',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(): Evenement {
  return {
    event_id: 'ev-1',
    lieu_id: 'L1',
    date_debut: '2026-09-02',
    date_fin: '2026-09-02',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    titre: 'Stand-up',
    categorie: 'theatre',
    genre: 'humour_standup',
    moods: 'rigolo',
  };
}

function prog(): ProgrammeItem {
  return {
    programme_id: 'pr-1',
    event_id: 'ev-1',
    nom_item: 'Stand-up',
    lieu_id: 'L1',
    type_item: '',
    date: '2026-09-02',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'humour_standup',
    artiste_id: '',
    moods: 'rigolo',
  };
}

function item(): DayItem {
  return {
    kind: 'programme',
    key: 'pr-1',
    dayIso: '2026-09-02',
    programme: prog(),
    evenement: ev(),
    lieu: lieu(),
  };
}

describe('SIGNAL_WEIGHTS — matching engine step A', () => {
  it('assigns spec weights including new strong signals', () => {
    assert.equal(SIGNAL_WEIGHTS.favorite, 6);
    assert.equal(SIGNAL_WEIGHTS.unfavorite, -6);
    assert.equal(SIGNAL_WEIGHTS.reserve, 6);
    assert.equal(SIGNAL_WEIGHTS.outbound_click, 4);
    assert.equal(SIGNAL_WEIGHTS.share, 3);
    assert.equal(SIGNAL_WEIGHTS.ics, 5);
    assert.equal(SIGNAL_WEIGHTS.agenda_add, 5);
    assert.equal(SIGNAL_WEIGHTS.open_card, 2);
    assert.ok(SIGNAL_WEIGHTS.favorite > SIGNAL_WEIGHTS.outbound_click);
    assert.ok(SIGNAL_WEIGHTS.outbound_click > SIGNAL_WEIGHTS.share);
    assert.ok(SIGNAL_WEIGHTS.share > SIGNAL_WEIGHTS.open_card);
    assert.equal(SIGNAL_WEIGHTS.favorite, -SIGNAL_WEIGHTS.unfavorite);
  });

  it('makeSignal uses table weights for new kinds', () => {
    for (const kind of ['favorite', 'unfavorite', 'outbound_click', 'share'] as const) {
      const s = makeSignal({ kind, event_id: 'ev-1', genres: [], moods: [] });
      assert.equal(s.weight, SIGNAL_WEIGHTS[kind], kind);
      assert.equal(s.kind, kind);
      assert.equal(s.event_id, 'ev-1');
    }
  });
});

describe('favorite / unfavorite cancel', () => {
  it('favoriteToggleKind maps heart on/off to kinds', () => {
    assert.equal(favoriteToggleKind(false), 'favorite');
    assert.equal(favoriteToggleKind(true), 'unfavorite');
  });

  it('unfavorite reverses favorite contribution on the same tags', () => {
    const fav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const unfav = makeSignal({
      kind: 'unfavorite',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    assert.equal(fav.weight, 6);
    assert.equal(unfav.weight, -6);

    const afterFav = applyIncomingSignals(emptyProfile(), [fav]);
    assert.equal(afterFav.moods.rigolo?.weight, 6);
    assert.ok((afterFav.genres.standup?.weight ?? 0) > 0);

    const afterCancel = applyIncomingSignals(afterFav, [unfav]);
    assert.equal(afterCancel.moods.rigolo, undefined);
    assert.equal(afterCancel.genres.standup, undefined);
  });

  it('unfavorite cancels a matching favorite in the signal list', () => {
    const fav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const other = makeSignal({
      kind: 'favorite',
      event_id: 'ev-other',
      moods: ['tendre'],
      genres: ['drame'],
    });
    const unfav = makeSignal({
      kind: 'unfavorite',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const cancelled = cancelFavoriteSignals([fav, other], unfav);
    assert.equal(
      cancelled.some((s) => s.kind === 'favorite' && s.event_id === 'ev-1'),
      false,
    );
    assert.equal(cancelled.some((s) => s.event_id === 'ev-other'), true);

    const appended = dedupAppend([fav, other], unfav, 40);
    assert.equal(
      appended.some((s) => s.kind === 'favorite' && s.event_id === 'ev-1'),
      false,
    );
    assert.equal(appended.some((s) => s.kind === 'unfavorite'), true);
    assert.equal(appended.some((s) => s.event_id === 'ev-other'), true);
  });

  it('does not leave negative taste weights after cancel', () => {
    const p = emptyProfile();
    applySignalToProfile(
      p,
      makeSignal({
        kind: 'unfavorite',
        moods: ['rigolo'],
        genres: ['standup'],
      }),
    );
    assert.deepEqual(p.moods, {});
    assert.deepEqual(p.genres, {});
  });
});

describe('UI tracking paths — payloadFromDayItem', () => {
  it('favorite / unfavorite / share / outbound_click / reserve carry event + programme ids', () => {
    const fiche = item();
    for (const kind of [
      'favorite',
      'unfavorite',
      'share',
      'outbound_click',
      'reserve',
    ] as const) {
      const payload = payloadFromDayItem(fiche, kind);
      const signal = makeSignal(payload);
      assert.equal(payload.kind, kind, kind);
      assert.equal(payload.event_id, 'ev-1', kind);
      assert.equal(payload.programme_id, 'pr-1', kind);
      assert.equal(signal.event_id, 'ev-1', kind);
      assert.equal(signal.programme_id, 'pr-1', kind);
      assert.equal(signal.weight, SIGNAL_WEIGHTS[kind], kind);
      assert.ok(signal.moods.includes('rigolo'), kind);
      assert.ok(shouldMapTasteIngest(kind, ['rigolo']));
    }
  });

  it('tagSource supplies fiche moods when the seance wire is tagless', () => {
    const fiche = item();
    if (fiche.kind !== 'programme') assert.fail('expected programme');
    const seance: DayItem = {
      kind: 'programme',
      key: 'pr-seance',
      dayIso: fiche.dayIso,
      programme: {
        ...fiche.programme,
        programme_id: 'pr-seance',
        film_id: 'F9',
        moods: '',
        genres_mood: '',
        genre: '',
        nom_item: 'Séance 20h',
      },
      evenement: {
        ...ev(),
        titre: 'Séance 20h',
        genre: '',
        moods: '',
        categorie: 'cinema',
      },
      lieu: fiche.lieu,
    };
    const bare = makeSignal(payloadFromDayItem(seance, 'outbound_click'));
    assert.equal(signalHasMappedTasteTags(bare), false);
    const withFiche = makeSignal(
      payloadFromDayItem(seance, 'outbound_click', fiche),
    );
    assert.ok(withFiche.moods.includes('rigolo'));
    assert.equal(withFiche.film_id, 'F9');
  });

  it('detail / related reserve maps the same moods as open_card', () => {
    const fiche = item();
    const open = makeSignal(payloadFromDayItem(fiche, 'open_card'));
    const fromDetail = makeSignal(
      payloadFromDayItem(detailDayItem(fiche), 'reserve'),
    );
    const fromRelated = makeSignal(
      payloadFromDayItem(relatedSeanceDayItem(fiche), 'outbound_click'),
    );
    assert.ok(open.moods.includes('rigolo'));
    assert.deepEqual(fromDetail.moods, open.moods);
    assert.deepEqual(fromRelated.moods, open.moods);
  });

  it('shouldMapTasteIngest covers new fiche actions', () => {
    assert.equal(shouldMapTasteIngest('favorite', []), true);
    assert.equal(shouldMapTasteIngest('unfavorite', []), true);
    assert.equal(shouldMapTasteIngest('outbound_click', []), true);
    assert.equal(shouldMapTasteIngest('share', []), true);
    assert.equal(shouldMapTasteIngest('reserve', []), true);
  });

  it('favorite / share / outbound_click prompt login like other strong actions', () => {
    const base = {
      id: 's1',
      ts: new Date().toISOString(),
      genres: [] as string[],
      moods: [] as string[],
      event_id: 'ev-1',
    };
    assert.equal(
      shouldPromptLogin([{ ...base, kind: 'favorite', weight: 6 } as Signal]),
      true,
    );
    assert.equal(
      shouldPromptLogin([{ ...base, kind: 'share', weight: 3 } as Signal]),
      true,
    );
    assert.equal(
      shouldPromptLogin([{ ...base, kind: 'outbound_click', weight: 4 } as Signal]),
      true,
    );
    assert.equal(
      shouldPromptLogin([{ ...base, kind: 'unfavorite', weight: -6 } as Signal]),
      false,
    );
  });
});

describe('reserve + outbound_click — no double-count', () => {
  it('same-click pair applies only the stronger reserve weight', () => {
    const reserve = makeSignal({
      kind: 'reserve',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const outbound = makeSignal({
      kind: 'outbound_click',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const together = applyIncomingSignals(emptyProfile(), [outbound, reserve]);
    assert.equal(together.moods.rigolo?.weight, 6);

    const outThenRes = commitTasteSignals(
      { events: [], profile: emptyProfile() },
      [outbound],
      40,
    );
    const afterReserve = commitTasteSignals(outThenRes, [reserve], 40);
    assert.equal(afterReserve.profile.moods.rigolo?.weight, 6);

    const resThenOut = commitTasteSignals(
      { events: [], profile: emptyProfile() },
      [reserve],
      40,
    );
    const afterOutbound = commitTasteSignals(resThenOut, [outbound], 40);
    assert.equal(afterOutbound.profile.moods.rigolo?.weight, 6);
  });

  it('different fiches still both count', () => {
    const a = makeSignal({
      kind: 'reserve',
      event_id: 'ev-a',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const b = makeSignal({
      kind: 'outbound_click',
      event_id: 'ev-b',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const p = applyIncomingSignals(emptyProfile(), [a, b]);
    assert.equal(p.moods.rigolo?.weight, 10);
  });

  it('tagless Réserver copies open_card moods — net +6, no double-count', () => {
    const open = makeSignal({
      kind: 'open_card',
      film_id: 'F1',
      event_id: 'ev-1',
      programme_id: 'pr-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const outbound = makeSignal({
      kind: 'outbound_click',
      film_id: 'F1',
      event_id: 'ev-1',
      programme_id: 'pr-seance',
      moods: [],
      genres: [],
    });
    const reserve = makeSignal({
      kind: 'reserve',
      film_id: 'F1',
      event_id: 'ev-1',
      programme_id: 'pr-seance',
      moods: [],
      genres: [],
    });
    assert.equal(signalHasMappedTasteTags(outbound), false);
    assert.equal(signalHasMappedTasteTags(reserve), false);

    const copied = inheritTasteTagsFromPeers(reserve, [open]);
    assert.ok(copied.moods.includes('rigolo'));
    assert.ok(copied.genres.includes('standup'));

    const afterOpen = commitTasteSignals(
      { events: [], profile: emptyProfile() },
      [open],
      40,
    );
    assert.equal(afterOpen.profile.moods.rigolo?.weight, 2);

    const afterPair = commitTasteSignals(afterOpen, [outbound, reserve], 40);
    assert.equal(afterPair.profile.moods.rigolo?.weight, 8);
    assert.equal(
      afterPair.events.some(
        (s) => s.kind === 'reserve' && s.moods.includes('rigolo'),
      ),
      true,
    );
    assert.equal(
      afterPair.events.some(
        (s) => s.kind === 'outbound_click' && s.moods.includes('rigolo'),
      ),
      true,
    );

    const sequential = commitTasteSignals(afterOpen, [outbound], 40);
    const afterReserve = commitTasteSignals(sequential, [reserve], 40);
    assert.equal(afterReserve.profile.moods.rigolo?.weight, 8);
  });

  it('tagless reserve without a tagged peer stays audit-only', () => {
    const reserve = makeSignal({
      kind: 'reserve',
      event_id: 'ev-bare',
      moods: [],
      genres: [],
    });
    const next = commitTasteSignals(
      { events: [], profile: emptyProfile() },
      [reserve],
      40,
    );
    assert.equal(next.events.length, 1);
    assert.deepEqual(next.profile.moods, {});
  });
});

describe('unknown ingest kinds drop safely', () => {
  it('does not map or write tastes for an unknown kind', () => {
    assert.equal(isKnownSignalKind('hacked_kind'), false);
    assert.equal(shouldMapTasteIngest('hacked_kind', ['rigolo']), false);
    assert.equal(isTasteWritingSignal({ kind: 'hacked_kind' as Signal['kind'] }), false);
    const mapped = ingestMapSignal({
      kind: 'hacked_kind' as Signal['kind'],
      moods: ['rigolo', 'humour'],
      genres: ['standup'],
    });
    assert.deepEqual(mapped.moods, []);
    assert.deepEqual(mapped.genres, []);
    const p = applyIncomingSignals(emptyProfile(), [
      {
        id: 'x',
        ts: new Date().toISOString(),
        kind: 'hacked_kind' as Signal['kind'],
        weight: 99,
        moods: ['rigolo'],
        genres: ['standup'],
      },
    ]);
    assert.deepEqual(p.moods, {});
    assert.deepEqual(p.genres, {});
  });
});

describe('login merge — additive guest action signals', () => {
  it('adds favorite / share onto the email profile without inventing tastes', () => {
    const stored = {
      signalsRecent: [],
      profile: {
        ...emptyProfile(),
        moods: { tendre: { weight: 2, pct: 100 } },
      },
    };
    const guestFav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-1',
      moods: ['humour', 'sortie'],
      genres: ['cinema', 'standup'],
    });
    const guestShare = makeSignal({
      kind: 'share',
      event_id: 'ev-1',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    const out = resolveLoginMerge({
      stored,
      jwt: { signalsRecent: [], profile: emptyProfile() },
      guestSignals: [guestFav, guestShare],
      guestProfile: emptyProfile(),
    });
    assert.equal(out.wroteGuest, true);
    assert.ok((out.state.profile.moods.tendre?.weight ?? 0) >= 2);
    assert.ok((out.state.profile.moods.rigolo?.weight ?? 0) > 0);
    assert.equal(out.state.profile.moods.humour, undefined);
    assert.equal(out.state.profile.moods.sortie, undefined);
    assert.equal(out.state.profile.genres.cinema, undefined);
    assert.equal(out.state.profile.cats.cinema, undefined);
  });

  it('still merges guest favorite when JWT already has tastes', () => {
    const jwt = {
      signalsRecent: [],
      profile: {
        ...emptyProfile(),
        moods: { tendre: { weight: 4, pct: 100 } },
      },
    };
    assert.equal(shouldPostLoginMerge(jwt, [], emptyProfile()), false);
    const guestFav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-2',
      moods: ['rigolo'],
      genres: ['standup'],
    });
    assert.equal(shouldPostLoginMerge(jwt, [guestFav], emptyProfile()), true);
    const out = resolveLoginMerge({
      stored: jwt,
      jwt,
      guestSignals: [guestFav],
      guestProfile: emptyProfile(),
    });
    assert.equal(out.wroteGuest, true);
    assert.ok((out.state.profile.moods.tendre?.weight ?? 0) >= 4);
    assert.ok((out.state.profile.moods.rigolo?.weight ?? 0) > 0);
  });
});

describe('tagless signals — audit only', () => {
  it('keeps favorite in the log and does not bump the profile', () => {
    const fav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-bare',
      commune: 'Toulouse',
      moods: ['sortie'],
      genres: ['cinema'],
    });
    const mapped = ingestMapSignal(fav);
    assert.equal(signalHasMappedTasteTags(mapped), false);
    const next = commitTasteSignals(
      { events: [], profile: emptyProfile() },
      [fav],
      40,
    );
    assert.equal(next.events.length, 1);
    assert.equal(next.events[0]?.kind, 'favorite');
    assert.deepEqual(next.profile.moods, {});
    assert.deepEqual(next.profile.genres, {});
    assert.deepEqual(next.profile.communes, {});
  });

  it('merges a tagless guest favorite as audit onto stored tastes', () => {
    const stored = {
      signalsRecent: [],
      profile: {
        ...emptyProfile(),
        moods: { tendre: { weight: 3, pct: 100 } },
      },
    };
    const guestFav = makeSignal({
      kind: 'favorite',
      event_id: 'ev-bare',
      moods: [],
      genres: [],
    });
    assert.equal(shouldPostLoginMerge(stored, [guestFav], emptyProfile()), true);
    const out = resolveLoginMerge({
      stored,
      jwt: stored,
      guestSignals: [guestFav],
      guestProfile: emptyProfile(),
    });
    assert.equal(out.wroteGuest, true);
    assert.equal(out.state.profile.moods.tendre?.weight, 3);
    assert.equal(out.state.signalsRecent.some((s) => s.kind === 'favorite'), true);
  });
});
