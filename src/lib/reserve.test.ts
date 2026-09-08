import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rawUrls } from './reserve';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

const ARTO_FLEUR =
  'https://festivalramonville-arto.fr/programmation/spectacle/fleur-de-peau';

function fleur(url: string): DayItem {
  const evenement: Evenement = {
    event_id: 'EHG007',
    lieu_id: 'L150',
    titre: 'Festival de rue de Ramonville 2026 (39e édition)',
    categorie: 'festival',
    date_debut: '2026-09-11',
    date_fin: '2026-09-13',
    heure_debut: '20:30',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: 'cirque_arts_rue',
  };
  const programme: ProgrammeItem = {
    programme_id: 'FEP0029',
    event_id: 'EHG007',
    lieu_id: 'L150',
    nom_item: "Fleur de peau - L'An 01",
    type_item: 'spectacle',
    date: '2026-09-11',
    heure_debut: '20:30',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url,
    notes: '',
    genre: '',
    artiste_id: '',
  };
  const lieu: Lieu = {
    lieu_id: 'L150',
    nom: 'Le Kiwi',
    type: '',
    adresse: '',
    commune: 'Ramonville-Saint-Agne',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
  return {
    kind: 'programme',
    key: 'p:FEP0029',
    dayIso: '2026-09-11',
    programme,
    evenement,
    lieu,
  };
}

describe('rawUrls ARTO spectacle', () => {
  it('keeps the filled https programme.url', () => {
    assert.equal(rawUrls(fleur(ARTO_FLEUR)).page, ARTO_FLEUR);
  });

  it('rewrites /spectacle/… so the href is never an app route', () => {
    assert.equal(rawUrls(fleur('/spectacle/fleur-de-peau')).page, ARTO_FLEUR);
  });
});
