import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import { clipListPitch, detailDayItem, slimDayItem } from './slim';
import { ficheDescriptionOf, isSlimFichePayload } from './ficheDescription';

const LONG_PITCH =
  'Taïwan, 1988. Hsiao-lee, une jeune adolescente timide, peine à trouver sa place à l’école. ' +
  'Lorsqu’elle découvre le cinéma, le monde s’ouvre. ' +
  'Un portrait sensible d’une jeunesse qui cherche sa voix. ' +
  'Le film suit ses amitiés, ses silences, et la lumière des salles obscures jusqu’au générique.';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Utopia',
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
    date_debut: '2026-09-12',
    date_fin: '2026-09-12',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: 'Pitch court.',
    statut: 'ouvert',
    genre: '',
    ...p,
  };
}

function prog(
  p: Partial<ProgrammeItem> &
    Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: 'film',
    date: '2026-09-12',
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

function programmeItem(opts: {
  cat: string;
  evenement?: Partial<Evenement>;
  programme?: Partial<ProgrammeItem>;
}): DayItem {
  return {
    kind: 'programme',
    key: 'p:P1',
    dayIso: '2026-09-12',
    programme: prog({
      programme_id: 'P1',
      event_id: 'E1',
      nom_item: 'Girl',
      ...opts.programme,
    }),
    evenement: ev({
      event_id: 'E1',
      categorie: opts.cat,
      titre: 'Girl',
      ...opts.evenement,
    }),
    lieu: lieu(),
  };
}

function fallbackItem(evenement: Partial<Evenement> = {}): DayItem {
  return {
    kind: 'fallback',
    key: 'e:E1',
    dayIso: '2026-09-12',
    evenement: ev({
      event_id: 'E1',
      categorie: 'exposition',
      titre: 'Expo',
      ...evenement,
    }),
    lieu: lieu(),
  };
}

describe('ficheDescriptionOf', () => {
  it('shows the full description_longue on a hydrated fiche', () => {
    const item = detailDayItem(
      programmeItem({
        cat: 'cinema',
        evenement: { description_longue: LONG_PITCH, description_courte: 'Court.' },
      }),
    );
    assert.equal(ficheDescriptionOf(item), LONG_PITCH);
    assert.ok(ficheDescriptionOf(item).length > 200);
    assert.ok(!ficheDescriptionOf(item).endsWith('…'));
  });

  it('hides slim first-paint so clipped 1–2 sentences never look like the synopsis', () => {
    const raw = programmeItem({
      cat: 'theatre_danse',
      evenement: { description_longue: LONG_PITCH, description_courte: LONG_PITCH },
    });
    const slim = slimDayItem(raw);
    assert.equal(isSlimFichePayload(slim), true);
    assert.equal(ficheDescriptionOf(slim), '');
    assert.ok(clipListPitch(LONG_PITCH).length < LONG_PITCH.length);
  });

  it('hides the block when every description field is empty', () => {
    const item = detailDayItem(
      programmeItem({
        cat: 'musique',
        evenement: { description_longue: '  ', description_courte: '' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(item), '');
  });

  it('falls back to description_item then courte when longue is empty', () => {
    const viaItem = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: { description_longue: '', description_courte: 'Court.' },
        programme: { description_item: 'Pitch programme entier.' },
      }),
    );
    assert.equal(ficheDescriptionOf(viaItem), 'Pitch programme entier.');

    const viaCourte = detailDayItem(
      programmeItem({
        cat: 'enfants_familles',
        evenement: { description_longue: '', description_courte: 'Pitch famille.' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(viaCourte), 'Pitch famille.');
  });

  it('keeps newlines and does not invent copy', () => {
    const text = 'Acte I.\n\nActe II, la forêt.';
    const item = detailDayItem(
      programmeItem({
        cat: 'theatre_danse',
        evenement: { description_longue: text },
      }),
    );
    assert.equal(ficheDescriptionOf(item), text);
  });

  it('works for fallback event fiches (expo / période)', () => {
    const full = detailDayItem(
      fallbackItem({ description_longue: LONG_PITCH, description_courte: 'Court.' }),
    );
    assert.equal(ficheDescriptionOf(full), LONG_PITCH);
    assert.equal(ficheDescriptionOf(slimDayItem(fallbackItem({ description_longue: LONG_PITCH }))), '');
    assert.equal(
      ficheDescriptionOf(
        detailDayItem(fallbackItem({ description_longue: '', description_courte: '' })),
      ),
      '',
    );
  });
});
