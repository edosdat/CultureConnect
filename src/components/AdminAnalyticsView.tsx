import type { ReactNode } from 'react';
import type { AdminAnalyticsSnapshot } from '@/lib/adminAnalyticsLoad';
import AdminDataTables from '@/components/AdminDataTables';
import { adminCsvFilename, loginPopulationShare } from '@/lib/adminAnalytics';
import {
  COMPTE_VS_INVITE_GLOSSARY,
  KPI_COPY,
  SECTION_COPY,
  signalKindLabel,
} from '@/lib/adminAnalyticsCopy';

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function pct(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((100 * part) / total)} %`;
}

/**
 * Lower bound, not exact.
 * KPI 1–2, 10, 16: guest KV SCAN / FIFO.
 * KPI 21: Neon proxy (signalsRecent cap 40, no last_seen).
 */
export const APPROX_MINORANT_LABEL = 'approx. / minorant';

function ApproxBadge() {
  return (
    <span className="ml-1.5 inline-block rounded-full bg-culture-cream px-1.5 py-0.5 align-middle text-[10px] font-medium normal-case tracking-normal text-culture-muted">
      {APPROX_MINORANT_LABEL}
    </span>
  );
}

function Card({
  kpi,
  value,
  approx,
  children,
}: {
  kpi: string;
  value?: string;
  approx?: boolean;
  children?: ReactNode;
}) {
  const copy = KPI_COPY[kpi];
  const title = copy?.title ?? `KPI ${kpi}`;
  return (
    <section className="rounded-2xl border border-culture-line bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
        KPI {kpi} · {title}
        {approx ? <ApproxBadge /> : null}
      </p>
      {value != null ? (
        <p className="mt-1 font-display text-2xl text-culture-ink">{value}</p>
      ) : null}
      {copy?.glossary ? (
        <p className="mt-1 text-xs text-culture-muted">{copy.glossary}</p>
      ) : null}
      {copy?.hint ? (
        <p className="mt-1 text-xs font-medium text-culture-ink">{copy.hint}</p>
      ) : null}
      {children}
    </section>
  );
}

function SectionBlock({
  title,
  intro,
  boxed,
  children,
}: {
  title: string;
  intro?: string;
  boxed?: boolean;
  children: ReactNode;
}) {
  const heading = (
    <>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
        {title}
      </h2>
      {intro ? <p className="mt-1 text-xs text-culture-muted">{intro}</p> : null}
    </>
  );
  if (boxed) {
    return (
      <section className="mt-8 rounded-2xl border border-culture-line bg-culture-surface px-4 py-4">
        {heading}
        {children}
      </section>
    );
  }
  return (
    <section className="mt-8">
      {heading}
      {children}
    </section>
  );
}

function shareCount(count: number, percent: number | null): string {
  if (percent == null) return fmt(count);
  return `${fmt(count)} · ${percent} %`;
}

/** KPI 1 uniques + Actifs 7 jours, shown side by side. Not a vid↔email join. */
function LoginShareCard({
  guests,
  connected,
}: {
  guests: number;
  connected: number | null;
}) {
  const share = loginPopulationShare(guests, connected);
  const unread = share.connected == null || share.guestPct == null || share.connectedPct == null;
  const bothZero = !unread && share.total === 0;
  return (
    <Card kpi="20" value={bothZero ? '0 / 0 (0 %)' : unread ? '—' : undefined}>
      <ul className="mt-2 space-y-1.5 text-sm text-culture-ink">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-culture-muted" aria-hidden />
            Non connectés
          </span>
          <span>{shareCount(share.guests, share.guestPct)}</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-culture-terracotta" aria-hidden />
            Connectés
          </span>
          <span>{unread ? '—' : shareCount(share.connected ?? 0, share.connectedPct)}</span>
        </li>
      </ul>
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-culture-line"
        aria-hidden
      >
        {unread || bothZero ? null : (
          <>
            <div className="h-full bg-culture-muted" style={{ width: `${share.guestPct}%` }} />
            <div
              className="h-full bg-culture-terracotta"
              style={{ width: `${share.connectedPct}%` }}
            />
          </>
        )}
      </div>
    </Card>
  );
}

export default function AdminAnalyticsView({
  snap,
}: {
  snap: AdminAnalyticsSnapshot;
}) {
  const from = snap.windowDays[0];
  const to = snap.windowDays[snap.windowDays.length - 1];
  const mixTotal = snap.mix.total;
  const tastesCsvName = adminCsvFilename(
    'tastes',
    to ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
        Admin · HOLD · first-party
      </p>
      <h1 className="mt-1 font-display text-3xl text-culture-ink">
        Analytics 7 jours
      </h1>
      <p className="mt-2 text-sm text-culture-muted">
        Fenêtre Paris {from} → {to}. Neon {snap.sources.neon ? 'ok' : 'off'} · KV{' '}
        {snap.sources.kv ? 'ok' : 'off'}. 0 GA / PostHog.
      </p>

      <SectionBlock title={SECTION_COPY.trafic.title} intro={SECTION_COPY.trafic.intro}>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Card kpi="1" value={fmt(snap.traffic.distinct7j)} approx>
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.traffic.perDay.map((d) => (
                <li key={d.day} className="flex justify-between gap-3">
                  <span className="text-culture-muted">{d.day}</span>
                  <span>{fmt(d.uniques)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            kpi="2"
            value={`${fmt(snap.traffic.returners)} · ${pct(snap.traffic.returners, snap.traffic.distinct7j)}`}
            approx
          >
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.traffic.perDay.map((d) => (
                <li key={d.day} className="flex justify-between gap-3">
                  <span className="text-culture-muted">{d.day}</span>
                  <span>{fmt(d.returns)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </SectionBlock>

      <SectionBlock title={SECTION_COPY.funnel.title}>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Card kpi="3" value={fmt(snap.funnel.openCard)} />
          <Card kpi="4" value={fmt(snap.funnel.outboundClick)} />
        </div>
      </SectionBlock>
      <SectionBlock
        title={SECTION_COPY.impressions.title}
        intro={SECTION_COPY.impressions.intro}
      >
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Card
            kpi="p2-form"
            value={`${fmt(snap.impressions.totals.impressionSlots)} slots · ${fmt(snap.impressions.totals.openings)} ouv.`}
            approx
          >
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.impressions.byForm.map((row) => (
                <li key={row.form} className="flex justify-between gap-3">
                  <span className="text-culture-muted">
                    {row.form === 'theatre_danse'
                      ? 'théâtre'
                      : row.form === 'cinema'
                        ? 'ciné'
                        : row.form}
                  </span>
                  <span>
                    {pct(row.openings, row.impressions)} · {fmt(row.openings)}/
                    {fmt(row.impressions)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            kpi="p2-action"
            value={`${fmt(snap.impressions.totals.actions)} act. / ${fmt(snap.impressions.totals.openings)} ouv.`}
            approx
          >
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.impressions.byForm.map((row) => (
                <li key={`act-${row.form}`} className="flex justify-between gap-3">
                  <span className="text-culture-muted">
                    {row.form === 'theatre_danse'
                      ? 'théâtre'
                      : row.form === 'cinema'
                        ? 'ciné'
                        : row.form}
                  </span>
                  <span>
                    {pct(row.actions, row.openings)} · {fmt(row.actions)}/
                    {fmt(row.openings)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card kpi="p2-pos" approx>
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.impressions.byPosition.map((row) => (
                <li key={row.position} className="flex justify-between gap-3">
                  <span className="text-culture-muted">rang {row.position}</span>
                  <span>
                    {pct(row.openings, row.impressions)} · {fmt(row.openings)}/
                    {fmt(row.impressions)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card
            kpi="p2-zero"
            value={fmt(snap.impressions.zeroOpenHeavy.length)}
            approx
          >
            {snap.impressions.zeroOpenHeavy.length > 0 ? (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-sm text-culture-ink">
                {snap.impressions.zeroOpenHeavy.slice(0, 20).map((row) => (
                  <li key={row.itemKey} className="flex justify-between gap-3">
                    <span className="truncate text-culture-muted">{row.itemKey}</span>
                    <span>{fmt(row.impressions)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-culture-muted">Aucun item dans ce cas.</p>
            )}
          </Card>
        </div>
      </SectionBlock>


      <SectionBlock title={SECTION_COPY.partage.title}>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Card kpi="5" value={fmt(snap.share.tokensCreated)} />
          <Card
            kpi="6"
            value={`${fmt(snap.share.opensMean)} moy · ${fmt(snap.share.opensMedian)} méd.`}
          />
          <Card
            kpi="7"
            value={`${fmt(snap.share.envie)} Envie · ${fmt(snap.share.going)} J’y vais`}
          />
          <Card kpi="8" value={fmt(snap.share.distinctSharers)} />
        </div>
      </SectionBlock>

      <SectionBlock title={SECTION_COPY.compte.title} intro={SECTION_COPY.compte.intro}>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Card
              kpi="9"
              value={snap.compte.googleAccounts == null ? '—' : fmt(snap.compte.googleAccounts)}
            />
          </div>
          <Card
            kpi="19"
            value={snap.compte.active7d == null ? '—' : fmt(snap.compte.active7d)}
          />
          <Card
            kpi="21"
            approx
            value={snap.compte.returning7d == null ? '—' : fmt(snap.compte.returning7d)}
          >
            {snap.compte.returning7d != null &&
            snap.compte.active7d != null &&
            snap.compte.active7d > 0 ? (
              <p className="mt-1 text-xs text-culture-muted">
                {pct(snap.compte.returning7d, snap.compte.active7d)} des actifs 7 jours
              </p>
            ) : null}
          </Card>
          <div className="sm:col-span-2">
            <LoginShareCard
              guests={snap.traffic.distinct7j}
              connected={snap.compte.active7d}
            />
          </div>
          <Card kpi="10" value={fmt(snap.compte.guestAppends)} approx />
        </div>
        <dl className="mt-3 space-y-1 text-xs text-culture-muted">
          {COMPTE_VS_INVITE_GLOSSARY.map((row) => (
            <div key={row.term} className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-culture-ink">{row.term}</dt>
              <dd>{row.def}</dd>
            </div>
          ))}
        </dl>
      </SectionBlock>

      <SectionBlock title={SECTION_COPY.mix.title}>
        <div className="mt-2 grid gap-3">
          <Card kpi="11">
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              <li className="flex justify-between gap-3">
                <span>Cinéma</span>
                <span>
                  {fmt(snap.mix.cinema)} · {pct(snap.mix.cinema, mixTotal)}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Théâtre</span>
                <span>
                  {fmt(snap.mix.theatre)} · {pct(snap.mix.theatre, mixTotal)}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Musique</span>
                <span>
                  {fmt(snap.mix.musique)} · {pct(snap.mix.musique, mixTotal)}
                </span>
              </li>
              <li className="flex justify-between gap-3 text-culture-muted">
                <span>Autre / inconnu</span>
                <span>
                  {fmt(snap.mix.other)} · {pct(snap.mix.other, mixTotal)}
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </SectionBlock>

      <SectionBlock title={SECTION_COPY.activite.title}>
        <div className="mt-2 grid gap-3">
          <Card kpi="16" approx>
            {snap.gouts.guestByKind.length === 0 ? (
              <p className="mt-2 text-sm text-culture-muted">
                Aucune action visiteur pour l’instant — 0 est normal.
              </p>
            ) : (
              <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
                {snap.gouts.guestByKind.map((k) => (
                  <li key={k.kind} className="flex justify-between gap-3">
                    <span>{signalKindLabel(k.kind)}</span>
                    <span className="text-culture-muted">{fmt(k.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </SectionBlock>

      <SectionBlock
        title={SECTION_COPY.goutsComptes.title}
        intro={SECTION_COPY.goutsComptes.intro}
        boxed
      >
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Card
            kpi="12"
            value={`${fmt(snap.gouts.withTastes)} / ${fmt(snap.gouts.withoutTastes)}`}
          />
          <Card kpi="13">
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {(['0', '1-5', '6-15', '15+'] as const).map((b) => (
                <li key={b} className="flex justify-between gap-3">
                  <span className="text-culture-muted">{b}</span>
                  <span>{fmt(snap.gouts.tagDistribution[b])}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card kpi="17" value={fmt(snap.gouts.matchable)} />
          <Card kpi="18" value={`${fmt(snap.export18.rows)} profils`}>
            <p className="mt-3">
              {/* CSV attachment — not in-app navigation */}
              <a
                href="/admin/analytics/export"
                download={tastesCsvName}
                className="inline-block rounded-full bg-culture-terracotta px-3 py-1.5 text-sm font-semibold text-white hover:bg-culture-clay"
              >
                Télécharger CSV interne
              </a>
            </p>
          </Card>
        </div>
      </SectionBlock>

      <AdminDataTables
        tables={snap.adminTables}
        windowDays7={snap.windowDays}
      />

      <SectionBlock
        title={SECTION_COPY.tagsCatalogue.title}
        intro={SECTION_COPY.tagsCatalogue.intro}
        boxed
      >
        <div className="mt-2 grid gap-3">
          <Card
            kpi="14"
            value={`${fmt(snap.gouts.catalogueCoveragePct)} %`}
          />
          <Card kpi="15">
            {snap.gouts.topTagsToulouse.length === 0 ? (
              <p className="mt-2 text-sm text-culture-muted">
                Aucun tag utile sur le catalogue Toulouse — 0 est normal.
              </p>
            ) : (
              <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
                {snap.gouts.topTagsToulouse.map((t) => (
                  <li key={t.tag} className="flex justify-between gap-3">
                    <span>{t.tag}</span>
                    <span className="text-culture-muted">{fmt(t.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </SectionBlock>

      {snap.notes.length > 0 ? (
        <div className="mt-8 space-y-1 text-xs text-culture-muted">
          {snap.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-culture-muted">
        RGPD : page admin privée. Tables hash only. 0 e-mail clair, 0 prénom,
        0 identifiant visiteur. Exports CSV allowlist. Merge bloqué — QA
        Connexion + revue RGPD.
      </p>
    </main>
  );
}
