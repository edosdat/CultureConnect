'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { deepLinkUrl } from '@/lib/displayHome';
import { entryWeight, type AccountTasteState } from '@/lib/signals';
import {
  FADERS,
  MIX_PRESETS,
  NEUTRAL_PROFILE,
  crossfaderCaption,
  mixList,
  mixTarget,
  presetVector,
  profileFromMoodWeights,
  rankMix,
  snapFader,
  vectorFromMoods,
  plansTitle,
  type MixFilter,
  type MixPresetKey,
  type MixVector,
} from '@/lib/mixFaders';
import { mixMeta, type MixPlanWire } from '@/lib/mixWeek';

const TRACK_H = 128;
const KNOB_H = 18;

const FILTERS: ReadonlyArray<{ key: MixFilter; label: string }> = [
  { key: 'tout', label: 'Tout' },
  { key: 'vivant', label: 'Vivant' },
  { key: 'musique', label: 'Musique' },
  { key: 'cine', label: 'Ciné' },
];

function profileOf(state: AccountTasteState | null | undefined): MixVector {
  if (!state) return NEUTRAL_PROFILE;
  const weights: Record<string, number> = {};
  for (const [mood, entry] of Object.entries(state.profile?.moods ?? {})) {
    weights[mood] = entryWeight(entry);
  }
  return profileFromMoodWeights(weights) ?? NEUTRAL_PROFILE;
}

function valueFromPointer(el: HTMLElement, clientY: number): number {
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const ratio = (clientY - rect.top) / rect.height;
  return snapFader(1 - Math.min(1, Math.max(0, ratio)));
}

function Chip({
  on,
  label,
  onClick,
  className,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        className +
        ' shrink-0 rounded-full border font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-planc-rose ' +
        (on
          ? 'border-planc-creme bg-planc-creme text-planc-nuit'
          : 'border-planc-ligne bg-transparent text-planc-creme')
      }
    >
      {label}
    </button>
  );
}

export default function MixScreen() {
  const { data: session, status } = useSession();
  const profile = useMemo(
    () =>
      status === 'authenticated'
        ? profileOf(session?.user?.tasteState)
        : NEUTRAL_PROFILE,
    [status, session?.user?.tasteState],
  );

  const [faders, setFaders] = useState<MixVector>(NEUTRAL_PROFILE);
  const [preset, setPreset] = useState<MixPresetKey | null>('mix');
  const [xf, setXf] = useState(70);
  const [filter, setFilter] = useState<MixFilter>('tout');
  const [plans, setPlans] = useState<MixPlanWire[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const presetRef = useRef(preset);
  presetRef.current = preset;
  const dragged = useRef(false);
  const dragIndex = useRef<number | null>(null);
  const raf = useRef(0);
  const live = useRef<MixVector>(NEUTRAL_PROFILE);

  useEffect(() => {
    if (status === 'loading' || dragged.current) return;
    if (presetRef.current === 'mix') {
      live.current = profile;
      setFaders(profile);
    }
  }, [status, profile]);

  useEffect(() => {
    let cancel = false;
    fetch('/api/agenda?scope=semaine&mix=1')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ items?: MixPlanWire[] }>;
      })
      .then((data) => {
        if (cancel) return;
        setPlans(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancel) setLoadError(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  function commitFaders(next: MixVector) {
    live.current = next;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setFaders(live.current);
    });
  }

  function nudgeFader(index: number, delta: number) {
    dragged.current = true;
    setPreset(null);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    setFaders((current) => {
      const next = current.slice() as MixVector;
      next[index] = snapFader(current[index] + delta);
      live.current = next;
      return next;
    });
  }

  function onPointerDown(index: number, event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndex.current = index;
    dragged.current = true;
    setPreset(null);
    const next = live.current.slice() as MixVector;
    next[index] = valueFromPointer(event.currentTarget, event.clientY);
    commitFaders(next);
  }

  function onPointerMove(index: number, event: ReactPointerEvent<HTMLDivElement>) {
    if (dragIndex.current !== index) return;
    const next = live.current.slice() as MixVector;
    next[index] = valueFromPointer(event.currentTarget, event.clientY);
    commitFaders(next);
  }

  function endDrag(index: number) {
    if (dragIndex.current === index) dragIndex.current = null;
  }

  const listFaders = useDeferredValue(faders);
  const listXf = useDeferredValue(xf);
  const caption = crossfaderCaption(xf);

  const view = useMemo(() => {
    const target = mixTarget(profile, listFaders, listXf);
    const byKey = new Map(plans?.map((plan) => [plan.key, plan]) ?? []);
    const ranked = rankMix(
      (plans ?? []).map((plan) => ({
        id: plan.key,
        vector: vectorFromMoods(plan.moods, plan.confiance),
        bucket: plan.bucket,
      })),
      target,
      filter,
    );
    const list = mixList(ranked);
    return {
      weak: list.weak,
      rows: list.top.map((row) => ({
        plan: byKey.get(row.id)!,
        score: row.score,
        fader: row.fader,
      })),
    };
  }, [plans, profile, listFaders, listXf, filter]);

  const titleCount = view.weak ? 0 : view.rows.length;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-planc-nuit text-planc-creme">
      <header className="flex shrink-0 items-center gap-2.5 px-4 pt-3.5">
        <Link
          href="/"
          aria-label="Retour"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-planc-velours text-planc-creme focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-planc-rose"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="11 6 5 12 11 18" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1
            className="m-0 font-[family-name:var(--font-mix-title)] text-[24px] font-[800] leading-[1.05] text-planc-creme"
          >
            Ton <span className="italic text-planc-rose">mix</span> de ce soir
          </h1>
          <p className="m-0 text-[13px] text-planc-muted">
            Pousse ce qui te tente, baisse le reste.
          </p>
        </div>
      </header>

      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MIX_PRESETS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            on={preset === item.key}
            onClick={() => {
              if (raf.current) cancelAnimationFrame(raf.current);
              raf.current = 0;
              const next = presetVector(item.key, profile);
              live.current = next;
              setPreset(item.key);
              setFaders(next);
            }}
            className="h-[34px] px-3 text-[13px]"
          />
        ))}
      </div>

      <div className="mx-4 mt-3 shrink-0 rounded-[20px] border border-planc-ligne bg-planc-velours px-2 pb-2.5 pt-3">
        <div className="grid grid-cols-5 gap-1">
          {FADERS.map((fader, index) => {
            const value = faders[index] ?? 0;
            const pct = Math.round(value * 100);
            return (
              <div key={fader.id} className="flex min-w-0 flex-col items-center gap-1.5">
                <span className="text-[13px] font-bold" style={{ color: fader.color }}>
                  {pct}
                </span>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={fader.label}
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-valuetext={`${pct} %`}
                  className="relative h-32 w-full min-w-[44px] max-w-12 touch-none select-none focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-planc-creme"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(event) => onPointerDown(index, event)}
                  onPointerMove={(event) => onPointerMove(index, event)}
                  onPointerUp={() => endDrag(index)}
                  onPointerCancel={() => endDrag(index)}
                  onLostPointerCapture={() => endDrag(index)}
                  onKeyDown={(event) => {
                    const delta =
                      event.key === 'ArrowUp' || event.key === 'ArrowRight'
                        ? 0.1
                        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
                          ? -0.1
                          : 0;
                    if (!delta) return;
                    event.preventDefault();
                    nudgeFader(index, delta);
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-1/2 top-0 w-1.5 -translate-x-1/2 rounded-full bg-planc-sable"
                  />
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full"
                    style={{ height: Math.round(value * TRACK_H), background: fader.color }}
                  />
                  <span
                    aria-hidden
                    className="absolute left-1/2 h-0.5 w-8 -translate-x-1/2 bg-planc-muted opacity-75"
                    style={{ bottom: Math.round(profile[index]! * (TRACK_H - 2)) }}
                  />
                  <span
                    aria-hidden
                    className="absolute left-1/2 w-9 -translate-x-1/2 rounded-md border-[3px] bg-planc-creme shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
                    style={{
                      height: KNOB_H,
                      bottom: Math.round(value * (TRACK_H - KNOB_H)),
                      borderColor: fader.color,
                    }}
                  />
                </div>
                <span className="text-center text-[12px] font-bold leading-tight">
                  {fader.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-planc-muted">
          <span className="inline-block h-0.5 w-4 bg-planc-muted" aria-hidden />
          ton type
        </p>
      </div>

      <div className="mx-4 mt-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-[12px] font-bold text-planc-muted">Mon type</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={xf}
            aria-label="Dosage entre ton type et ton envie de ce soir"
            aria-valuetext={caption}
            onChange={(event) => setXf(Number(event.target.value))}
            className="h-11 min-w-0 flex-1 accent-planc-rose"
          />
          <span className="shrink-0 text-[12px] font-bold text-planc-muted">Ce soir</span>
        </div>
        <p className="text-center text-[12px] text-planc-muted">{caption}</p>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1.5 pt-2.5">
        <h2 className="m-0 whitespace-nowrap font-display text-[18px] font-bold">
          {plansTitle(titleCount)}
        </h2>
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              on={filter === item.key}
              onClick={() => setFilter(item.key)}
              className="h-[30px] px-[9px] text-[12px]"
            />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {loadError ? (
          <p className="px-2 py-8 text-center text-sm text-planc-muted">
            Les plans de la semaine n’ont pas pu être chargés.
          </p>
        ) : plans == null ? (
          <p className="px-2 py-8 text-center text-sm text-planc-muted">
            Les plans de la semaine arrivent.
          </p>
        ) : view.weak ? (
          <p className="px-2 py-8 text-center text-sm text-planc-muted">
            Peu de plans pour ce mix cette semaine. Essaie un autre réglage.
          </p>
        ) : (
          view.rows.map(({ plan, score, fader }) => {
            const color = FADERS[fader]?.color ?? '#FF9E6D';
            return (
              <a
                key={plan.key}
                href={deepLinkUrl('', plan.key)}
                className="flex items-center gap-3 rounded-[14px] bg-planc-velours p-1.5 text-planc-creme no-underline"
              >
                {plan.image ? (
                  <img
                    src={plan.image}
                    alt=""
                    className="h-[58px] w-11 shrink-0 rounded-[9px] object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="h-[58px] w-11 shrink-0 rounded-[9px]"
                    style={{
                      background: `linear-gradient(180deg, ${color} 0%, #3A1840 78%)`,
                    }}
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold">{plan.title}</span>
                  <span className="truncate text-[12px] text-planc-muted">{mixMeta(plan)}</span>
                  <span
                    className="mt-0.5 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-bold text-planc-nuit"
                    style={{ background: color }}
                  >
                    {FADERS[fader]?.label}
                  </span>
                </span>
                <span className="shrink-0 pr-1 text-[15px] font-bold">
                  {Math.round(score * 100)} %
                </span>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
