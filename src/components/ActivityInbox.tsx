'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  ACTIVITY_EMPTY,
  ACTIVITY_SHEET_SUB,
  ACTIVITY_SHEET_TITLE,
  activityDeltaCopy,
  activityFicheHref,
  countUnreadEvents,
  formatActivityDateShort,
  formatActivityRelative,
  itemIsUnread,
  parseActivityListPayload,
  resolveLastSeen,
  unreadBadgeLabel,
  writeClientLastSeen,
  type ActivityListItem,
} from '@/lib/shareActivity';
import { itemImageUrl, itemTitle } from '@/lib/displayHome';
import { formatLieuAffiche } from '@/lib/labels';
import type { DayItem } from '@/lib/types';

type Meta = {
  title: string;
  where: string;
  image: string;
};

const THUMB_FALLBACKS = [
  'from-culture-terracotta to-[#f0a890]',
  'from-culture-cat-theatre to-[#7ec8cb]',
  'from-culture-cat-musique to-[#b39dd4]',
];

function BellIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={'h-5 w-5 ' + (muted ? 'text-culture-muted' : 'text-culture-ink')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1.1-.6 1.4L4 17h5" />
      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

async function markActivitySeen(): Promise<string> {
  const now = new Date().toISOString();
  writeClientLastSeen(now);
  try {
    const res = await fetch('/api/share/activity/seen', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return now;
    const data = (await res.json()) as { lastSeen?: string };
    if (data.lastSeen) {
      writeClientLastSeen(data.lastSeen);
      return data.lastSeen;
    }
  } catch {
    /* client lastSeen still written */
  }
  return now;
}

function hydrateMeta(item: DayItem): Meta {
  const lieu = formatLieuAffiche(item.lieu);
  const date = formatActivityDateShort(item.dayIso);
  return {
    title: itemTitle(item),
    where: [lieu, date].filter(Boolean).join(' · '),
    image: itemImageUrl(item),
  };
}

export default function ActivityInbox() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityListItem[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [rowSeen, setRowSeen] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, Meta>>({});

  const loadInbox = useCallback(async () => {
    if (!signedIn) {
      setItems([]);
      return;
    }
    try {
      const res = await fetch('/api/share/activity?limit=30', {
        credentials: 'same-origin',
      });
      if (res.status === 401 || res.status === 404 || !res.ok) {
        setItems([]);
        return;
      }
      const parsed = parseActivityListPayload(await res.json());
      setItems(parsed.items);
      setLastSeen(resolveLastSeen(parsed.lastSeen ?? null));
    } catch {
      setItems([]);
    }
  }, [signedIn]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!open) setRowSeen(lastSeen);
  }, [open, lastSeen]);

  useEffect(() => {
    const keys = [...new Set(items.map((it) => it.itemKey))];
    if (keys.length === 0) return;
    let cancelled = false;
    void Promise.all(
      keys.map((key) =>
        fetch(`/api/agenda?id=${encodeURIComponent(key)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { item?: DayItem } | null) => {
            if (!data?.item) return;
            return [key, hydrateMeta(data.item)] as const;
          })
          .catch(() => null),
      ),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, Meta> = {};
      for (const row of rows) {
        if (row) next[row[0]] = row[1];
      }
      setMeta((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!signedIn) return null;

  const unread = countUnreadEvents(items, lastSeen);
  const badge = unreadBadgeLabel(unread);
  const aria = badge
    ? `${unread > 9 ? 'Plus de 9' : unread} notifications non lues`
    : 'Notifications';

  async function openSheet() {
    setRowSeen(lastSeen);
    setOpen(true);
    const seen = await markActivitySeen();
    setLastSeen(seen);
    void loadInbox();
  }

  async function openFiche(item: ActivityListItem) {
    const seen = await markActivitySeen();
    setLastSeen(seen);
    setOpen(false);
    window.location.assign(activityFicheHref(item.itemKey, item.token));
  }

  const sheet =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[110] h-dvh min-h-dvh" role="presentation">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Fermer Mes partages"
              className="absolute inset-0 bg-culture-ink/25"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={ACTIVITY_SHEET_TITLE}
              data-testid="share-activity-sheet"
              className={
                'absolute inset-x-0 bottom-0 flex h-[85dvh] max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-[0_-8px_28px_rgba(0,0,0,.18)] ' +
                'pb-[env(safe-area-inset-bottom,0px)] sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-[420px] sm:-translate-x-1/2'
              }
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-culture-line" />
              <div className="flex items-start justify-between gap-3 border-b border-culture-line px-3.5 pb-2.5 pt-1">
                <div>
                  <h2 className="text-[17px] font-semibold text-culture-ink">
                    {ACTIVITY_SHEET_TITLE}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-culture-muted">
                    {ACTIVITY_SHEET_SUB}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-11 px-1 text-sm text-culture-muted hover:text-culture-ink"
                >
                  Fermer
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-culture-muted">{ACTIVITY_EMPTY}</p>
                    <a
                      href="/"
                      className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-culture-terracotta hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      Voir l’agenda
                    </a>
                  </div>
                ) : (
                  items.map((item, i) => {
                    const unreadRow = itemIsUnread(item, rowSeen);
                    const info = meta[item.itemKey];
                    const delta = activityDeltaCopy(item.events);
                    const when = formatActivityRelative(
                      item.events[0]?.ts || item.createdAt,
                    );
                    return (
                      <button
                        key={`${item.token}-${item.itemKey}`}
                        type="button"
                        onClick={() => void openFiche(item)}
                        className={
                          'flex w-full items-start gap-2.5 border-b border-culture-line px-3.5 py-2.5 text-left ' +
                          (unreadRow ? 'bg-[#fff8f4]' : '')
                        }
                      >
                        <span
                          className={
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ' +
                            (unreadRow ? 'bg-culture-terracotta' : 'bg-transparent')
                          }
                          aria-hidden
                        />
                        {info?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={info.image}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span
                            className={
                              'h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br ' +
                              THUMB_FALLBACKS[i % THUMB_FALLBACKS.length]
                            }
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              'block truncate text-sm ' +
                              (unreadRow
                                ? 'font-bold text-culture-ink'
                                : 'font-semibold text-culture-ink')
                            }
                          >
                            {info?.title || 'Sortie partagée'}
                          </span>
                          {info?.where ? (
                            <span className="mt-0.5 block truncate text-xs text-culture-muted">
                              {info.where}
                            </span>
                          ) : null}
                          {delta ? (
                            <span className="mt-1 block text-[13px] font-semibold text-culture-ink">
                              {delta}
                            </span>
                          ) : null}
                          {when ? (
                            <span className="mt-0.5 block text-[11px] text-culture-muted">
                              {when}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openSheet()}
        aria-label={aria}
        data-testid="share-activity-bell"
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-culture-line bg-white"
      >
        <BellIcon muted={!badge} />
        {badge ? (
          <span
            data-testid="share-activity-badge"
            className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-culture-terracotta px-1 text-[10px] font-bold text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>
      {sheet}
    </>
  );
}
