import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTasteMood, TASTE_MOODS } from './phraseTags';
import {
  applySignalToProfile,
  emptyProfile,
  extractMoods,
  ingestMapSignal,
  makeSignal,
  mapThenDropTasteTags,
  parseTasteState,
  payloadFromDayItem,
  rebuildTasteState,
  sanitizeTasteProfile,
  shouldMapTasteIngest,
  TASTE_GENRE_SLUGS,
} from './signals';
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

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
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
    genre: '',
    ...p,
  };
}

function prog(
  p: Partial<ProgrammeItem> & Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: '',
    date: '2026-09-02',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    ...p,
  };
}

function item(opts: {
  key: string;
  cat: string;
  moods?: string;
  genre?: string;
  genresMood?: string;
  titre?: string;
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.titre ?? opts.key,
    genre: opts.genre ?? '',
    moods: opts.moods,
    genres_mood: opts.genresMood,
  });
  const programme = prog({
    programme_id: `p-${opts.key}`,
    event_id: opts.key,
    nom_item: opts.titre ?? opts.key,
    genre: opts.genre ?? '',
    moods: opts.moods,
    genres_mood: opts.genresMood,
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: '2026-09-02',
    programme,
    evenement,
    lieu: lieu(),
  };
}

function profileOf(signal: ReturnType<typeof makeSignal>) {
  const p = emptyProfile();
  applySignalToProfile(p, signal);
  return p;
}

describe('taste ingest — MAP then DROP', () => {
  it('maps comedy aliases to rigolo + comedie', () => {
    for (const token of ['comedie', 'comédie', 'comique', 'humour']) {
      const mapped = mapThenDropTasteTags([token], []);
      assert.deepEqual(mapped.moods, ['rigolo'], token);
      assert.deepEqual(mapped.genres, ['comedie'], token);
      assert.equal(mapped.moods.includes(token), false, token);
    }
  });

  it('maps standup / sketch / one-man family to rigolo + standup', () => {
    for (const token of [
      'standup',
      'stand-up',
      'sketch',
      'one-man',
      'one-woman',
      'seul en scène',
    ]) {
      const mapped = mapThenDropTasteTags([], [], token);
      assert.deepEqual(mapped.moods, ['rigolo'], token);
      assert.deepEqual(mapped.genres, ['standup'], token);
    }
  });

  it('maps horreur to angoissant + horreur; épouvante is mood-only', () => {
    assert.deepEqual(mapThenDropTasteTags(['horreur'], []), {
      moods: ['angoissant'],
      genres: ['horreur'],
    });
    assert.deepEqual(mapThenDropTasteTags(['epouvante'], []), {
      moods: ['angoissant'],
      genres: [],
    });
    assert.deepEqual(mapThenDropTasteTags([], [], 'épouvante'), {
      moods: ['angoissant'],
      genres: [],
    });
  });

  it('maps animation and patrimoine/rétro as genres only — not moods', () => {
    assert.deepEqual(mapThenDropTasteTags(['animation'], []), {
      moods: [],
      genres: ['animation'],
    });
    for (const token of ['patrimoine', 'rétro', 'retro']) {
      const mapped = mapThenDropTasteTags([token], []);
      assert.deepEqual(mapped.moods, [], token);
      assert.deepEqual(mapped.genres, ['patrimoine'], token);
    }
    const offAnim = mapThenDropTasteTags([], ['animation_jeune_public']);
    assert.deepEqual(offAnim.moods, []);
    assert.deepEqual(offAnim.genres, ['animation']);
    const offRetro = mapThenDropTasteTags([], ['patrimoine_retro']);
    assert.deepEqual(offRetro.moods, []);
    assert.deepEqual(offRetro.genres, ['patrimoine']);
  });

  it('drops moods outside the 16 and drops sortie', () => {
    const mapped = mapThenDropTasteTags(
      ['rigolo', 'sortie', 'tiré', 'horreur'],
      ['cinema', 'musique'],
    );
    assert.deepEqual(mapped.moods, ['rigolo', 'angoissant']);
    assert.equal(mapped.moods.includes('sortie'), false);
    assert.equal(mapped.genres.includes('cinema'), false);
    assert.equal(mapped.genres.includes('musique'), false);
    assert.ok(mapped.genres.includes('horreur'));
    assert.equal(TASTE_MOODS.length, 16);
    assert.ok(mapped.moods.every(isTasteMood));
  });

  it('writes open_card / reserve / agenda_add already mapped', () => {
    for (const kind of ['open_card', 'reserve', 'agenda_add'] as const) {
      const s = makeSignal({
        kind,
        moods: ['comédie', 'sortie'],
        genres: ['humour_standup', 'cinema'],
      });
      assert.deepEqual(s.moods, ['rigolo']);
      assert.ok(s.genres.includes('comedie'));
      assert.ok(s.genres.includes('standup'));
      assert.equal(s.genres.includes('cinema'), false);
      assert.equal(s.moods.includes('sortie'), false);
      assert.ok(s.moods.every(isTasteMood));
      assert.ok(s.genres.every((g) => (TASTE_GENRE_SLUGS as readonly string[]).includes(g)));
      const p = profileOf(s);
      assert.ok((p.moods.rigolo?.weight ?? 0) > 0);
      assert.equal(p.moods.sortie, undefined);
      assert.equal(p.cats.cinema, undefined);
      assert.equal(p.genres.cinema, undefined);
    }
  });

  it('maps chip_genre when moods[] nonempty; leaves empty-mood genre chips', () => {
    assert.equal(shouldMapTasteIngest('chip_genre', ['humour']), true);
    assert.equal(shouldMapTasteIngest('chip_genre', []), false);
    const mapped = makeSignal({
      kind: 'chip_genre',
      chip: 'comedie',
      genres: ['comedie'],
      moods: extractMoods('comedie'),
    });
    assert.deepEqual(mapped.moods, ['rigolo']);
    assert.deepEqual(mapped.genres, ['comedie']);

    const jazz = makeSignal({
      kind: 'chip_genre',
      chip: 'jazz_blues',
      genres: ['jazz_blues'],
      moods: [],
    });
    assert.deepEqual(jazz.moods, []);
    assert.deepEqual(jazz.genres, ['jazz_blues']);
  });

  it('never writes chip_cat cinema / musique as tastes', () => {
    for (const cat of ['cinema', 'musique']) {
      const p = emptyProfile();
      applySignalToProfile(
        p,
        makeSignal({
          kind: 'chip_cat',
          chip: cat,
          categorie: cat,
          genres: [cat],
          moods: [],
        }),
      );
      assert.deepEqual(p.cats, {});
      assert.deepEqual(p.moods, {});
      assert.deepEqual(p.genres, {});
    }
  });

  it('payloadFromDayItem + makeSignal maps fiche aliases and keeps locked moods', () => {
    const comedy = makeSignal(
      payloadFromDayItem(
        item({
          key: 'th-hum',
          cat: 'theatre',
          genre: 'humour_standup',
          moods: 'sortie',
          titre: 'One-man stand-up',
        }),
        'open_card',
      ),
    );
    assert.ok(comedy.moods.includes('rigolo'));
    assert.equal(comedy.moods.includes('sortie'), false);
    assert.ok(comedy.genres.includes('standup'));
    assert.ok(comedy.genres.includes('comedie'));

    const horror = makeSignal(
      payloadFromDayItem(
        item({
          key: 'cine-h',
          cat: 'cinema',
          genresMood: 'horreur|épouvante',
          titre: 'Épouvante',
        }),
        'reserve',
      ),
    );
    assert.deepEqual(horror.moods.filter((m) => m === 'angoissant'), ['angoissant']);
    assert.ok(horror.genres.includes('horreur'));
    assert.equal(horror.moods.includes('horreur'), false);
    assert.equal(horror.genres.includes('epouvante'), false);

    const anim = makeSignal(
      payloadFromDayItem(
        item({
          key: 'cine-a',
          cat: 'cinema',
          genre: 'animation_jeune_public',
          moods: 'rigolo',
        }),
        'agenda_add',
      ),
    );
    assert.ok(anim.moods.includes('rigolo'));
    assert.equal(anim.moods.includes('animation'), false);
    assert.ok(anim.genres.includes('animation'));
    assert.equal(anim.genres.includes('animation_jeune_public'), false);

    const retro = makeSignal(
      payloadFromDayItem(
        item({
          key: 'cine-r',
          cat: 'cinema',
          genre: 'patrimoine_retro',
        }),
        'open_card',
      ),
    );
    assert.equal(retro.moods.includes('patrimoine'), false);
    assert.ok(retro.genres.includes('patrimoine'));
    assert.equal(retro.genres.includes('patrimoine_retro'), false);
  });

  it('ingestMapSignal is idempotent and does not invent a 17th mood', () => {
    const once = makeSignal({
      kind: 'open_card',
      moods: ['humour', 'sortie'],
      genres: ['comedie'],
    });
    const twice = ingestMapSignal(once);
    assert.deepEqual(twice.moods, once.moods);
    assert.deepEqual(twice.genres, once.genres);
    assert.equal(twice.moods.length, 1);
    assert.ok(twice.moods.every((m) => (TASTE_MOODS as readonly string[]).includes(m)));
  });
});

describe('taste profile — one-shot migrate of stored mood keys', () => {
  it('moves moods.comedie → rigolo + genres.comedie and drops the comedie mood key', () => {
    const clean = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { comedie: { weight: 4, pct: 100 } },
    });
    assert.equal(clean.moods.comedie, undefined);
    assert.ok((clean.moods.rigolo?.weight ?? 0) > 0);
    assert.ok((clean.genres.comedie?.weight ?? 0) > 0);
    assert.equal(clean.moods.rigolo?.pct, 100);
    assert.equal(clean.genres.comedie?.pct, 100);
  });

  it('moves horreur → angoissant + genres.horreur; epouvante → angoissant only', () => {
    const horror = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { horreur: { weight: 3, pct: 100 } },
    });
    assert.equal(horror.moods.horreur, undefined);
    assert.ok((horror.moods.angoissant?.weight ?? 0) > 0);
    assert.ok((horror.genres.horreur?.weight ?? 0) > 0);

    const fright = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { epouvante: { weight: 2, pct: 100 } },
    });
    assert.equal(fright.moods.epouvante, undefined);
    assert.ok((fright.moods.angoissant?.weight ?? 0) > 0);
    assert.equal(fright.genres.horreur, undefined);
    assert.equal(fright.genres.epouvante, undefined);
  });

  it('moves animation and patrimoine as genres only', () => {
    const anim = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { animation: { weight: 5, pct: 100 } },
    });
    assert.equal(anim.moods.animation, undefined);
    assert.equal(Object.keys(anim.moods).length, 0);
    assert.ok((anim.genres.animation?.weight ?? 0) > 0);

    const retro = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { patrimoine: { weight: 2, pct: 100 } },
    });
    assert.equal(retro.moods.patrimoine, undefined);
    assert.equal(Object.keys(retro.moods).length, 0);
    assert.ok((retro.genres.patrimoine?.weight ?? 0) > 0);

    // NOT 0 rétro — stored rétro/retro mood keys move to genres.patrimoine
    for (const key of ['retro', 'rétro']) {
      const row = sanitizeTasteProfile({
        ...emptyProfile(),
        moods: { [key]: { weight: 3, pct: 100 } },
      });
      assert.equal(row.moods[key], undefined, key);
      assert.equal(Object.keys(row.moods).length, 0, key);
      assert.ok((row.genres.patrimoine?.weight ?? 0) > 0, key);
      assert.equal(row.genres.patrimoine_retro, undefined, key);
    }
  });

  it('does not invent moods that were already dropped (weight 0 or absent)', () => {
    const wiped = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { comedie: { weight: 0, pct: 0 }, rigolo: { weight: 1, pct: 100 } },
    });
    assert.equal(wiped.moods.comedie, undefined);
    assert.equal(wiped.moods.rigolo?.weight, 1);
    assert.equal(wiped.genres.comedie, undefined);

    const parsed = parseTasteState({
      signalsRecent: [
        makeSignal({ kind: 'open_card', moods: ['comedie'], genres: [] }),
      ],
      profile: {
        ...emptyProfile(),
        moods: { rigolo: { weight: 1, pct: 100 } },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed!.profile.moods.comedie, undefined);
    assert.equal(parsed!.profile.moods.rigolo?.weight, 1);
    assert.equal(parsed!.profile.genres.comedie, undefined);
  });

  it('is a no-op when moods are already the 16 (edosdat-like rigolo:1)', () => {
    const clean = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { rigolo: { weight: 1, pct: 100 } },
    });
    assert.deepEqual(Object.keys(clean.moods), ['rigolo']);
    assert.equal(clean.moods.rigolo?.weight, 1);
    assert.deepEqual(clean.genres, {});
  });

  it('does not migrate genres into moods', () => {
    const clean = sanitizeTasteProfile({
      ...emptyProfile(),
      moods: { rigolo: { weight: 1, pct: 50 } },
      genres: {
        comedie: { weight: 4, pct: 40 },
        animation: { weight: 3, pct: 30 },
        patrimoine: { weight: 3, pct: 30 },
        horreur: { weight: 2, pct: 0 },
      },
    });
    assert.deepEqual(Object.keys(clean.moods).sort(), ['rigolo']);
    assert.equal(clean.moods.angoissant, undefined);
    assert.equal(clean.moods.animation, undefined);
    assert.equal(clean.moods.patrimoine, undefined);
    assert.ok((clean.genres.comedie?.weight ?? 0) > 0);
    assert.ok((clean.genres.animation?.weight ?? 0) > 0);
    assert.ok((clean.genres.patrimoine?.weight ?? 0) > 0);
    assert.equal(clean.genres.animation_jeune_public, undefined);
    assert.equal(clean.genres.patrimoine_retro, undefined);
  });

  it('does not replay signalsRecent when rebuilding', () => {
    const old = makeSignal({
      kind: 'open_card',
      moods: ['comedie', 'sortie'],
      genres: [],
    });
    // Force a dirty stored signal (pre-ingest) without remapping it here.
    const dirty = { ...old, moods: ['comedie', 'sortie'], genres: [] };
    const rebuilt = rebuildTasteState(
      [dirty],
      undefined,
      undefined,
      40,
      { ...emptyProfile(), moods: { rigolo: { weight: 1, pct: 100 } } },
    );
    assert.equal(rebuilt.profile.moods.comedie, undefined);
    assert.equal(rebuilt.profile.moods.sortie, undefined);
    assert.equal(rebuilt.profile.moods.rigolo?.weight, 1);
    assert.equal(rebuilt.profile.genres.comedie, undefined);
  });

  it('does not expand a rigolo-only overlay from old signals (edosdat Ambiances)', () => {
    const leftover = {
      ...makeSignal({ kind: 'open_card', moods: ['tendre'], genres: ['comedie'] }),
      moods: ['tendre', 'comedie'],
      genres: ['comedie'],
    };
    const parsed = parseTasteState({
      signalsRecent: [leftover],
      profile: {
        ...emptyProfile(),
        moods: { rigolo: { weight: 1, pct: 100 } },
      },
    });
    assert.ok(parsed);
    assert.deepEqual(Object.keys(parsed!.profile.moods), ['rigolo']);
    assert.equal(parsed!.profile.moods.rigolo?.weight, 1);
    assert.equal(parsed!.profile.moods.tendre, undefined);
    assert.equal(parsed!.profile.genres.comedie, undefined);

    const rebuilt = rebuildTasteState(
      [leftover],
      undefined,
      undefined,
      40,
      { ...emptyProfile(), moods: { rigolo: { weight: 1, pct: 100 } } },
    );
    assert.deepEqual(Object.keys(rebuilt.profile.moods), ['rigolo']);
    assert.equal(rebuilt.profile.moods.tendre, undefined);
    assert.equal(rebuilt.profile.genres.comedie, undefined);
  });
});
