import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  IMPRESSION_FIFO_CAP,
  buildImpressionLine,
  computeImpressionAdminMetrics,
  formatImpressionLogLine,
  impressionFingerprint,
  impressionListKey,
  isImpressionSurface,
  parseImpressionLine,
  positionsForKeys,
  IMPRESSION_LIST_MAX,
  validateImpressionClientPayload,
} from './impressions';
import { GUEST_SIGNAL_FIFO_CAP } from './guestSignals';
import { GUEST_STORAGE_KEY } from './signals';

describe('P2 — impression line schema', () => {
  it('requires surface + positions, one line per list', () => {
    const line = buildImpressionLine({
      vid: 'v_abc12def',
      surface: 'top3',
      scope: 'home:soir',
      itemKeys: ['f1', 'e2', 'p3'],
      now: new Date('2026-09-30T12:00:00.000Z'),
    });
    assert.equal(line.surface, 'top3');
    assert.deepEqual(line.positions, [1, 2, 3]);
    assert.deepEqual(line.itemKeys, ['f1', 'e2', 'p3']);
    assert.equal(line.vid, 'v_abc12def');
    assert.ok(line.ts);
    assert.equal(isImpressionSurface('slice'), true);
    assert.equal(isImpressionSurface('section'), true);
    assert.equal(isImpressionSurface('card'), false);
  });

  it('round-trips JSON and rejects mismatched positions', () => {
    const line = buildImpressionLine({
      vid: 'v_abc12def',
      surface: 'section',
      scope: 'cine:soir',
      itemKeys: ['a', 'b'],
      positions: [1, 2],
      enteredViewport: true,
    });
    const raw = formatImpressionLogLine(line);
    const parsed = parseImpressionLine(raw);
    assert.deepEqual(parsed, line);
    assert.equal(
      parseImpressionLine(
        JSON.stringify({ ...line, positions: [1] }),
      ),
      null,
    );
  });

  it('validateImpressionClientPayload needs surface + aligned positions', () => {
    assert.equal(
      validateImpressionClientPayload({
        surface: 'top3',
        scope: 'home',
        itemKeys: ['x'],
        positions: [1],
      })?.surface,
      'top3',
    );
    assert.equal(
      validateImpressionClientPayload({
        surface: 'top3',
        scope: 'home',
        itemKeys: ['x'],
        positions: [1, 2],
      }),
      null,
    );
    assert.equal(
      validateImpressionClientPayload({
        surface: 'nope',
        scope: 'home',
        itemKeys: ['x'],
        positions: [1],
      }),
      null,
    );
  });


  it('truncates oversized itemKeys instead of rejecting (pack cap 80 > 40)', () => {
    const keys = Array.from({ length: 45 }, (_, i) => `e:${i}`);
    const positions = keys.map((_, i) => i + 1);
    const parsed = validateImpressionClientPayload({
      surface: 'section',
      scope: 'theatre:tous',
      itemKeys: keys,
      positions,
    });
    assert.ok(parsed);
    assert.equal(parsed!.itemKeys.length, IMPRESSION_LIST_MAX);
    assert.equal(parsed!.positions.length, IMPRESSION_LIST_MAX);
  });

  it('uses dedicated KV key, not cc_signals_v1', () => {
    assert.equal(impressionListKey('v_abc12def'), 'cc:imp:v_abc12def');
    assert.equal(GUEST_STORAGE_KEY, 'cc_signals_v1');
    assert.notEqual(impressionListKey('v_abc12def'), GUEST_STORAGE_KEY);
    assert.equal(IMPRESSION_FIFO_CAP, GUEST_SIGNAL_FIFO_CAP);
    assert.deepEqual(positionsForKeys(['a', 'b', 'c']), [1, 2, 3]);
    assert.equal(
      impressionFingerprint('top3', 'home', ['a', 'b']),
      'top3|home|a,b',
    );
  });
});

describe('P2 — admin metrics (collect only)', () => {
  it('computes open÷imp and action÷open by form + position rates + zero-open heavy', () => {
    const impressions = [
      buildImpressionLine({
        vid: 'v_abc12def',
        surface: 'top3',
        scope: 'home',
        itemKeys: ['cine1', 'th1', 'cine2', 'mu1', 'cine3'],
        now: new Date('2026-09-29T10:00:00.000Z'),
      }),
      buildImpressionLine({
        vid: 'v_abc12def',
        surface: 'section',
        scope: 'cine',
        itemKeys: ['dead1'],
        now: new Date('2026-09-29T11:00:00.000Z'),
      }),
    ];
    // >100 impressions on dead1
    for (let i = 0; i < 101; i += 1) {
      impressions.push(
        buildImpressionLine({
          vid: 'v_zzz99zzz',
          surface: 'section',
          scope: 'theatre',
          itemKeys: ['dead1'],
          now: new Date(`2026-09-29T12:00:${String(i % 60).padStart(2, '0')}.000Z`),
        }),
      );
    }
    const formOf = (k: string) => {
      if (k.startsWith('cine')) return 'cinema' as const;
      if (k.startsWith('th')) return 'theatre_danse' as const;
      if (k.startsWith('mu')) return 'musique' as const;
      return null;
    };
    const signals = [
      { ts: '2026-09-29T10:05:00.000Z', kind: 'open_card', itemKey: 'cine1' },
      { ts: '2026-09-29T10:06:00.000Z', kind: 'reserve', itemKey: 'cine1' },
      { ts: '2026-09-29T10:07:00.000Z', kind: 'open_card', itemKey: 'th1' },
    ];
    const m = computeImpressionAdminMetrics({
      impressions,
      signals,
      formOf,
      zeroOpenMinImpressions: 100,
    });
    const cine = m.byForm.find((r) => r.form === 'cinema')!;
    assert.equal(cine.impressions, 3);
    assert.equal(cine.openings, 1);
    assert.equal(cine.actions, 1);
    assert.ok(Math.abs(cine.openRate - 1 / 3) < 1e-9);
    assert.equal(cine.actionRate, 1);
    const pos1 = m.byPosition.find((r) => r.position === 1)!;
    assert.ok(pos1.impressions >= 1);
    assert.ok(pos1.openings >= 1);
    assert.ok(m.zeroOpenHeavy.some((z) => z.itemKey === 'dead1' && z.impressions > 100));
    assert.equal(
      m.zeroOpenHeavy.some((z) => z.itemKey === 'cine1'),
      false,
    );
  });
});

describe('P2 — storage + consent guards (source)', () => {
  it('does not write impressions into cc_signals_v1 or taste scoring', async () => {
    const store = await readFile(
      new URL('./impressionStore.ts', import.meta.url),
      'utf8',
    );
    assert.match(store, /impressionListKey/);
    assert.equal(store.includes('writeGuestStore'), false);
    assert.equal(store.includes('commitTasteSignals'), false);
    assert.equal(store.includes('appendGuestSignal'), false);

    const route = await readFile(
      new URL('../app/api/impressions/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(route, /SIGNALS_CONSENT_COOKIE/);
    assert.match(route, /accepted/);
    assert.match(route, /status: 204/);

    const probe = await readFile(
      new URL('../components/ListImpressionProbe.tsx', import.meta.url),
      'utf8',
    );
    assert.match(probe, /hasAcceptedSignalsConsent/);
    assert.match(probe, /IMPRESSION_LIST_MAX/);
    assert.match(probe, /\/api\/impressions/);
    assert.equal(probe.includes(GUEST_STORAGE_KEY), false);
    assert.equal(probe.includes('trackItem'), false);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /ListImpressionProbe/);
    assert.match(app, /surface="top3"/);
    assert.match(app, /surface="section"/);
    // Home slice section intentionally not rendered (hide-home-slice tip).
    assert.equal(app.includes('surface="slice"'), false);
    assert.equal(app.includes('data-slice'), false);
    assert.match(
      app,
      /visibleTop3Items\(fillEmptyRecoSlots\(pool, slotFillSource\)\)/,
    );
    assert.match(app, /reasonFor=\{reasonFor\}/);
  });

  it('admin surfaces P2 KPIs and never public fiche counters', async () => {
    const view = await readFile(
      new URL('../components/AdminAnalyticsView.tsx', import.meta.url),
      'utf8',
    );
    assert.match(view, /SECTION_COPY\.impressions/);
    assert.match(view, /p2-form/);
    assert.match(view, /p2-zero/);

    const seance = await readFile(
      new URL('../components/SeanceCard.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(seance.includes('impression'), false);
    assert.equal(seance.includes('vues'), false);
  });
});
