import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import { detailDayItem, slimDayItem } from './slim';
import { ficheDescriptionOf } from './ficheDescription';

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
  it('prefers description_longue over description_courte', () => {
    const item = detailDayItem(
      programmeItem({
        cat: 'cinema',
        evenement: { description_longue: LONG_PITCH, description_courte: 'Court.' },
      }),
    );
    assert.equal(ficheDescriptionOf(item), LONG_PITCH);
    assert.ok(ficheDescriptionOf(item).length > 200);
  });

  it('list slim drops longue — fiche uses detailDayItem', () => {
    const raw = programmeItem({
      cat: 'theatre_danse',
      evenement: { description_longue: LONG_PITCH, description_courte: 'Court.' },
    });
    const slim = slimDayItem(raw);
    assert.equal(slim.evenement?.description_longue, undefined);
    assert.equal(ficheDescriptionOf(slim), 'Court.');
    assert.equal(ficheDescriptionOf(detailDayItem(raw)), LONG_PITCH);
  });

  it('uses short alone when no long field is filled', () => {
    const item = detailDayItem(
      programmeItem({
        cat: 'enfants_familles',
        evenement: { description_longue: '', description_courte: 'Pitch famille.' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(item), 'Pitch famille.');
  });

  it('hides the block only when every description field is empty', () => {
    const item = detailDayItem(
      programmeItem({
        cat: 'musique',
        evenement: { description_longue: '  ', description_courte: '' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(item), '');
  });

  it('treats description_item as the long pitch when longue is empty', () => {
    const viaItem = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: { description_longue: '', description_courte: 'Court.' },
        programme: { description_item: 'Pitch programme entier.' },
      }),
    );
    assert.equal(ficheDescriptionOf(viaItem), 'Pitch programme entier.');
  });

  it('prefers filled description_item over the shared festival longue', () => {
    const festivalBlurb =
      'Premier festival des arts de la rue. Une trentaine de compagnies.';
    const itemPitch = 'Solo circassien: Fleur de peau, pitch pièce.';
    const item = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: {
          event_id: 'EHG007',
          titre: 'Festival de rue de Ramonville',
          description_longue: festivalBlurb,
          description_courte: '39e édition ARTO.',
        },
        programme: {
          nom_item: 'Fleur de peau - L\'An 01',
          description_item: itemPitch,
        },
      }),
    );
    assert.equal(ficheDescriptionOf(item), itemPitch);
    assert.notEqual(ficheDescriptionOf(item), festivalBlurb);
  });

  it('falls back to longue then courte when description_item is empty or whitespace', () => {
    const longue = 'Blurb festival partagé.';
    const emptyItem = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: { description_longue: longue, description_courte: 'Court.' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(emptyItem), longue);

    const wsItem = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: { description_longue: longue, description_courte: 'Court.' },
        programme: { description_item: '   ' },
      }),
    );
    assert.equal(ficheDescriptionOf(wsItem), longue);

    const courteOnly = detailDayItem(
      programmeItem({
        cat: 'festival',
        evenement: { description_longue: '', description_courte: 'Court festival.' },
        programme: { description_item: '' },
      }),
    );
    assert.equal(ficheDescriptionOf(courteOnly), 'Court festival.');
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
    assert.equal(
      ficheDescriptionOf(detailDayItem(fallbackItem({ description_longue: LONG_PITCH }))),
      LONG_PITCH,
    );
    const slimFallback = slimDayItem(
      fallbackItem({ description_longue: LONG_PITCH, description_courte: '' }),
    );
    const slimEv = slimFallback.evenement;
    assert.ok(slimEv);
    assert.equal(slimEv.description_longue, undefined);
    assert.ok((slimEv.description_courte || '').length > 0);
    assert.ok((slimEv.description_courte || '').length <= 320);
    assert.equal(
      ficheDescriptionOf(
        detailDayItem(fallbackItem({ description_longue: '', description_courte: '' })),
      ),
      '',
    );
    assert.equal(
      ficheDescriptionOf(
        detailDayItem(fallbackItem({ description_longue: '', description_courte: 'Seul court.' })),
      ),
      'Seul court.',
    );
  });
});
