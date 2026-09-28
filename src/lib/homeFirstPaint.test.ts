import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCultureData } from './data';
import {
  clearHomePaintMemosForTests,
  computeHomeFirstPaint,
  packTotalsComputeCountForTests,
  queryAgenda,
} from './agendaQuery';
import {
  HOME_FIRST_PAINT_CINE_CAP,
  HOME_FIRST_PAINT_THEATRE_CAP,
} from './slim';
import { parisParts } from './timeScope';

function bodyOf(source: string, signature: string, until: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  const rest = source.slice(start);
  const end = rest.indexOf(until, signature.length);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('home first paint', () => {
  it('checks the day memo before unstable_cache on first paint, window, and list', async () => {
    const query = await readFile(new URL('./agendaQuery.ts', import.meta.url), 'utf8');
    const first = bodyOf(
      query,
      'export async function loadHomeFirstPaint',
      'export async function queryAgendaReco',
    );
    assert.ok(first.indexOf('homePayloadMemo.get') < first.indexOf('unstable_cache'));
    const window = bodyOf(
      query,
      'export async function loadHomeWindow',
      'export function queryAgendaItemDateIso',
    );
    assert.ok(window.indexOf('homePayloadMemo.get') < window.indexOf('unstable_cache'));
    const list = bodyOf(
      query,
      'export async function queryAgendaListCached',
      'export function parseTimeScope',
    );
    assert.ok(list.indexOf('agendaListMemo.get') < list.indexOf('unstable_cache'));
    assert.match(query, /loadPackDensifiedTotals/);
    assert.match(query, /home-first-paint-v4/);
  });

  it('returns the cine and theatre caps plus badge totals without a second densify', () => {
    loadCultureData();
    clearHomePaintMemosForTests();
    const now = new Date();
    const started = performance.now();
    const boot = computeHomeFirstPaint(now);
    const coldMs = performance.now() - started;

    assert.ok(boot.items.length > 0);
    assert.ok(boot.items.length <= HOME_FIRST_PAINT_CINE_CAP);
    assert.ok((boot.vivantItems?.length ?? 0) > 0);
    assert.ok((boot.vivantItems?.length ?? 0) <= HOME_FIRST_PAINT_THEATRE_CAP);
    assert.ok((boot.cineSlotTotal ?? 0) > 0);
    assert.ok((boot.theatreSlotTotal ?? 0) > 0);
    assert.ok((boot.cineTotal ?? 0) >= boot.items.length);
    assert.ok((boot.theatreTotal ?? 0) >= (boot.vivantItems?.length ?? 0));
    assert.equal(packTotalsComputeCountForTests(), 1);
    assert.ok(
      coldMs < 2000,
      `cold computeHomeFirstPaint took ${coldMs.toFixed(0)}ms`,
    );

    const paris = parisParts(now);
    const listed = queryAgenda(
      {
        scope: 'tous',
        commune: 'Toulouse',
        q: '',
        cats: [],
        genres: [],
        lieuId: null,
        selectedDate: null,
        year: paris.year,
        month: paris.month,
      },
      now,
    );
    assert.equal(listed.cineTotal, boot.cineTotal);
    assert.equal(listed.theatreTotal, boot.theatreTotal);
    assert.equal(listed.densifiedTotal, boot.densifiedTotal);
    assert.equal(listed.cineSlotTotal, boot.cineSlotTotal);
    assert.equal(
      packTotalsComputeCountForTests(),
      1,
      'scope=tous must reuse the day totals memo',
    );

    const again = computeHomeFirstPaint(now);
    assert.equal(again.cineTotal, boot.cineTotal);
    assert.equal(again.densifiedTotal, boot.densifiedTotal);
    assert.equal(packTotalsComputeCountForTests(), 1);
  });
});
