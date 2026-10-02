/**
 * Relance digeste — two personal windows, same scorer as Mes recos semaine.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  agendaRecommend,
  queryAgenda,
  queryRelanceDigest,
  stopAgendaRecoTraceForTests,
  traceAgendaRecoForTests,
  type AgendaQueryInput,
} from './agendaQuery';
import { workIdOf } from './reco';
import type { TasteProfile } from './signals';
import { parisParts, seanceDateIso } from './timeScope';

/** Dimanche 04/10/2026 12:00 Paris — semaine chip = ce dimanche seulement. */
const SUNDAY = new Date('2026-10-04T10:00:00.000Z');
/** Lundi 28/09/2026 10:00 Paris — lun–ven et sam–dim sont encore devant. */
const MONDAY = new Date('2026-09-28T08:00:00.000Z');
/** Vendredi 02/10/2026 10:00 Paris — le chip weekend inclut le vendredi. */
const FRIDAY = new Date('2026-10-02T08:00:00.000Z');

const origRecommend = agendaRecommend.forProfile;

afterEach(() => {
  agendaRecommend.forProfile = origRecommend;
  stopAgendaRecoTraceForTests();
});

function profile(): TasteProfile {
  return {
    cats: {},
    moods: { intimiste: { weight: 40, pct: 80 } },
    genres: { jazz: { weight: 20, pct: 40 } },
    themes: {},
    communes: {},
  };
}

function semaineInput(now: Date): AgendaQueryInput {
  const paris = parisParts(now);
  return {
    scope: 'semaine',
    commune: null,
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year: paris.year,
    month: paris.month,
    recoUpcoming: true,
    recoProfile: profile(),
  };
}

function keysOf(items: { key: string }[]): string[] {
  return items.map((item) => item.key);
}

describe('queryRelanceDigest', () => {
  it('matches Mes recos semaine when the week left is only Sunday', () => {
    const limits: number[] = [];
    agendaRecommend.forProfile = ((pool, state, topN, options) => {
      limits.push(topN ?? -1);
      return origRecommend(pool, state, topN, options);
    }) as typeof origRecommend;
    const trace = traceAgendaRecoForTests();
    const digest = queryRelanceDigest(
      { commune: null, recoProfile: profile() },
      SUNDAY,
    );
    const week = queryAgenda(semaineInput(SUNDAY), SUNDAY);

    assert.equal(digest.digest, 'relance');
    assert.equal(digest.score, 'mes-recos-semaine');
    assert.equal(digest.timezone, 'Europe/Paris');
    assert.equal(digest.weekKey, '2026-W40');
    assert.equal(digest.parisIso, '2026-10-04');
    assert.deepEqual(
      digest.slices.map((slice) => slice.id),
      ['sam_dim', 'lun_ven'],
    );
    const weekend = digest.slices[0]!;
    const weekdays = digest.slices[1]!;
    assert.equal(weekend.date_from, '2026-10-03');
    assert.equal(weekend.date_to, '2026-10-04');
    assert.equal(weekdays.date_from, '2026-09-28');
    assert.equal(weekdays.date_to, '2026-10-02');
    assert.equal(weekdays.items.length, 0);
    assert.ok(weekend.items.length <= 3);
    assert.deepEqual(keysOf(weekend.items), keysOf(week.items));
    assert.ok(limits.length > 0);
    assert.ok(limits.every((n) => n === 3));
    const windows = trace.filter((hit) => hit.role === 'window');
    assert.ok(windows.length >= 2);
    assert.ok(windows.every((hit) => hit.scope === 'semaine'));
    assert.equal(
      trace.some((hit) => hit.scope === 'tous' || hit.role === 'fallback'),
      false,
    );
  });

  it('keeps each slice inside its Paris window and drops blocked works', () => {
    const first = queryRelanceDigest(
      { commune: null, recoProfile: profile() },
      MONDAY,
    );
    const paris = parisParts(MONDAY);
    assert.equal(first.slices[0]!.date_from, '2026-10-03');
    assert.equal(first.slices[1]!.date_from, '2026-09-28');
    for (const slice of first.slices) {
      assert.ok(slice.items.length <= 3);
      assert.equal(slice.total, slice.items.length);
      for (const item of slice.items) {
        const day = seanceDateIso(item);
        assert.ok(day >= slice.date_from && day <= slice.date_to);
        assert.ok(day >= paris.iso);
      }
    }
    const hit = first.slices.flatMap((slice) => slice.items)[0];
    assert.ok(hit, 'Monday week should still have a personal pick');
    const blocked = workIdOf(hit!) || hit!.key;
    const second = queryRelanceDigest(
      {
        commune: null,
        recoProfile: profile(),
        excludeWorkIds: [blocked],
      },
      MONDAY,
    );
    const left = second.slices.flatMap((slice) =>
      slice.items.map((item) => workIdOf(item) || item.key),
    );
    assert.equal(left.includes(blocked), false);
  });

  it('does not treat Friday as part of the weekend slice', () => {
    const digest = queryRelanceDigest(
      { commune: null, recoProfile: profile() },
      FRIDAY,
    );
    const weekend = digest.slices[0]!;
    assert.deepEqual(
      [weekend.date_from, weekend.date_to],
      ['2026-10-03', '2026-10-04'],
    );
    for (const item of weekend.items) {
      const day = seanceDateIso(item);
      assert.notEqual(day, '2026-10-02');
      assert.ok(day === '2026-10-03' || day === '2026-10-04');
    }
    for (const item of digest.slices[1]!.items) {
      const day = seanceDateIso(item);
      assert.ok(day >= '2026-09-28' && day <= '2026-10-02');
      assert.ok(day >= '2026-10-02');
    }
  });
});

describe('Relance contract — sheet and home Top 3 stay capped', () => {
  it('keeps the week sheet on scope semaine and the reco cap at 3', () => {
    const app = readFileSync(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    const query = readFileSync(new URL('./agendaQuery.ts', import.meta.url), 'utf8');
    const route = readFileSync(
      new URL('../app/api/agenda/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(app, /recoPoolKey\('semaine', null, selectedCommune, 'profile'\)/);
    assert.match(app, /visibleTop3Items\(weekPourToiFilled\)/);
    // #204 demotes week-sheet works off home Top 3, then still caps via visibleTop3Items.
    assert.match(app, /excludeWorksFromPool\(pourToiFilled, weekTop3Cards\)/);
    assert.match(
      app,
      /return visibleTop3Items\(fillEmptyRecoSlots\(pool, slotFillSource\)\)/,
    );
    assert.match(
      query,
      /agendaRecommend\.forProfile\(\s*pool,\s*\{ signalsRecent: \[\], profile \},\s*3,/,
    );
    assert.match(route, /queryRelanceDigest/);
    assert.match(route, /digest=relance requires reco=1/);
    const relance = route.slice(
      route.indexOf("digestMode === 'relance'"),
      route.indexOf('const scopeRaw'),
    );
    assert.equal(relance.includes('avecEnfants'), false);
    const digestFn = query.slice(
      query.indexOf('export function queryRelanceDigest'),
      query.indexOf('export function packTotalsComputeCountForTests'),
    );
    assert.equal(digestFn.includes('avecEnfants'), false);
    assert.match(app, /RECO_BOOT_SCOPES = \['tous', 'soir', 'aujourdhui', 'weekend', 'semaine'\]/);
  });
});
