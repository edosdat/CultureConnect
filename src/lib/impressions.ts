/**
 * P2 — List impression journal (collect-only).
 * One line per list render. NEVER written to `cc_signals_v1` (cookie budget
 * / compaction — see guestId.ts). Separate server canal `cc:imp:*`.
 * Not injected into taste / reco scoring in this ticket.
 */
import type { DayItem } from '@/lib/types';
import { assertNoVidAccountJoin, isValidVid } from '@/lib/guestSignals';
import type { SignalKind } from '@/lib/signals';

/** Cultural form bucket (admin MixMain + other). */
export type ImpressionForm = 'cinema' | 'theatre_danse' | 'musique' | 'other';

export const IMPRESSION_SURFACES = ['top3', 'slice', 'section'] as const;
export type ImpressionSurface = (typeof IMPRESSION_SURFACES)[number];

/** Same FIFO / retention regime as guest taste appends. */
export const IMPRESSION_FIFO_CAP = 200;
export const IMPRESSION_PAYLOAD_MAX_BYTES = 8 * 1024;
export const IMPRESSION_ITEM_KEY_MAX = 128;
export const IMPRESSION_SCOPE_MAX = 64;
export const IMPRESSION_LIST_MAX = 40;

/** Conversion kinds counted as « actions » after an opening. */
export const IMPRESSION_ACTION_KINDS: ReadonlySet<SignalKind> = new Set([
  'agenda_add',
  'ics',
  'reserve',
  'favorite',
  'outbound_click',
  'share',
]);

export type ImpressionLine = {
  vid: string;
  ts: string;
  surface: ImpressionSurface;
  scope: string;
  itemKeys: string[];
  positions: number[];
  /** Optional: list (or cards) entered the viewport before flush. */
  enteredViewport?: boolean;
};

export type ImpressionClientPayload = {
  surface: ImpressionSurface;
  scope: string;
  itemKeys: string[];
  positions: number[];
  enteredViewport?: boolean;
  ts?: string;
};

export function isImpressionSurface(v: unknown): v is ImpressionSurface {
  return (
    typeof v === 'string' &&
    (IMPRESSION_SURFACES as readonly string[]).includes(v)
  );
}

export function impressionListKey(vid: string): string {
  return `cc:imp:${vid}`;
}

/**
 * Stable key aligned with guest `itemKeyFromSignal` / open_card targets
 * so admin can join impressions ↔ openings.
 */
export function impressionItemKey(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.film_id || '').trim() ||
      (item.programme.event_id || '').trim() ||
      (item.evenement?.event_id || '').trim() ||
      (item.programme.programme_id || '').trim() ||
      (item.key || '').trim()
    );
  }
  return (item.evenement.event_id || '').trim() || (item.key || '').trim();
}

export function positionsForKeys(itemKeys: readonly string[]): number[] {
  return itemKeys.map((_, i) => i + 1);
}

export function buildImpressionLine(opts: {
  vid: string;
  surface: ImpressionSurface;
  scope: string;
  itemKeys: readonly string[];
  positions?: readonly number[];
  enteredViewport?: boolean;
  now?: Date;
}): ImpressionLine {
  const keys = opts.itemKeys
    .map((k) => (k || '').trim())
    .filter(Boolean)
    .slice(0, IMPRESSION_LIST_MAX);
  const positions =
    opts.positions && opts.positions.length === keys.length
      ? opts.positions.map((n) => Math.max(1, Math.floor(n)))
      : positionsForKeys(keys);
  const scope = (opts.scope || '').trim().slice(0, IMPRESSION_SCOPE_MAX) || 'home';
  const line: ImpressionLine = {
    vid: opts.vid,
    ts: (opts.now ?? new Date()).toISOString(),
    surface: opts.surface,
    scope,
    itemKeys: keys,
    positions,
  };
  if (typeof opts.enteredViewport === 'boolean') {
    line.enteredViewport = opts.enteredViewport;
  }
  assertNoVidAccountJoin(line);
  return line;
}

export function formatImpressionLogLine(line: ImpressionLine): string {
  return JSON.stringify(line);
}

export function parseImpressionLine(raw: string): ImpressionLine | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    if (!isValidVid(o.vid)) return null;
    if (!isImpressionSurface(o.surface)) return null;
    if (typeof o.ts !== 'string' || !o.ts) return null;
    if (typeof o.scope !== 'string') return null;
    if (!Array.isArray(o.itemKeys) || !Array.isArray(o.positions)) return null;
    if (o.itemKeys.length !== o.positions.length) return null;
    if (o.itemKeys.length === 0) return null;
    const itemKeys: string[] = [];
    const positions: number[] = [];
    for (let i = 0; i < o.itemKeys.length; i += 1) {
      const k = o.itemKeys[i];
      const p = o.positions[i];
      if (typeof k !== 'string' || !k.trim()) return null;
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 1) return null;
      itemKeys.push(k.trim().slice(0, IMPRESSION_ITEM_KEY_MAX));
      positions.push(Math.floor(p));
    }
    assertNoVidAccountJoin(o);
    const line: ImpressionLine = {
      vid: o.vid,
      ts: o.ts,
      surface: o.surface,
      scope: o.scope.trim().slice(0, IMPRESSION_SCOPE_MAX) || 'home',
      itemKeys,
      positions,
    };
    if (typeof o.enteredViewport === 'boolean') {
      line.enteredViewport = o.enteredViewport;
    }
    return line;
  } catch {
    return null;
  }
}

export function validateImpressionClientPayload(
  raw: unknown,
): ImpressionClientPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isImpressionSurface(o.surface)) return null;
  if (typeof o.scope !== 'string') return null;
  if (!Array.isArray(o.itemKeys) || !Array.isArray(o.positions)) return null;
  if (o.itemKeys.length === 0) return null;
  if (o.itemKeys.length !== o.positions.length) return null;
  if (o.itemKeys.length > IMPRESSION_LIST_MAX) return null;
  const itemKeys: string[] = [];
  const positions: number[] = [];
  for (let i = 0; i < o.itemKeys.length; i += 1) {
    const k = o.itemKeys[i];
    const p = o.positions[i];
    if (typeof k !== 'string' || !k.trim()) return null;
    if (k.trim().length > IMPRESSION_ITEM_KEY_MAX) return null;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 1) return null;
    itemKeys.push(k.trim());
    positions.push(Math.floor(p));
  }
  const out: ImpressionClientPayload = {
    surface: o.surface,
    scope: o.scope.trim().slice(0, IMPRESSION_SCOPE_MAX) || 'home',
    itemKeys,
    positions,
  };
  if (typeof o.enteredViewport === 'boolean') {
    out.enteredViewport = o.enteredViewport;
  }
  if (typeof o.ts === 'string' && o.ts) out.ts = o.ts;
  return out;
}

export function impressionFingerprint(
  surface: ImpressionSurface,
  scope: string,
  itemKeys: readonly string[],
): string {
  return `${surface}|${scope}|${itemKeys.join(',')}`;
}

export type FormRateRow = {
  form: ImpressionForm;
  impressions: number;
  openings: number;
  actions: number;
  /** openings / impressions (0 when no impressions). */
  openRate: number;
  /** actions / openings (0 when no openings). */
  actionRate: number;
};

export type PositionRateRow = {
  position: number;
  impressions: number;
  openings: number;
  /** openings / impressions. */
  openRate: number;
};

export type ZeroOpenItem = {
  itemKey: string;
  impressions: number;
};

export type ImpressionAdminMetrics = {
  byForm: FormRateRow[];
  byPosition: PositionRateRow[];
  zeroOpenHeavy: ZeroOpenItem[];
  totals: {
    impressionLines: number;
    impressionSlots: number;
    openings: number;
    actions: number;
  };
};

export type ImpressionSignalRef = {
  ts: string;
  kind: string;
  itemKey: string;
};

const FORMS = ['cinema', 'theatre_danse', 'musique', 'other'] as const satisfies readonly ImpressionForm[];

function rate(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

/**
 * Admin-only aggregations. `formOf` maps an itemKey → cultural form.
 * Openings = open_card; actions = IMPRESSION_ACTION_KINDS.
 * Position attribution: latest impression (by ts) that listed the itemKey.
 */
export function computeImpressionAdminMetrics(opts: {
  impressions: readonly ImpressionLine[];
  signals: readonly ImpressionSignalRef[];
  formOf: (itemKey: string) => Exclude<ImpressionForm, 'other'> | null;
  zeroOpenMinImpressions?: number;
  maxPosition?: number;
}): ImpressionAdminMetrics {
  const zeroMin = opts.zeroOpenMinImpressions ?? 100;
  const maxPos = opts.maxPosition ?? 5;

  const formImp = new Map<ImpressionForm, number>();
  const formOpen = new Map<ImpressionForm, number>();
  const formAct = new Map<ImpressionForm, number>();
  for (const f of FORMS) {
    formImp.set(f, 0);
    formOpen.set(f, 0);
    formAct.set(f, 0);
  }

  const posImp = new Map<number, number>();
  const posOpen = new Map<number, number>();
  for (let p = 1; p <= maxPos; p += 1) {
    posImp.set(p, 0);
    posOpen.set(p, 0);
  }

  const itemImp = new Map<string, number>();
  /** itemKey → { ts, position } of latest impression slot. */
  const latestPos = new Map<string, { ts: string; position: number }>();

  let impressionSlots = 0;
  for (const line of opts.impressions) {
    for (let i = 0; i < line.itemKeys.length; i += 1) {
      const key = line.itemKeys[i]!;
      const pos = line.positions[i] ?? i + 1;
      impressionSlots += 1;
      itemImp.set(key, (itemImp.get(key) || 0) + 1);
      const form = opts.formOf(key) ?? 'other';
      const formKey: ImpressionForm =
        (FORMS as readonly string[]).includes(form) ? (form as ImpressionForm) : 'other';
      formImp.set(formKey, (formImp.get(formKey) || 0) + 1);
      if (pos >= 1 && pos <= maxPos) {
        posImp.set(pos, (posImp.get(pos) || 0) + 1);
      }
      const prev = latestPos.get(key);
      if (!prev || line.ts >= prev.ts) {
        latestPos.set(key, { ts: line.ts, position: pos });
      }
    }
  }

  let openings = 0;
  let actions = 0;
  const openedKeys = new Set<string>();
  for (const s of opts.signals) {
    const key = (s.itemKey || '').trim();
    if (!key) continue;
    const form = opts.formOf(key) ?? 'other';
    const formKey: ImpressionForm =
        (FORMS as readonly string[]).includes(form) ? (form as ImpressionForm) : 'other';
    if (s.kind === 'open_card') {
      openings += 1;
      openedKeys.add(key);
      formOpen.set(formKey, (formOpen.get(formKey) || 0) + 1);
      const hit = latestPos.get(key);
      if (hit && hit.position >= 1 && hit.position <= maxPos) {
        posOpen.set(hit.position, (posOpen.get(hit.position) || 0) + 1);
      }
    } else if (IMPRESSION_ACTION_KINDS.has(s.kind as SignalKind)) {
      actions += 1;
      formAct.set(formKey, (formAct.get(formKey) || 0) + 1);
    }
  }

  const byForm: FormRateRow[] = FORMS.map((form) => {
    const impressions = formImp.get(form) || 0;
    const opens = formOpen.get(form) || 0;
    const acts = formAct.get(form) || 0;
    return {
      form,
      impressions,
      openings: opens,
      actions: acts,
      openRate: rate(opens, impressions),
      actionRate: rate(acts, opens),
    };
  });

  const byPosition: PositionRateRow[] = [];
  for (let p = 1; p <= maxPos; p += 1) {
    const impressions = posImp.get(p) || 0;
    const opens = posOpen.get(p) || 0;
    byPosition.push({
      position: p,
      impressions,
      openings: opens,
      openRate: rate(opens, impressions),
    });
  }

  const zeroOpenHeavy: ZeroOpenItem[] = [];
  for (const [itemKey, n] of itemImp) {
    if (n > zeroMin && !openedKeys.has(itemKey)) {
      zeroOpenHeavy.push({ itemKey, impressions: n });
    }
  }
  zeroOpenHeavy.sort((a, b) => b.impressions - a.impressions || a.itemKey.localeCompare(b.itemKey));

  return {
    byForm,
    byPosition,
    zeroOpenHeavy,
    totals: {
      impressionLines: opts.impressions.length,
      impressionSlots,
      openings,
      actions,
    },
  };
}
