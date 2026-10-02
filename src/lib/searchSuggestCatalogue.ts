/**
 * Compact local index for NL salle matching and the secondary title list.
 * Built once per Paris day from the CSV catalogue. No remote suggest.
 */

import { loadCultureData } from './data';
import { normalizeDeepLinkId } from './deepLink';
import { formatLieuAffiche } from './labels';
import {
  isCinemaPeriodAggregate,
  isPublishableEvent,
  isPublishableProgrammeName,
} from './publishable';
import { normalizeSearch } from './searchText';
import type { SearchNlLieu } from './searchNl';
import type { SearchSuggestEntry } from './searchSuggest';
import { parisParts } from './timeScope';
import type { ProgrammeWithContext } from './types';

export type SearchIndex = {
  suggest: SearchSuggestEntry[];
  lieux: SearchNlLieu[];
};

let memo: { day: string; value: SearchIndex } | null = null;

export function clearSearchIndexMemoForTests(): void {
  memo = null;
}

function programmeOk(row: ProgrammeWithContext): boolean {
  if (
    !isPublishableProgrammeName(row.programme.nom_item, {
      notes: row.programme.notes,
      description: row.programme.description_item,
    })
  ) {
    return false;
  }
  if (
    row.evenement &&
    !isPublishableEvent(row.evenement) &&
    !isCinemaPeriodAggregate(row.evenement)
  ) {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(row.programme.date || '');
}

type TitlePick = { label: string; id: string; sub: string; date: string };

function considerTitle(
  map: Map<string, TitlePick>,
  label: string,
  id: string,
  sub: string,
  date: string,
): void {
  const trimmed = (label || '').trim();
  const norm = normalizeSearch(trimmed);
  if (norm.length < 2) return;
  if (!normalizeDeepLinkId(id)) return;
  const prev = map.get(norm);
  if (!prev || date < prev.date) {
    map.set(norm, { label: trimmed, id, sub, date });
  }
}

export function buildSearchIndex(now = new Date()): SearchIndex {
  const day = parisParts(now).iso;
  if (memo?.day === day) return memo.value;
  const data = loadCultureData();
  const titles = new Map<string, TitlePick>();

  for (const row of data.programmeWithContext) {
    if (!programmeOk(row) || row.programme.date < day) continue;
    const sub = formatLieuAffiche(row.lieu);
    considerTitle(
      titles,
      row.programme.nom_item,
      `p:${row.programme.programme_id}`,
      sub,
      row.programme.date,
    );
    const eventTitle = (row.evenement?.titre || '').trim();
    if (eventTitle && normalizeSearch(eventTitle) !== normalizeSearch(row.programme.nom_item)) {
      considerTitle(
        titles,
        eventTitle,
        `p:${row.programme.programme_id}`,
        sub,
        row.programme.date,
      );
    }
  }

  for (const ev of data.events) {
    const end = (ev.date_fin || ev.date_debut || '').trim();
    const start = (ev.date_debut || '').trim();
    if (!start || !end || end < day) continue;
    if (!isPublishableEvent(ev)) continue;
    const lieu = ev.lieu;
    considerTitle(
      titles,
      ev.titre,
      `e:${ev.event_id}:${start}`,
      formatLieuAffiche(lieu),
      start,
    );
  }

  const suggest: SearchSuggestEntry[] = [];
  for (const pick of titles.values()) {
    suggest.push({
      kind: 'titre',
      label: pick.label,
      sub: pick.sub || undefined,
      id: pick.id,
    });
  }

  const seenArtist = new Set<string>();
  for (const artist of data.artistesWithDates) {
    if (artist.upcomingCount < 1) continue;
    const nom = (artist.nom || '').trim();
    const norm = normalizeSearch(nom);
    if (norm.length < 2 || seenArtist.has(norm)) continue;
    seenArtist.add(norm);
    const next = artist.dates.find((d) => d.date >= day);
    suggest.push({
      kind: 'artiste',
      label: nom,
      sub: next?.venueName || undefined,
      id: nom,
    });
  }

  const lieux: SearchNlLieu[] = [];
  const seenLieu = new Set<string>();
  for (const lieu of data.lieux) {
    const id = (lieu.lieu_id || '').trim();
    const nom = (lieu.nom || '').trim();
    if (!id || !nom || seenLieu.has(id)) continue;
    seenLieu.add(id);
    lieux.push({
      id,
      nom,
      label: formatLieuAffiche(lieu) || nom,
      commune: (lieu.commune || '').trim(),
    });
  }

  const value = { suggest, lieux };
  memo = { day, value };
  return value;
}
