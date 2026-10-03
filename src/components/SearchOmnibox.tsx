'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { SEARCH_PLACEHOLDER } from '@/lib/displayHome';
import {
  SEARCH_NL_DEBOUNCE_MS,
  SEARCH_NL_HINT,
  SEARCH_NL_MIN_CHARS,
  parseSearchNl,
  previewChips,
  queryNamesKnownLieu,
  searchNlMode,
  type SearchNlDict,
  type SearchNlParse,
} from '@/lib/searchNl';
import {
  highlightLabel,
  suggestArtistes,
  suggestLocal,
  suggestSalles,
  type SearchSuggestEntry,
} from '@/lib/searchSuggest';
import { normalizeSearch } from '@/lib/searchText';

type Props = {
  value: string;
  /** Draft text only — never applies chips. Empty string drops title q. */
  onChange: (value: string) => void;
  /** Bare title commit (no filter chips on screen). */
  onSubmit?: (value: string) => void;
  /**
   * Settled text with no NL chips. Venue names and unknown queries
   * filter the list under the field. Never applies a chip.
   */
  onBareQuery?: (value: string) => void;
  /** Preview is open with ≥1 chip — same path as the Confirmer button. */
  onConfirm?: (parsed: SearchNlParse) => void;
  onPickTitre?: (itemKey: string) => void;
  onPickArtiste?: (name: string) => void;
  /** Venue row: id + display name. Lists that lieu, never a filter-band chip. */
  onPickSalle?: (id: string, label: string) => void;
  /**
   * After a salle pick, the field shows this name and the dropdown stays shut
   * so the debounce does not turn the name back into a text query.
   */
  venueLock?: string | null;
  /**
   * After an artist pick, the field shows the catalogue name and the dropdown
   * stays shut. The list is that name, not the spelling that was typed.
   */
  artistLock?: string | null;
  genres?: SearchNlDict['genres'];
  communes?: readonly string[];
  lieux?: SearchNlDict['lieux'];
  suggest?: readonly SearchSuggestEntry[];
  placeholder?: string;
};

function isSearchCommitKey(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.key === 'Enter' && !e.repeat && !e.nativeEvent.isComposing;
}

const KIND_LABEL = { titre: 'Titre', artiste: 'Artiste', salle: 'Salle' } as const;

export default function SearchOmnibox({
  value,
  onChange,
  onSubmit,
  onBareQuery,
  onConfirm,
  onPickTitre,
  onPickArtiste,
  onPickSalle,
  venueLock = null,
  artistLock = null,
  genres = [],
  communes = [],
  lieux = [],
  suggest = [],
  placeholder = SEARCH_PLACEHOLDER,
}: Props) {
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [settled, setSettled] = useState('');
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const trimmed = value.trim();
  const dict = useMemo<SearchNlDict>(
    () => ({ genres, communes, lieux }),
    [genres, communes, lieux],
  );

  useEffect(() => {
    if (trimmed.length < SEARCH_NL_MIN_CHARS) {
      setSettled('');
      return;
    }
    const id = window.setTimeout(() => setSettled(trimmed), SEARCH_NL_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [trimmed]);

  const ready = trimmed.length >= SEARCH_NL_MIN_CHARS && settled === trimmed;
  const parsed = useMemo(
    () => (ready ? parseSearchNl(settled, dict) : null),
    [ready, settled, dict],
  );
  const chips = useMemo(
    () => (parsed ? previewChips(parsed, dict) : []),
    [parsed, dict],
  );
  const locked =
    (Boolean(venueLock) &&
      normalizeSearch(trimmed) === normalizeSearch(venueLock || '')) ||
    (Boolean(artistLock) &&
      normalizeSearch(trimmed) === normalizeSearch(artistLock || ''));
  const titleSource = useMemo(
    () => suggest.filter((entry) => entry.kind === 'titre'),
    [suggest],
  );
  const titleHits = useMemo(() => {
    if (!ready || chips.length > 0 || locked) return [];
    return suggestLocal(titleSource, settled);
  }, [ready, chips.length, locked, titleSource, settled]);
  const artistHits = useMemo(() => {
    if (!ready || chips.length > 0 || locked) return [];
    return suggestArtistes(suggest, settled);
  }, [ready, chips.length, locked, suggest, settled]);
  const salleHits = useMemo(() => {
    if (!ready || chips.length > 0 || locked) return [];
    return suggestSalles(lieux, settled);
  }, [ready, chips.length, locked, lieux, settled]);
  const hits = useMemo(
    () => [...salleHits, ...artistHits, ...titleHits],
    [salleHits, artistHits, titleHits],
  );
  const namesVenue =
    ready && chips.length === 0 && queryNamesKnownLieu(settled, lieux);
  const mode = locked
    ? 'closed'
    : searchNlMode({
        query: trimmed,
        settled: ready,
        chipCount: chips.length,
        hitCount: hits.length,
        dismissed: dismissedFor === trimmed,
      });
  const open = mode !== 'closed';

  useEffect(() => {
    if (locked) return;
    if (!ready || chips.length > 0) return;
    // Title or artist hits keep the catalogue dropdown (Enter opens the row).
    // A venue name still filters underneath, and stays in the dropdown
    // so the salle can be chosen beside any matching titles.
    if (!namesVenue && (titleHits.length > 0 || artistHits.length > 0)) return;
    onBareQuery?.(trimmed);
  }, [
    locked,
    ready,
    chips.length,
    namesVenue,
    titleHits.length,
    artistHits.length,
    trimmed,
    onBareQuery,
  ]);

  useEffect(() => {
    setActive(0);
  }, [settled, mode]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewTop = vv?.offsetTop ?? 0;
      const viewHeight = vv?.height ?? window.innerHeight;
      const available = viewTop + viewHeight - rect.bottom - 8;
      setMaxHeight(Math.max(48, Math.floor(available)));
    };
    place();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [open, chips.length, hits.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      setDismissedFor(trimmed);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, trimmed]);

  function dismiss() {
    setDismissedFor(trimmed);
  }

  function confirm() {
    if (!parsed || chips.length === 0) return;
    onConfirm?.(parsed);
    setDismissedFor(trimmed);
  }

  function activateHit(index: number) {
    const hit = hits[index];
    if (!hit) return;
    if (hit.kind === 'salle') onPickSalle?.(hit.id, hit.label);
    else if (hit.kind === 'titre') onPickTitre?.(hit.id);
    else onPickArtiste?.(hit.id);
    setDismissedFor(trimmed);
  }

  function commitBare() {
    onSubmit?.(value);
  }

  function emitDraft(next: string) {
    onChange(next);
  }

  function clearDraft(e: SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    emitDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (!open) return;
      e.preventDefault();
      dismiss();
      return;
    }
    if (mode === 'catalogue' && hits.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((i) => {
        if (e.key === 'ArrowDown') return Math.min(hits.length - 1, i + 1);
        return Math.max(0, i - 1);
      });
      return;
    }
    if (!isSearchCommitKey(e)) return;
    e.preventDefault();
    if (mode === 'chips') {
      confirm();
      return;
    }
    if (mode === 'catalogue' && hits.length > 0) {
      activateHit(active);
      return;
    }
    commitBare();
  }

  function onFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === 'chips') {
      confirm();
      return;
    }
    if (mode === 'catalogue' && hits.length > 0) {
      activateHit(active);
      return;
    }
    commitBare();
  }

  function keepFocus(e: SyntheticEvent) {
    e.preventDefault();
  }

  const stripStyle = maxHeight ? { maxHeight } : undefined;

  return (
    <form
      ref={rootRef}
      role="search"
      className="relative w-full"
      onSubmit={onFormSubmit}
    >
      <label htmlFor="cc-search" className="sr-only">
        {placeholder}
      </label>
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted"
      >
        ⌕
      </span>
      <input
        ref={inputRef}
        id="cc-search"
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => emitDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={open}
        aria-controls={open ? 'cc-search-nl' : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          mode === 'catalogue' && hits[active] ? `cc-suggest-${active}` : undefined
        }
        autoComplete="off"
        enterKeyHint="search"
        className={
          'h-10 w-full rounded-full border border-planc-controle bg-culture-surface py-0 pl-9 text-sm text-culture-ink shadow-sm placeholder:truncate placeholder:text-culture-muted/70 focus:border-culture-terracotta focus:outline-none focus:ring-2 focus:ring-culture-terracotta/30 ' +
          (value ? 'pr-[4.5rem]' : 'pr-11')
        }
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        {value ? (
          <button
            type="button"
            onPointerDown={clearDraft}
            onMouseDown={clearDraft}
            onClick={clearDraft}
            className="grid h-8 w-8 place-items-center text-base leading-none text-culture-muted hover:text-culture-terracotta"
            aria-label="Effacer la recherche"
          >
            ×
          </button>
        ) : null}
        <button
          type="submit"
          className="grid h-8 w-8 place-items-center rounded-full text-base font-medium leading-none text-culture-terracotta hover:bg-planc-nuit"
          aria-label="Rechercher"
        >
          ↵
        </button>
      </div>

      {mode === 'chips' && parsed ? (
        <div
          id="cc-search-nl"
          role="region"
          aria-label="Filtres déduits"
          style={stripStyle}
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-y-auto rounded-xl border border-culture-terracotta/10 bg-culture-cream p-2 shadow-card"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-9 min-h-9 items-center rounded-full border border-culture-line bg-culture-surface px-2.5 text-sm text-culture-ink"
              >
                {chip.label}
              </span>
            ))}
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={() => inputRef.current?.focus()}
                className="inline-flex h-9 items-center px-2 text-sm text-culture-muted"
              >
                Modifier
              </button>
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={dismiss}
                className="inline-flex h-9 items-center px-2 text-sm text-culture-muted"
              >
                Annuler
              </button>
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={confirm}
                className="inline-flex h-9 items-center rounded-full bg-culture-terracotta px-3 text-sm font-medium text-planc-nuit focus:outline-none focus:ring-2 focus:ring-culture-terracotta"
              >
                Confirmer
              </button>
            </span>
          </div>
          {parsed.titleQuery ? (
            <p className="mt-1 px-0.5 text-xs text-culture-muted">
              + titre : {parsed.titleQuery}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'hint' ? (
        <div
          id="cc-search-nl"
          role="status"
          style={stripStyle}
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-y-auto rounded-xl border border-culture-terracotta/10 bg-culture-cream px-3 py-2.5 text-sm text-culture-muted shadow-card"
        >
          {SEARCH_NL_HINT}
        </div>
      ) : null}

      {mode === 'catalogue' ? (
        <ul
          id="cc-search-nl"
          role="listbox"
          aria-label="Suggestions"
          style={stripStyle}
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-y-auto rounded-xl border border-culture-terracotta/10 bg-culture-cream py-1 shadow-card"
        >
          {hits.map((hit, index) => (
            <li key={`${hit.kind}:${hit.id}:${index}`}>
              <button
                type="button"
                id={`cc-suggest-${index}`}
                role="option"
                data-suggest-kind={hit.kind}
                aria-selected={index === active}
                onPointerDown={keepFocus}
                onClick={() => activateHit(index)}
                className={
                  'flex min-h-11 w-full items-center gap-2 px-3 text-left ' +
                  (index === active
                    ? 'bg-culture-terracotta/5'
                    : 'hover:bg-culture-terracotta/5')
                }
              >
                <span className="w-14 shrink-0 text-[11px] text-culture-muted">
                  {KIND_LABEL[hit.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-culture-ink">
                    {highlightLabel(hit.label, settled).map((part, i) =>
                      part.bold ? (
                        <strong key={i} className="font-semibold">
                          {part.text}
                        </strong>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </span>
                  {hit.sub ? (
                    <span className="block truncate text-xs text-culture-muted">
                      {hit.sub}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
