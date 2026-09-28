/**
 * N1 — demoteWorkIds branché dans queryAgenda (recalcul serveur, sans état client).
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  agendaRecommend,
  lastDemoteChainMs,
  queryAgenda,
  stopAgendaRecoTraceForTests,
  traceAgendaRecoForTests,
  type AgendaQueryInput,
} from './agendaQuery';
import { slotFormOfItem, workIdOf } from './reco';
import type { TasteProfile } from './signals';
import type { DayItem } from './types';
import { parisParts, type TimeScopeId } from './timeScope';

/** Lundi 28/09/2026 10:00 Paris — hors week-end. */
const MONDAY = new Date('2026-09-28T08:00:00.000Z');
/** Mardi 29/09/2026 10:00 Paris. */
const TUESDAY = new Date('2026-09-29T08:00:00.000Z');
/** Samedi 03/10/2026 10:00 Paris — aujourd'hui est dans le week-end. */
const SATURDAY = new Date('2026-10-03T08:00:00.000Z');

const origRecommend = agendaRecommend.forProfile;

afterEach(() => {
  agendaRecommend.forProfile = origRecommend;
  stopAgendaRecoTraceForTests();
});

function monoMood(mood: string): TasteProfile {
  return {
    cats: {},
    moods: { [mood]: { weight: 60, pct: 100 } },
    genres: {},
    themes: {},
    communes: {},
  };
}

function inputFor(
  scope: TimeScopeId,
  profile: TasteProfile | null,
  now: Date,
  extra?: Partial<AgendaQueryInput>,
): AgendaQueryInput {
  const paris = parisParts(now);
  return {
    scope,
    commune: null,
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year: paris.year,
    month: paris.month,
    recoUpcoming: true,
    recoProfile: profile,
    ...extra,
  };
}

function cineWorkId(items: DayItem[]): string | null {
  for (const item of items) {
    if (slotFormOfItem(item) !== 'cine') continue;
    const id = workIdOf(item) || item.key || '';
    if (id) return id;
  }
  return null;
}

function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].filter(Boolean).sort();
}

function retainedIds(items: DayItem[]): string[] {
  return sortedIds(items.map((item) => workIdOf(item) || item.key || ''));
}

describe('agendaQuery demoteWorkIds (N1)', { concurrency: false }, () => {
  it("aujourdhui et semaine : œuvres ciné différentes (profil mono-mood)", () => {
    const profile = monoMood('rigolo');
    const today = queryAgenda(inputFor('aujourdhui', profile, MONDAY), MONDAY);
    const week = queryAgenda(inputFor('semaine', profile, MONDAY), MONDAY);
    const todayCine = cineWorkId(today.items);
    const weekCine = cineWorkId(week.items);
    assert.ok(todayCine, "aujourd'hui doit proposer une œuvre ciné");
    assert.ok(weekCine, 'semaine doit proposer une œuvre ciné');
    assert.notEqual(weekCine, todayCine);
  });

  it("un seul item éligible sur un slot : l'item démoté remplit quand même", () => {
    const profile = monoMood('rigolo');
    const hits = traceAgendaRecoForTests();
    let demotedCine: DayItem | null = null;
    let demotedId = '';
    agendaRecommend.forProfile = (items, state, topN, options) => {
      const hit = hits[hits.length - 1];
      if (hit?.role === 'window' && hit.scope === 'semaine') {
        assert.ok(demotedCine, 'la chaîne doit avoir retenu un ciné aujourd’hui');
        const id = demotedId;
        assert.ok(
          options?.demoteWorkIds?.has(id),
          'le ciné du jour est dans demoteWorkIds de la semaine',
        );
        const rest = items.filter((item) => slotFormOfItem(item) !== 'cine');
        const scored = origRecommend(
          [demotedCine, ...rest],
          state,
          topN,
          options,
        );
        const cine = scored.find((row) => slotFormOfItem(row.item) === 'cine');
        assert.ok(cine, 'le slot ciné ne doit pas rester vide');
        assert.equal(workIdOf(cine.item) || cine.item.key, id);
        return scored;
      }
      const scored = origRecommend(items, state, topN, options);
      if (hit?.role === 'narrow' && hit.scope === 'aujourdhui') {
        demotedCine =
          scored.find((row) => slotFormOfItem(row.item) === 'cine')?.item ??
          null;
        demotedId = demotedCine
          ? workIdOf(demotedCine) || demotedCine.key
          : '';
      }
      return scored;
    };

    const week = queryAgenda(inputFor('semaine', profile, MONDAY), MONDAY);
    assert.ok(demotedId);
    assert.equal(cineWorkId(week.items), demotedId);
  });

  it('le repli tous reçoit la même chaîne de démotion', () => {
    const profile = monoMood('rigolo');
    const hits = traceAgendaRecoForTests();
    agendaRecommend.forProfile = (items, state, topN, options) => {
      const hit = hits[hits.length - 1];
      if (hit?.role === 'window' && hit.scope === 'tous') {
        const one =
          items.find((item) => slotFormOfItem(item) === 'cine') ?? items[0];
        return origRecommend(one ? [one] : [], state, topN, options);
      }
      return origRecommend(items, state, topN, options);
    };

    queryAgenda(inputFor('tous', profile, MONDAY), MONDAY);
    const window = hits.filter((hit) => hit.role === 'window' && hit.scope === 'tous');
    const fallback = hits.filter(
      (hit) => hit.role === 'fallback' && hit.scope === 'tous',
    );
    assert.equal(window.length, 1);
    assert.equal(fallback.length, 1);
    assert.ok((window[0]?.demoteWorkIds.size ?? 0) > 0);
    assert.equal(fallback[0]?.demoteWorkIds, window[0]?.demoteWorkIds);
  });

  it('scope=date ne démote rien', () => {
    const profile = monoMood('rigolo');
    const hits = traceAgendaRecoForTests();
    queryAgenda(
      inputFor('date', profile, MONDAY, { selectedDate: '2026-10-02' }),
      MONDAY,
    );
    assert.ok(hits.length >= 1);
    assert.equal(hits.filter((hit) => hit.role === 'narrow').length, 0);
    for (const hit of hits) {
      assert.equal(hit.demoteWorkIds.size, 0);
    }
  });

  it('weekend mardi ne démote rien ; weekend samedi démote aujourd’hui', () => {
    const profile = monoMood('rigolo');

    const tuesdayHits = traceAgendaRecoForTests();
    queryAgenda(inputFor('weekend', profile, TUESDAY), TUESDAY);
    stopAgendaRecoTraceForTests();
    assert.equal(
      tuesdayHits.filter((hit) => hit.role === 'narrow').length,
      0,
    );
    const tuesdayWindow = tuesdayHits.find((hit) => hit.role === 'window');
    assert.ok(tuesdayWindow);
    assert.equal(tuesdayWindow.demoteWorkIds.size, 0);

    const saturdayToday = queryAgenda(
      inputFor('aujourdhui', profile, SATURDAY),
      SATURDAY,
    );
    const saturdayHits = traceAgendaRecoForTests();
    queryAgenda(inputFor('weekend', profile, SATURDAY), SATURDAY);
    const saturdayWindow = saturdayHits.find((hit) => hit.role === 'window');
    assert.ok(saturdayWindow);
    assert.deepEqual(
      sortedIds(saturdayWindow.demoteWorkIds),
      retainedIds(saturdayToday.items),
    );
    assert.ok(saturdayWindow.demoteWorkIds.size > 0);
  });

  it('deux appels successifs, même entrée, même sortie', () => {
    const profile = monoMood('intense');
    const input = inputFor('semaine', profile, MONDAY);
    const a = queryAgenda(input, MONDAY);
    const b = queryAgenda(input, MONDAY);
    assert.deepEqual(
      a.items.map((item) => item.key),
      b.items.map((item) => item.key),
    );
    assert.deepEqual(
      a.items.map((item) => workIdOf(item)),
      b.items.map((item) => workIdOf(item)),
    );
  });

  it('mémo : servir tous ne dépasse pas 4 recommendForProfile pour la chaîne', () => {
    const profile = monoMood('rigolo');
    const hits = traceAgendaRecoForTests();
    let spyCalls = 0;
    agendaRecommend.forProfile = (items, state, topN, options) => {
      spyCalls += 1;
      return origRecommend(items, state, topN, options);
    };

    queryAgenda(inputFor('tous', profile, MONDAY), MONDAY);

    const narrow = hits.filter((hit) => hit.role === 'narrow');
    const narrowScopes = narrow.map((hit) => hit.scope);
    // Plafond consignes : servir `tous` n'appelle pas recommendForProfile
    // plus de 4 fois (chaîne mémoïsée + fenêtre + repli).
    assert.ok(
      spyCalls <= 4,
      `spy ${spyCalls} (chaîne ${narrowScopes.join(',') || '—'})`,
    );
    assert.equal(new Set(narrowScopes).size, narrowScopes.length);
    assert.equal(spyCalls, hits.length);
    assert.ok(narrow.length <= 4);
  });

  it('25 profils banc via queryAgenda : 0 ciné commun aux 3 fenêtres', () => {
    const file = path.join(process.cwd(), 'scripts', 'benchProfiles.eloi.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      profiles: Array<{ id: string; state: { profile: TasteProfile } }>;
    };
    assert.equal(raw.profiles.length, 25);

    const scopes = ['aujourdhui', 'semaine', 'tous'] as const;
    const clashes: string[] = [];
    const tousMs: number[] = [];
    // Échauffement : le parse CSV ne doit pas entrer dans la mesure.
    queryAgenda(inputFor('tous', raw.profiles[0]!.state.profile, MONDAY), MONDAY);

    for (const row of raw.profiles) {
      const cine = {} as Record<(typeof scopes)[number], string | null>;
      for (const scope of scopes) {
        const res = queryAgenda(
          inputFor(scope, row.state.profile, MONDAY),
          MONDAY,
        );
        cine[scope] = cineWorkId(res.items);
        if (scope === 'tous') tousMs.push(lastDemoteChainMs);
      }
      if (cine.aujourdhui && cine.aujourdhui === cine.semaine && cine.semaine === cine.tous) {
        clashes.push(`${row.id}:${cine.aujourdhui}`);
      }
    }

    tousMs.sort((a, b) => a - b);
    const maxMs = tousMs[tousMs.length - 1] ?? 0;
    const medianMs = tousMs[Math.floor(tousMs.length / 2)] ?? 0;
    console.log(
      `demoteChain scope=tous n=25 medianMs=${medianMs.toFixed(1)} maxMs=${maxMs.toFixed(1)}`,
    );
    assert.deepEqual(clashes, []);
  });
});
