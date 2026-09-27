/**
 * Sync ciné writes programme.genre outside CLOSED_GENRES.
 * animation_jeune_public and patrimoine_retro must score as closed slugs.
 * fiction is a type, not a taste — it must produce no scorable slug.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recommendForProfile } from './reco';
import { emptyProfile, type AccountTasteState } from './signals';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

const NOW = new Date('2026-09-27T12:00:00+02:00');

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

function cine(key: string, genre: string): DayItem {
  const evenement: Evenement = {
    event_id: key,
    lieu_id: 'L1',
    titre: key,
    categorie: 'cinema',
    date_debut: '2026-09-28',
    date_fin: '2026-09-28',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
  };
  const programme: ProgrammeItem = {
    programme_id: `p-${key}`,
    event_id: key,
    lieu_id: 'L1',
    nom_item: key,
    type_item: '',
    date: '2026-09-28',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre,
    artiste_id: '',
    film_id: `F-${key}`,
    form: 'cine',
    moods: '',
    genres_mood: '',
    themes: '',
  };
  return {
    kind: 'programme',
    key,
    dayIso: '2026-09-28',
    programme,
    evenement,
    lieu: lieu(),
  };
}

function taste(genre: string): AccountTasteState {
  return {
    signalsRecent: [],
    profile: {
      ...emptyProfile(),
      genres: { [genre]: { weight: 1, pct: 100 } },
    },
  };
}

function scoredGenre(genreOnRow: string, tasteGenre: string): string | undefined {
  const [hit] = recommendForProfile([cine('row', genreOnRow)], taste(tasteGenre), 3, {
    now: NOW,
  });
  assert.ok(hit, 'cine slot is filled');
  if (hit.reason?.source !== 'profile') return undefined;
  return hit.reason.genre;
}

describe('cine sync genre aliases', () => {
  it('animation_jeune_public and patrimoine_retro score; fiction does not', () => {
    assert.equal(scoredGenre('animation_jeune_public', 'animation'), 'animation');
    assert.equal(scoredGenre('patrimoine_retro', 'patrimoine'), 'patrimoine');
    assert.equal(scoredGenre('fiction', 'drame'), undefined);
    assert.equal(scoredGenre('fiction', 'fiction'), undefined);
    assert.equal(scoredGenre('festival_avp', 'drame'), undefined);
    assert.equal(scoredGenre('documentaire', 'documentaire'), 'documentaire');
  });
});
