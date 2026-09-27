import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilmTagStore, fillEmptyWorkTags } from './filmTags';
import { itemInheritsParentClosedTags, itemIsUntagged } from './reco';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function row(partial: Partial<ProgrammeItem> = {}): ProgrammeItem {
  return {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Film',
    type_item: 'film',
    date: '2026-10-01',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'fiction',
    artiste_id: '',
    film_id: 'F1',
    form: 'cine',
    moods: '',
    mood_source: '',
    mood_confiance: '',
    genres_mood: '',
    themes: '',
    ...partial,
  };
}

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

function evenement(moods: string): Evenement {
  return {
    event_id: 'E003',
    lieu_id: 'L1',
    titre: 'Utopia saison',
    categorie: 'cinema',
    date_debut: '2026-09-27',
    date_fin: '2026-12-01',
    heure_debut: '14:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    publication: 'agenda',
    form: 'cine',
    moods,
  };
}

describe('fillEmptyWorkTags', () => {
  it('copies the sibling moods onto an empty séance and marks mood_source=work', () => {
    const tagged = row({
      programme_id: 'P-TAG',
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'famille',
      mood_source: 'pitch',
      mood_confiance: 'haute',
    });
    const empty = row({
      programme_id: 'P-EMPTY',
      moods: '',
      genres_mood: '',
      themes: '',
      mood_source: '',
    });
    const store = buildFilmTagStore([tagged, empty]);
    const filled = fillEmptyWorkTags(empty, store);
    assert.equal(filled.moods, 'rigolo');
    assert.equal(filled.genres_mood, 'comedie');
    assert.equal(filled.themes, 'famille');
    assert.equal(filled.mood_source, 'work');
    assert.equal(empty.moods, '');
  });

  it('does not overwrite a séance that already has moods', () => {
    const kept = row({
      programme_id: 'P-KEPT',
      moods: 'sombre',
      genres_mood: 'drame',
      themes: 'deuil',
      mood_source: 'pitch',
      mood_confiance: 'basse',
    });
    const other = row({
      programme_id: 'P-OTHER',
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'amour',
      mood_source: 'pitch',
      mood_confiance: 'haute',
    });
    const store = buildFilmTagStore([other, kept]);
    const filled = fillEmptyWorkTags(kept, store);
    assert.equal(filled, kept);
    assert.equal(filled.moods, 'sombre');
    assert.equal(filled.genres_mood, 'drame');
    assert.equal(filled.themes, 'deuil');
    assert.equal(filled.mood_source, 'pitch');
  });

  it('never inherits tags when film_id is missing', () => {
    const tagged = row({
      programme_id: 'P-TAG',
      film_id: 'F1',
      moods: 'rigolo',
      mood_confiance: 'haute',
    });
    const orphan = row({
      programme_id: 'P-ORPHAN',
      film_id: '',
      moods: '',
    });
    const blank = row({
      programme_id: 'P-BLANK',
      film_id: '   ',
      moods: '',
    });
    const store = buildFilmTagStore([tagged, orphan, blank]);
    assert.equal(store.has(''), false);
    assert.equal(store.has('F1'), true);
    assert.equal(fillEmptyWorkTags(orphan, store).moods, '');
    assert.equal(fillEmptyWorkTags(orphan, store).mood_source, '');
    assert.equal(fillEmptyWorkTags(blank, store).moods, '');
    assert.equal(fillEmptyWorkTags(blank, store), blank);
  });

  it('does not let mood_source=parent feed the store', () => {
    const parent = row({
      programme_id: 'P-PARENT',
      moods: 'rigolo|festif|intense|sombre|tendre|epique|brutal|angoissant',
      genres_mood: 'comedie',
      themes: 'famille',
      mood_source: 'parent',
      mood_confiance: 'haute',
      scraped_at: '2026-09-01T19:00:07',
    });
    const empty = row({
      programme_id: 'P-EMPTY',
      moods: '',
    });
    const store = buildFilmTagStore([parent, empty]);
    assert.equal(store.has('F1'), false);
    const filled = fillEmptyWorkTags(empty, store);
    assert.equal(filled.moods, '');
    assert.equal(filled.mood_source, '');
    assert.equal(filled, empty);
  });

  it('picks the haute source line regardless of input order', () => {
    const haute = row({
      programme_id: 'P-HAUTE',
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'amour',
      mood_confiance: 'haute',
      scraped_at: '2020-01-01',
    });
    const basse = row({
      programme_id: 'P-BASSE',
      moods: 'sombre|festif',
      genres_mood: 'documentaire',
      themes: 'guerre',
      mood_confiance: 'basse',
      scraped_at: '2026-09-01T19:00:07',
    });
    const fromLowFirst = buildFilmTagStore([basse, haute]).get('F1');
    const fromHighFirst = buildFilmTagStore([haute, basse]).get('F1');
    assert.deepEqual(fromLowFirst, {
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'amour',
    });
    assert.deepEqual(fromHighFirst, fromLowFirst);
  });

  it('stays untagged when the season parent has moods and no sibling séance is tagged', () => {
    const parentMoods =
      'rigolo|tendre|intense|angoissant|epique|brutal|festif|cerveau';
    const seance = row({
      programme_id: 'P-SEANCE',
      event_id: 'E003',
      film_id: 'F-NEW',
      form: 'cine',
      moods: '',
      genres_mood: '',
      themes: '',
    });
    const sibling = row({
      programme_id: 'P-SIBLING',
      event_id: 'E003',
      film_id: 'F-NEW',
      form: 'cine',
      moods: '',
    });
    const otherFilm = row({
      programme_id: 'P-OTHER',
      event_id: 'E003',
      film_id: 'F-OTHER',
      moods: 'sombre',
      mood_confiance: 'haute',
    });
    const store = buildFilmTagStore([seance, sibling, otherFilm]);
    const filled = fillEmptyWorkTags(seance, store);
    assert.equal(store.has('F-NEW'), false);
    assert.equal(filled.moods, '');
    assert.notEqual(filled.mood_source, 'work');

    const day: DayItem = {
      kind: 'programme',
      key: 'P-SEANCE',
      dayIso: '2026-10-01',
      programme: filled,
      evenement: evenement(parentMoods),
      lieu: lieu(),
    };
    assert.equal(parentMoods.split('|').length, 8);
    assert.equal(itemInheritsParentClosedTags(day), false);
    assert.equal(itemIsUntagged(day), true);
  });

  it('resolves the same source line when the input order changes', () => {
    const newer = row({
      programme_id: 'P-NEW',
      film_id: 'FB',
      moods: 'poetique',
      genres_mood: 'drame',
      themes: 'histoire',
      mood_confiance: 'moyenne',
      scraped_at: '2026-09-01T19:00:07',
    });
    const older = row({
      programme_id: 'P-OLD',
      film_id: 'FB',
      moods: 'brutal',
      genres_mood: 'thriller',
      themes: 'guerre',
      mood_confiance: 'moyenne',
      scraped_at: '2026-08-01T00:00:00',
    });
    const smallId = row({
      programme_id: 'P001',
      film_id: 'FC',
      moods: 'intense',
      genres_mood: 'polar',
      themes: 'deuil',
      mood_confiance: 'basse',
      scraped_at: '2026-08-24T15:57:08',
    });
    const bigId = row({
      programme_id: 'P002',
      film_id: 'FC',
      moods: 'festif',
      genres_mood: 'comedie',
      themes: 'famille',
      mood_confiance: 'basse',
      scraped_at: '2026-08-24T15:57:08',
    });
    const empty = row({
      programme_id: 'P-EMPTY-B',
      film_id: 'FB',
      moods: '',
      genres_mood: '',
      themes: '',
    });
    const orderA = [bigId, older, empty, smallId, newer];
    const orderB = [newer, smallId, empty, older, bigId];

    function resolved(rows: ProgrammeItem[]) {
      const store = buildFilmTagStore(rows);
      const filled = fillEmptyWorkTags(empty, store);
      return {
        fb: store.get('FB'),
        fc: store.get('FC'),
        moods: filled.moods,
        genres_mood: filled.genres_mood,
        themes: filled.themes,
        mood_source: filled.mood_source,
      };
    }

    const expected = {
      fb: { moods: 'poetique', genres_mood: 'drame', themes: 'histoire' },
      fc: { moods: 'intense', genres_mood: 'polar', themes: 'deuil' },
      moods: 'poetique',
      genres_mood: 'drame',
      themes: 'histoire',
      mood_source: 'work',
    };
    assert.deepEqual(resolved(orderA), expected);
    assert.deepEqual(resolved(orderB), expected);
  });
});
