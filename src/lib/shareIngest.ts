/**
 * B3 Matching A ingest for create `share` / visit `open_shared`.
 * Authed only — guests go through B2 `commitGuestSignals`.
 */
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import { queryAgendaDetail } from '@/lib/agendaQuery';
import {
  ACCOUNT_CAP,
  commitTasteSignals,
  makeSignal,
  parseTasteState,
  rebuildTasteState,
  payloadFromDayItem,
  type AccountTasteState,
  type ItemSignalKind,
  type TrackPayload,
} from '@/lib/signals';

export function trackPayloadForItemKey(
  itemKey: string,
  kind: Extract<ItemSignalKind, 'share' | 'open_shared'>,
): TrackPayload {
  const item = queryAgendaDetail(itemKey)?.item;
  if (item) return payloadFromDayItem(item, kind);
  const payload: TrackPayload = { kind, genres: [], moods: [] };
  if (itemKey.startsWith('p:')) payload.programme_id = itemKey.slice(2);
  else if (itemKey.startsWith('e:')) {
    payload.event_id = itemKey.slice(2).split(':')[0] || undefined;
  }
  return payload;
}

export async function ingestAccountItemSignal(opts: {
  user: {
    id?: string | null;
    email?: string | null;
    tasteState?: AccountTasteState;
    tastes?: string;
    tastesSetAt?: string;
  };
  payload: TrackPayload;
}): Promise<AccountTasteState> {
  const userRef = { id: opts.user.id, email: opts.user.email };
  const parsed = parseTasteState(opts.user.tasteState);
  const jwtState =
    parsed ??
    rebuildTasteState(
      [],
      (opts.user.tastes || '').trim() || undefined,
      opts.user.tastesSetAt,
    );
  const stored = await readAccountTaste(userRef);
  const current = hasPersistedTasteState(jwtState) ? jwtState : (stored ?? jwtState);
  const committed = commitTasteSignals(
    { events: current.signalsRecent, profile: current.profile },
    [makeSignal(opts.payload)],
    ACCOUNT_CAP,
  );
  const tasteState = rebuildTasteState(
    committed.events,
    current.tastesText,
    current.tastesSetAt,
    ACCOUNT_CAP,
    committed.profile,
  );
  await writeAccountTaste(userRef, tasteState);
  return tasteState;
}
