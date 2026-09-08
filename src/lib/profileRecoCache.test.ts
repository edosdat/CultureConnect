import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement } from './types';
import {
  isProfileRecoCacheCurrent,
  profilePoolsFromFile,
  pruneRecoItemsByLiveKeys,
  type ProfileRecoCacheFile,
} from './profileRecoCache';
import { pruneDeadItemSignals } from './signals';
import { pruneFavoriteKeys } from './favorites';

function item(key: string): DayItem {
  const evenement: Evenement = {
    event_id: key,
    lieu_id: 'L1',
    titre: key,
    categorie: 'cinema',
    date_debut: '2026-09-08',
    date_fin: '2026-09-08',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
  };
  return { kind: 'fallback', key, dayIso: '2026-09-08', evenement, lieu: null };
}

const file = (over: Partial<ProfileRecoCacheFile> = {}): ProfileRecoCacheFile => ({
  parisIso: '2026-09-08',
  commune: 'Toulouse',
  catalogueVersion: 'aaa111bbb222',
  pools: {
    'tous|||toulouse|profile': [item('p:old'), item('p:live')],
  },
  ...over,
});

describe('profileReco cache versioning', () => {
  it('drops the file when the catalogue version rotates', () => {
    const parsed = file();
    assert.equal(
      isProfileRecoCacheCurrent(parsed, '2026-09-08', 'Toulouse', 'aaa111bbb222'),
      true,
    );
    assert.equal(
      isProfileRecoCacheCurrent(parsed, '2026-09-08', 'Toulouse', 'ccc333ddd444'),
      false,
    );
    assert.equal(
      isProfileRecoCacheCurrent(
        { ...parsed, catalogueVersion: undefined },
        '2026-09-08',
        'Toulouse',
        'aaa111bbb222',
      ),
      false,
    );
  });

  it('prunes cards whose keys left the live catalogue', () => {
    const kept = pruneRecoItemsByLiveKeys(
      [item('p:old'), item('p:live')],
      new Set(['p:live']),
    );
    assert.deepEqual(
      kept.map((row) => row.key),
      ['p:live'],
    );
    assert.equal(
      pruneRecoItemsByLiveKeys([item('p:old')], new Set()).length,
      1,
    );
    const pools = profilePoolsFromFile(file(), new Set(['p:live']));
    assert.deepEqual(
      pools['tous|||toulouse|profile']?.map((row) => row.key),
      ['p:live'],
    );
  });
});

describe('guest signal / favorite dead keys', () => {
  it('drops action signals that pin missing programme / film ids', () => {
    const signals = [
      {
        id: '1',
        ts: '2026-09-08T10:00:00.000Z',
        kind: 'open_card' as const,
        weight: 2,
        programme_id: 'gone',
        genres: [] as string[],
        moods: [] as string[],
      },
      {
        id: '2',
        ts: '2026-09-08T10:01:00.000Z',
        kind: 'open_card' as const,
        weight: 2,
        programme_id: 'P-live',
        genres: [] as string[],
        moods: [] as string[],
      },
      {
        id: '3',
        ts: '2026-09-08T10:02:00.000Z',
        kind: 'chip_cat' as const,
        weight: 1,
        genres: [] as string[],
        moods: [] as string[],
      },
    ];
    const pruned = pruneDeadItemSignals(signals, {
      programmeIds: new Set(['P-live']),
    });
    assert.deepEqual(
      pruned.map((s) => s.id),
      ['2', '3'],
    );
    assert.equal(
      pruneDeadItemSignals(signals, { programmeIds: new Set() }).length,
      3,
    );
  });

  it('prunes favorite keys only when a live set is provided', () => {
    assert.deepEqual(pruneFavoriteKeys(['p:old', 'p:live'], new Set(['p:live'])), [
      'p:live',
    ]);
    assert.deepEqual(pruneFavoriteKeys(['p:old'], new Set()), ['p:old']);
  });
});
