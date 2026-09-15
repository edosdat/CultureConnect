import type { ReactNode } from 'react';
import type { AdminAnalyticsSnapshot } from '@/lib/adminAnalyticsLoad';

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

/** Mesure: guest KV SCAN / FIFO — lower bound, not exact. KPI 1–2, 10, 16. */
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
  title,
  value,
  hint,
  approx,
  children,
}: {
  kpi: string;
  title: string;
  value?: string;
  hint?: string;
  approx?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-culture-line bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
        KPI {kpi} · {title}
        {approx ? <ApproxBadge /> : null}
      </p>
      {value != null ? (
        <p className="mt-1 font-display text-2xl text-culture-ink">{value}</p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-culture-muted">{hint}</p> : null}
      {children}
    </section>
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
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

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Trafic
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Card
          kpi="1"
          title="Uniques cc_vid / j"
          value={fmt(snap.traffic.distinct7j)}
          hint="Distincts sur 7j · guest signals + index journalier"
          approx
        >
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
          title="Retours (même vid j+1+)"
          value={fmt(snap.traffic.returners)}
          hint="Vids présents ≥2 jours distincts dans la fenêtre"
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

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Funnel agenda
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Card
          kpi="3"
          title="Ouvertures fiche ?e="
          value={fmt(snap.funnel.openCard)}
          hint="kind open_card · guest KV + account_tastes.signalsRecent"
        />
        <Card
          kpi="4"
          title="Clics Réserver outbound"
          value={fmt(snap.funnel.outboundClick)}
          hint="kind outbound_click (pas le pair reserve)"
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Partage
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Card
          kpi="5"
          title="Tokens créés"
          value={fmt(snap.share.tokensCreated)}
          hint="share_tokens.created_at ∈ 7j"
        />
        <Card
          kpi="6"
          title="Opens / token"
          value={`${fmt(snap.share.opensMean)} moy · ${fmt(snap.share.opensMedian)} méd.`}
          hint="Sur tokens 7j, sinon tous"
        />
        <Card
          kpi="7"
          title="Envie + Going"
          value={`${fmt(snap.share.envie)} envie · ${fmt(snap.share.going)} going`}
          hint={`${fmt(snap.share.enviePerToken)} / ${fmt(snap.share.goingPerToken)} par token · share_rsvps`}
        />
        <Card
          kpi="8"
          title="Partageurs distincts"
          value={fmt(snap.share.distinctSharers)}
          hint="sharer_email distincts, tokens 7j"
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Compte
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Card
          kpi="9"
          title="Logins Google"
          value={fmt(snap.compte.googleLogins)}
          hint="INCR KV au sign-in Auth.js — pas d’historique pré-déploiement"
        />
        <Card
          kpi="10"
          title="Signaux guest append"
          value={fmt(snap.compte.guestAppends)}
          hint="Lignes cc:vs:<vid> dans la fenêtre"
          approx
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Mix
      </h2>
      <div className="mt-2 grid gap-3">
        <Card
          kpi="11"
          title="Part ciné / théâtre / musique"
          hint="Fiches ouvertes (open_card) · lookup catalogue"
        >
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

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Goûts / matching
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Card
          kpi="12"
          title="Comptes avec / sans goûts"
          value={`${fmt(snap.gouts.withTastes)} / ${fmt(snap.gouts.withoutTastes)}`}
          hint={`${fmt(snap.gouts.accounts)} rows account_tastes · hasScorableState`}
        />
        <Card
          kpi="13"
          title="# tags / user"
          hint="moods ∪ genres > 0 · 0 themes · 0 / 1–5 / 6–15 / 15+"
        >
          <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
            {(['0', '1-5', '6-15', '15+'] as const).map((b) => (
              <li key={b} className="flex justify-between gap-3">
                <span className="text-culture-muted">{b}</span>
                <span>{fmt(snap.gouts.tagDistribution[b])}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          kpi="14"
          title="Couverture tags catalogue"
          value={`${fmt(snap.gouts.catalogueCoveragePct)} %`}
          hint={`${fmt(snap.gouts.catalogueTagged)} / ${fmt(snap.gouts.catalogueEvents)} events ≥1 tag utile (vocab fermé)`}
        />
        <Card
          kpi="17"
          title="Users matchables"
          value={fmt(snap.gouts.matchable)}
          hint="Seuil provisoire ≥5 tags (moods ∪ genres > 0, 0 themes)"
        />
      </div>

      <div className="mt-3 grid gap-3">
        <Card kpi="15" title="Top tags Toulouse" hint="Agrégat catalogue, commune = Toulouse">
          {snap.gouts.topTagsToulouse.length === 0 ? (
            <p className="mt-2 text-sm text-culture-muted">Aucun tag utile.</p>
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
        <Card
          kpi="16"
          title="Signaux guest par kind"
          hint="Fenêtre 7j · cc:vs"
          approx
        >
          {snap.gouts.guestByKind.length === 0 ? (
            <p className="mt-2 text-sm text-culture-muted">Aucun append guest.</p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-sm text-culture-ink">
              {snap.gouts.guestByKind.map((k) => (
                <li key={k.kind} className="flex justify-between gap-3">
                  <span>{k.kind}</span>
                  <span className="text-culture-muted">{fmt(k.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          kpi="18"
          title="Export CSV profils goûts"
          value={`${fmt(snap.export18.rows)} profils`}
          hint="Interne · ~30 premiers · hash email · pas de payload complet dans la page"
        >
          <p className="mt-3">
            <a
              href="/admin/analytics/export"
              className="inline-block rounded-full bg-culture-terracotta px-3 py-1.5 text-sm font-semibold text-white hover:bg-culture-clay"
            >
              Télécharger CSV interne
            </a>
          </p>
        </Card>
      </div>

      {snap.notes.length > 0 ? (
        <div className="mt-8 space-y-1 text-xs text-culture-muted">
          {snap.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-culture-muted">
        RGPD : page admin privée. Agrégats seuls. Export 18 interne. Merge
        bloqué — revue RGPD + smoke Design.
      </p>
    </main>
  );
}
