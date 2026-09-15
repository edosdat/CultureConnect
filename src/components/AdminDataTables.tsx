'use client';

import { useMemo, useState } from 'react';
import {
  ADMIN_TABLE_PAGINATE_FROM,
  ADMIN_TASTES_PAGE_SIZE,
  capJoinedList,
  displayEmailHash,
  truncateTokenUi,
  type AdminTablesPayload,
} from '@/lib/adminAnalytics';
import { SECTION_COPY } from '@/lib/adminAnalyticsCopy';

type TasteFilter = 'tous' | 'avec' | 'matchable';
type TokenWindow = '7j' | '30j' | 'all';
type RsvpFilter = 'tous' | 'envie' | 'going';
type SortDir = 'asc' | 'desc';

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function shortTs(iso: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 16);
  return iso.slice(0, 16).replace('T', ' ');
}

function CsvLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-block rounded-full bg-culture-terracotta px-3 py-1.5 text-sm font-semibold text-white hover:bg-culture-clay"
    >
      {label}
    </a>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        active
          ? 'bg-culture-terracotta text-white'
          : 'border border-culture-line bg-white text-culture-ink hover:bg-culture-cream'
      }`}
    >
      {children}
    </button>
  );
}

function SortBtn({
  label,
  col,
  current,
  dir,
  onSort,
}: {
  label: string;
  col: string;
  current: string;
  dir: SortDir;
  onSort: (col: string) => void;
}) {
  const active = current === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`whitespace-nowrap text-left font-semibold uppercase tracking-wide ${
        active ? 'text-culture-ink' : 'text-culture-muted'
      }`}
    >
      {label}
      {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

function HashFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-culture-muted">
      Filtrer par hash
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sha256[:16]"
        className="mt-1 w-full rounded-xl border border-culture-line bg-white px-3 py-1.5 font-mono text-sm text-culture-ink"
      />
    </label>
  );
}

function PageBar({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-culture-muted">
      <span>
        Page {page + 1} / {pages}
      </span>
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        className="rounded-full border border-culture-line px-2 py-0.5 disabled:opacity-40"
      >
        Précédent
      </button>
      <button
        type="button"
        disabled={page + 1 >= pages}
        onClick={() => onPage(page + 1)}
        className="rounded-full border border-culture-line px-2 py-0.5 disabled:opacity-40"
      >
        Suivant
      </button>
    </div>
  );
}

function paginate<T>(rows: T[], page: number): { slice: T[]; pages: number; page: number } {
  if (rows.length < ADMIN_TABLE_PAGINATE_FROM) {
    return { slice: rows, pages: 1, page: 0 };
  }
  const pages = Math.max(1, Math.ceil(rows.length / ADMIN_TASTES_PAGE_SIZE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const start = safe * ADMIN_TASTES_PAGE_SIZE;
  return {
    slice: rows.slice(start, start + ADMIN_TASTES_PAGE_SIZE),
    pages,
    page: safe,
  };
}

function cmp(a: string | number, b: string | number, dir: SortDir): number {
  const n =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'fr');
  return dir === 'asc' ? n : -n;
}

function hashHits(hash: string, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return hash.toLowerCase().includes(needle);
}

export default function AdminDataTables({
  tables,
  windowDays7,
}: {
  tables: AdminTablesPayload;
  windowDays7: string[];
}) {
  const days7 = useMemo(() => new Set(windowDays7), [windowDays7]);
  const days30 = useMemo(() => new Set(tables.windowDays30), [tables.windowDays30]);

  const [tasteFilter, setTasteFilter] = useState<TasteFilter>('tous');
  const [tasteHash, setTasteHash] = useState('');
  const [tasteSort, setTasteSort] = useState('updatedAt');
  const [tasteDir, setTasteDir] = useState<SortDir>('desc');
  const [tastePage, setTastePage] = useState(0);

  const [tokenWindow, setTokenWindow] = useState<TokenWindow>('all');
  const [tokenHash, setTokenHash] = useState('');
  const [tokenSort, setTokenSort] = useState('createdAt');
  const [tokenDir, setTokenDir] = useState<SortDir>('desc');
  const [tokenPage, setTokenPage] = useState(0);

  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('tous');
  const [rsvpHash, setRsvpHash] = useState('');
  const [rsvpSort, setRsvpSort] = useState('updatedAt');
  const [rsvpDir, setRsvpDir] = useState<SortDir>('desc');
  const [rsvpPage, setRsvpPage] = useState(0);

  const toggleSort = (
    col: string,
    current: string,
    dir: SortDir,
    setCol: (c: string) => void,
    setDir: (d: SortDir) => void,
    setPage: (p: number) => void,
  ) => {
    if (current === col) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setCol(col);
      setDir(col === 'emailHash' || col === 'sharerHash' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const tasteRows = useMemo(() => {
    let rows = tables.tastes.rows;
    if (tasteFilter === 'avec') rows = rows.filter((r) => r.scorable);
    if (tasteFilter === 'matchable') rows = rows.filter((r) => r.matchable);
    if (tasteHash.trim()) {
      rows = rows.filter((r) => hashHits(r.emailHash, tasteHash));
    }
    const sorted = [...rows].sort((a, b) => {
      if (tasteSort === 'emailHash') return cmp(a.emailHash, b.emailHash, tasteDir);
      if (tasteSort === 'tagCount') return cmp(a.tagCount, b.tagCount, tasteDir);
      return cmp(a.updatedAt || a.tastesSetAt, b.updatedAt || b.tastesSetAt, tasteDir);
    });
    return sorted;
  }, [tables.tastes.rows, tasteFilter, tasteHash, tasteSort, tasteDir]);

  const tokenRows = useMemo(() => {
    let rows = tables.tokens.rows;
    if (tokenWindow === '7j') {
      rows = rows.filter((r) => r.createdDay && days7.has(r.createdDay));
    } else if (tokenWindow === '30j') {
      rows = rows.filter((r) => r.createdDay && days30.has(r.createdDay));
    }
    if (tokenHash.trim()) {
      rows = rows.filter((r) => hashHits(r.sharerHash, tokenHash));
    }
    const sorted = [...rows].sort((a, b) => {
      if (tokenSort === 'sharerHash') return cmp(a.sharerHash, b.sharerHash, tokenDir);
      if (tokenSort === 'opens') return cmp(a.opens, b.opens, tokenDir);
      return cmp(a.createdAt, b.createdAt, tokenDir);
    });
    return sorted;
  }, [tables.tokens.rows, tokenWindow, tokenHash, tokenSort, tokenDir, days7, days30]);

  const rsvpRows = useMemo(() => {
    let rows = tables.rsvps.rows;
    if (rsvpFilter !== 'tous') rows = rows.filter((r) => r.kind === rsvpFilter);
    if (rsvpHash.trim()) {
      rows = rows.filter((r) => hashHits(r.emailHash, rsvpHash));
    }
    const sorted = [...rows].sort((a, b) => {
      if (rsvpSort === 'emailHash') {
        return cmp(displayEmailHash(a.emailHash), displayEmailHash(b.emailHash), rsvpDir);
      }
      if (rsvpSort === 'kind') return cmp(a.kind, b.kind, rsvpDir);
      return cmp(a.updatedAt, b.updatedAt, rsvpDir);
    });
    return sorted;
  }, [tables.rsvps.rows, rsvpFilter, rsvpHash, rsvpSort, rsvpDir]);

  const tokenTotals = useMemo(() => {
    const sharers = new Set(tokenRows.map((r) => r.sharerHash).filter(Boolean));
    return {
      count: tokenRows.length,
      opensSum: tokenRows.reduce((n, r) => n + r.opens, 0),
      distinctSharers: sharers.size,
    };
  }, [tokenRows]);

  const rsvpTotals = useMemo(() => {
    let envie = 0;
    let going = 0;
    for (const r of rsvpRows) {
      if (r.kind === 'envie') envie += 1;
      else if (r.kind === 'going') going += 1;
    }
    return { envie, going };
  }, [rsvpRows]);

  const tastePaged = paginate(tasteRows, tastePage);
  const tokenPaged = paginate(tokenRows, tokenPage);
  const rsvpPaged = paginate(rsvpRows, rsvpPage);

  return (
    <div className="mt-8 space-y-8">
      <nav className="flex flex-wrap gap-2 text-xs">
        <a href="#admin-comptes" className="text-culture-terracotta hover:underline">
          Comptes
        </a>
        <a href="#admin-liens" className="text-culture-terracotta hover:underline">
          Liens
        </a>
        <a href="#admin-reponses" className="text-culture-terracotta hover:underline">
          Réponses
        </a>
        <a href="#admin-lectures" className="text-culture-terracotta hover:underline">
          Lectures
        </a>
      </nav>

      <section
        id="admin-comptes"
        className="rounded-2xl border border-culture-line bg-white px-4 py-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          {SECTION_COPY.comptesTable.title}
        </h2>
        <p className="mt-1 text-xs text-culture-muted">
          {SECTION_COPY.comptesTable.intro}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={tasteFilter === 'tous'}
              onClick={() => {
                setTasteFilter('tous');
                setTastePage(0);
              }}
            >
              Tous
            </Chip>
            <Chip
              active={tasteFilter === 'avec'}
              onClick={() => {
                setTasteFilter('avec');
                setTastePage(0);
              }}
            >
              Avec goûts
            </Chip>
            <Chip
              active={tasteFilter === 'matchable'}
              onClick={() => {
                setTasteFilter('matchable');
                setTastePage(0);
              }}
            >
              Prêts matching
            </Chip>
          </div>
          <div className="min-w-[12rem] flex-1">
            <HashFilter
              value={tasteHash}
              onChange={(v) => {
                setTasteHash(v);
                setTastePage(0);
              }}
            />
          </div>
          <CsvLink
            href="/admin/analytics/export/tastes"
            label="Télécharger CSV comptes"
          />
        </div>
        <p className="mt-2 text-xs text-culture-muted">
          {fmt(tasteRows.length)} ligne{tasteRows.length === 1 ? '' : 's'} · CSV =
          tous les comptes avec goûts
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-culture-line text-[11px]">
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Hash e-mail"
                    col="emailHash"
                    current={tasteSort}
                    dir={tasteDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tasteSort,
                        tasteDir,
                        setTasteSort,
                        setTasteDir,
                        setTastePage,
                      )
                    }
                  />
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="# tags"
                    col="tagCount"
                    current={tasteSort}
                    dir={tasteDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tasteSort,
                        tasteDir,
                        setTasteSort,
                        setTasteDir,
                        setTastePage,
                      )
                    }
                  />
                </th>
                <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-culture-muted">
                  Ambiances
                </th>
                <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-culture-muted">
                  Genres
                </th>
                <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-culture-muted">
                  Matching
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Mis à jour"
                    col="updatedAt"
                    current={tasteSort}
                    dir={tasteDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tasteSort,
                        tasteDir,
                        setTasteSort,
                        setTasteDir,
                        setTastePage,
                      )
                    }
                  />
                </th>
                <th className="py-2 text-[11px] font-semibold uppercase tracking-wide text-culture-muted">
                  Signaux
                </th>
              </tr>
            </thead>
            <tbody>
              {tastePaged.slice.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-culture-muted">
                    Aucun compte pour ce filtre — 0 est normal.
                  </td>
                </tr>
              ) : (
                tastePaged.slice.map((r) => (
                  <tr key={r.emailHash} className="border-b border-culture-line/70">
                    <td className="py-2 pr-3 font-mono text-xs">{r.emailHash}</td>
                    <td className="py-2 pr-3">{fmt(r.tagCount)}</td>
                    <td className="max-w-[10rem] py-2 pr-3 text-xs text-culture-muted">
                      {capJoinedList(r.moods) || '—'}
                    </td>
                    <td className="max-w-[10rem] py-2 pr-3 text-xs text-culture-muted">
                      {capJoinedList(r.genres) || '—'}
                    </td>
                    <td className="py-2 pr-3">{r.matchable ? 'oui' : 'non'}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-culture-muted">
                      {shortTs(r.updatedAt || r.tastesSetAt)}
                    </td>
                    <td className="py-2">{fmt(r.nSignals)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PageBar
          page={tastePaged.page}
          pages={tastePaged.pages}
          onPage={setTastePage}
        />

        <div className="mt-5 rounded-2xl border border-culture-line bg-culture-surface px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
            Top tags comptes · # comptes / tag
          </p>
          <p className="mt-1 text-xs text-culture-muted">
            Ambiances ∪ genres des comptes — ≠ tags catalogue (plus bas).
          </p>
          {tables.tastes.topTagsUsers.length === 0 ? (
            <p className="mt-2 text-sm text-culture-muted">
              Aucun tag compte pour l’instant — 0 est normal.
            </p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {tables.tastes.topTagsUsers.map((t) => (
                <li key={t.tag} className="flex justify-between gap-3">
                  <span>{t.tag.startsWith('g:') ? t.tag.slice(2) : t.tag}</span>
                  <span className="text-culture-muted">{fmt(t.userCount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        id="admin-liens"
        className="rounded-2xl border border-culture-line bg-white px-4 py-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          {SECTION_COPY.tokensTable.title}
        </h2>
        <p className="mt-1 text-xs text-culture-muted">
          {SECTION_COPY.tokensTable.intro}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['7j', '30j', 'all'] as const).map((w) => (
              <Chip
                key={w}
                active={tokenWindow === w}
                onClick={() => {
                  setTokenWindow(w);
                  setTokenPage(0);
                }}
              >
                {w === 'all' ? 'Tous' : w}
              </Chip>
            ))}
          </div>
          <div className="min-w-[12rem] flex-1">
            <HashFilter
              value={tokenHash}
              onChange={(v) => {
                setTokenHash(v);
                setTokenPage(0);
              }}
            />
          </div>
          <CsvLink
            href="/admin/analytics/export/tokens"
            label="Télécharger CSV liens"
          />
        </div>
        <p className="mt-2 text-xs text-culture-muted">
          {fmt(tokenTotals.count)} liens · {fmt(tokenTotals.opensSum)} lectures ·{' '}
          {fmt(tokenTotals.distinctSharers)} partageurs distincts
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-culture-line text-[11px]">
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Lien
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Item
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Séance
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Créé"
                    col="createdAt"
                    current={tokenSort}
                    dir={tokenDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tokenSort,
                        tokenDir,
                        setTokenSort,
                        setTokenDir,
                        setTokenPage,
                      )
                    }
                  />
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Hash partageur"
                    col="sharerHash"
                    current={tokenSort}
                    dir={tokenDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tokenSort,
                        tokenDir,
                        setTokenSort,
                        setTokenDir,
                        setTokenPage,
                      )
                    }
                  />
                </th>
                <th className="py-2">
                  <SortBtn
                    label="Lectures"
                    col="opens"
                    current={tokenSort}
                    dir={tokenDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        tokenSort,
                        tokenDir,
                        setTokenSort,
                        setTokenDir,
                        setTokenPage,
                      )
                    }
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {tokenPaged.slice.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-culture-muted">
                    Aucun lien pour ce filtre — 0 est normal.
                  </td>
                </tr>
              ) : (
                tokenPaged.slice.map((r) => (
                  <tr key={r.token} className="border-b border-culture-line/70">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {truncateTokenUi(r.token)}
                    </td>
                    <td className="max-w-[8rem] truncate py-2 pr-3 text-xs">
                      {r.itemKey || '—'}
                    </td>
                    <td className="max-w-[8rem] truncate py-2 pr-3 text-xs text-culture-muted">
                      {r.seanceKey || '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-culture-muted">
                      {shortTs(r.createdAt)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.sharerHash || '—'}
                    </td>
                    <td className="py-2">{fmt(r.opens)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PageBar
          page={tokenPaged.page}
          pages={tokenPaged.pages}
          onPage={setTokenPage}
        />
      </section>

      <section
        id="admin-reponses"
        className="rounded-2xl border border-culture-line bg-white px-4 py-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          {SECTION_COPY.rsvpsTable.title}
        </h2>
        <p className="mt-1 text-xs text-culture-muted">
          {SECTION_COPY.rsvpsTable.intro}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['tous', 'envie', 'going'] as const).map((k) => (
              <Chip
                key={k}
                active={rsvpFilter === k}
                onClick={() => {
                  setRsvpFilter(k);
                  setRsvpPage(0);
                }}
              >
                {k === 'tous' ? 'Tous' : k === 'envie' ? 'Envie' : 'J’y vais'}
              </Chip>
            ))}
          </div>
          <div className="min-w-[12rem] flex-1">
            <HashFilter
              value={rsvpHash}
              onChange={(v) => {
                setRsvpHash(v);
                setRsvpPage(0);
              }}
            />
          </div>
          <CsvLink
            href="/admin/analytics/export/rsvps"
            label="Télécharger CSV réponses"
          />
        </div>
        <p className="mt-2 text-xs text-culture-muted">
          {fmt(rsvpTotals.envie)} Envie · {fmt(rsvpTotals.going)} J’y vais
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-culture-line text-[11px]">
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Lien
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Hash e-mail"
                    col="emailHash"
                    current={rsvpSort}
                    dir={rsvpDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        rsvpSort,
                        rsvpDir,
                        setRsvpSort,
                        setRsvpDir,
                        setRsvpPage,
                      )
                    }
                  />
                </th>
                <th className="py-2 pr-3">
                  <SortBtn
                    label="Type"
                    col="kind"
                    current={rsvpSort}
                    dir={rsvpDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        rsvpSort,
                        rsvpDir,
                        setRsvpSort,
                        setRsvpDir,
                        setRsvpPage,
                      )
                    }
                  />
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Item
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Œuvre
                </th>
                <th className="py-2">
                  <SortBtn
                    label="Mis à jour"
                    col="updatedAt"
                    current={rsvpSort}
                    dir={rsvpDir}
                    onSort={(c) =>
                      toggleSort(
                        c,
                        rsvpSort,
                        rsvpDir,
                        setRsvpSort,
                        setRsvpDir,
                        setRsvpPage,
                      )
                    }
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {rsvpPaged.slice.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-culture-muted">
                    Aucune réponse pour ce filtre — 0 est normal.
                  </td>
                </tr>
              ) : (
                rsvpPaged.slice.map((r) => (
                  <tr
                    key={`${r.token}:${r.emailHash}`}
                    className="border-b border-culture-line/70"
                  >
                    <td className="py-2 pr-3 font-mono text-xs">
                      {truncateTokenUi(r.token)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {displayEmailHash(r.emailHash)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.kind === 'going' ? 'J’y vais' : 'Envie'}
                    </td>
                    <td className="max-w-[8rem] truncate py-2 pr-3 text-xs">
                      {r.itemKey || '—'}
                    </td>
                    <td className="max-w-[8rem] truncate py-2 pr-3 text-xs text-culture-muted">
                      {r.workId || '—'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-xs text-culture-muted">
                      {shortTs(r.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PageBar page={rsvpPaged.page} pages={rsvpPaged.pages} onPage={setRsvpPage} />
      </section>

      <section
        id="admin-lectures"
        className="rounded-2xl border border-culture-line bg-white px-4 py-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          {SECTION_COPY.visitsTable.title}
        </h2>
        <p className="mt-1 text-xs text-culture-muted">
          {SECTION_COPY.visitsTable.intro}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <ul className="space-y-0.5 text-sm text-culture-ink">
            <li className="flex justify-between gap-6">
              <span className="text-culture-muted">Liens créés (7 j)</span>
              <span>{fmt(tables.visitsAgg.window7.tokensCreated)}</span>
            </li>
            <li className="flex justify-between gap-6">
              <span className="text-culture-muted">
                Lectures cumulées des liens créés (7 j)
              </span>
              <span>{fmt(tables.visitsAgg.window7.opensSum)}</span>
            </li>
            <li className="flex justify-between gap-6">
              <span className="text-culture-muted">Liens avec au moins 1 lecture (7 j)</span>
              <span>{fmt(tables.visitsAgg.window7.tokensWithOpens)}</span>
            </li>
          </ul>
          <CsvLink
            href="/admin/analytics/export/visits"
            label="Télécharger CSV lectures"
          />
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
          Top lectures (compteur Neon)
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-culture-line text-[11px]">
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Lien
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Item
                </th>
                <th className="py-2 pr-3 font-semibold uppercase tracking-wide text-culture-muted">
                  Hash partageur
                </th>
                <th className="py-2 font-semibold uppercase tracking-wide text-culture-muted">
                  Lectures
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.visitsAgg.byTokenTop.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-culture-muted">
                    Aucune lecture agrégée — 0 est normal.
                  </td>
                </tr>
              ) : (
                tables.visitsAgg.byTokenTop.map((r) => (
                  <tr key={r.token} className="border-b border-culture-line/70">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {truncateTokenUi(r.token)}
                    </td>
                    <td className="max-w-[10rem] truncate py-2 pr-3 text-xs">
                      {r.itemKey || '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {r.sharerHash || '—'}
                    </td>
                    <td className="py-2">{fmt(r.opens)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
