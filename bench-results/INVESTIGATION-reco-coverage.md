# Investigation — why recommendations concentrate (coverage ~11.5 %)

**Status:** investigation only. No Matching C. No mass retag. No scoring rewrite.
**HOLD** product scoring changes until Manager GO.

**Sources**

- Engine: `src/lib/reco.ts` on `main` (`f5056e3`, same SHA as PR #142 base).
- Catalogue: `data/programme.csv` (12 623 rows) + `data/evenements.csv` (6 173 events).
- Bench: PR #142 `cursor/reco-bench-c82d` → `bench-results/2026-09-15-eloi25.json` (25 synthetic Eloi profiles × 4 windows, `now` pinned 2026-09-21 Paris).
- Optional dump of the 65 recommended works with own vs inherited moods: [`INVESTIGATION-reco-coverage-dump.json`](./INVESTIGATION-reco-coverage-dump.json).

Coverage in the bench is **vivant works only** (`slotFormOfItem ∈ {theatre, concert}`), union across all profiles and windows, denominator = month-window vivant stock (**400**). Ciné items (Tokyo, Chasse, Cinémathèque) **do not enter the 46/400**. They explain cine-slot monopoly, not the 11.5 % line.

---

## Verdict table

| # | Hypothesis | Verdict | One-line evidence |
|---|---|---|---|
| §1 | `itemClosedSlugs` merges 8 prog+parent sources | **Confirmed** | `reco.ts` L1035–1056 |
| §1 | Catalogue items with empty `prog.moods` inherit parent tags | **Confirmed** | 6 501 empty own moods; 1 234 inherit ≥1 parent *mood*; 3 419 inherit parent moods **or** `genres_mood` **or** themes |
| §1 | Bench 8–11 « ambiances » are a display bug | **Rejected** | Same 8/9/11 vectors come from parent `ev.moods` via `itemTasteMoods` / `itemClosedSlugs` |
| §1 | Tokyo is a tagless film that only has `fiction` | **Rejected as stated** | Winning séances (P1094/P1122) sit on umbrella **E003** and inherit **8** taste moods |
| §1 | Chasse → E002 is a bad join | **Rejected** | Brief grepped the wrong « Chasse ». Recommended item is P0179 → **E006** (Cinémathèque rentrée, 11 moods). E002 is the lake kayak programme |
| §1 | Super-items with inherited parent tags absorb reco | **Confirmed for cine** | Tokyo 25× / 9 profiles (inherit-only); Chasse 15× / 8 (own 3 + parent 11); Cinémathèque card 9× |
| §1 | Same mechanism explains vivant coverage 11.5 % | **Rejected** | All **46** recommended vivant works have **own** moods (0 inherit-only). Concentration there is 1+1+1 + no inter-profile penalty |
| §2 | IDF / `inverseMoodWeights` applies to genres | **Rejected** | Loop is `if (!CLOSED_MOODS.has(slug)) continue`. Genres get multiplier `1` |
| §2 | `fiction` (73 % cine) is enough to rank Tokyo | **Rejected** | `fiction` is **not** in `CLOSED_GENRES` → dropped from `itemClosedSlugs`. Tokyo scores on inherited moods, not fiction |
| §2 | `FICTION_NEIGHBOR_LIGHT` (0.5) is too weak on Tokyo | **Rejected** | Light applies only to the **vivant neighbor bridge** (`slot !== 'cine'`), never to the cine item itself |
| §3 | Repeat / popularity penalty across profiles | **Rejected** (absent) | Each `recommendForProfile` is independent. No salt, no seen-set, no inter-user MMR |
| §3 | `compareRank` tie-break is deterministic on item key | **Confirmed** | score desc → `dayIso` → clock → `item.key`. No `Math.random` |
| §3 | Week and month return the same #1 | **Confirmed** | 22 / 25 Eloi profiles; month pool still contains the week winner, which keeps winning |
| §4 | `vivantShare ≈ 2/3` is forced by 1+1+1 slots | **Confirmed** | 77 / 100 runs = exactly 0.667 when cine+theatre+concert all fill. A4 `angoissant` = 0.125 because living overlap is empty |
| §5 | `profileHasChipWeight` threshold is “too high” | **Rejected as a numeric bar** | Threshold is any mood/genre/theme **weight > 0**. Cats, communes, `tastesText` do **not** count |
| §5 | « 2 / 30 real profiles exploitable » | **Wrong framing** | Neon `n_total` is `account_tastes` row count. `real30` is a target name. A prior export with `n_total=2` is 2 comptes, not 2-of-30. No real30 JSON in git → 93 % cold-start claim **inconclusive** |
| §5 | Real-profile coverage 3 % (11/400) | **Inconclusive in-repo** | Consistent with running the bench on **2** profiles (2×4×~2 vivant slots → ~11 unique). Not evidence that 28 users never see personal reco |

---

## §1 — Parent tag inheritance (PRIMARY)

### 1. `itemClosedSlugs` — eight sources

```1035:1056:src/lib/reco.ts
function itemClosedSlugs(item: DayItem): string[] {
  const ev = item.evenement ?? null;
  const prog = item.kind === 'programme' ? item.programme : null;
  const raw = [
    ...splitTagSlugs(prog?.moods),
    ...splitTagSlugs(ev?.moods),
    ...splitTagSlugs(prog?.genres_mood),
    ...splitTagSlugs(ev?.genres_mood),
    ...splitTagSlugs(prog?.genre),
    ...splitTagSlugs(ev?.genre),
    ...splitTagSlugs(prog?.themes),
    ...splitTagSlugs(ev?.themes),
  ];
  // then keep unique slugs ∈ CLOSED_VOCAB (16 moods ∪ themes ∪ genres)
}
```

Join is `programme.event_id` → `evenementsById` (`src/lib/data.ts`). No confidence check, no “umbrella vs work” test, no `film_id` exception.

The bench display path (`scripts/recoBench.ts` `itemTasteMoods` on PR #142) uses **four** sources (prog+ev `moods` and `genres_mood`) filtered to the 16 taste moods. For the 8–11-mood cine cards, `genres_mood` adds no extra taste slugs — the vector **is** parent `ev.moods`. Scoring is wider: `itemClosedSlugs` also folds `genre` + `themes`.

### 2. Catalogue quantification (all programme rows)

| | rows | % of 12 623 |
|---|---:|---:|
| `prog.moods` empty | 6 501 | 51.5 % |
| empty own moods **and** parent `ev.moods` nonempty | 1 234 | 9.8 % |
| empty own moods **and** parent moods ∪ `genres_mood` ∪ themes nonempty | **3 419** | 27.1 % |
| empty own *closed* mood **and** parent closed mood | 1 280 | 10.1 % |
| cine rows (`film_id` or form cine) | 9 732 | |
| cine + empty own moods + parent moods | 1 020 | |

Own `prog.moods` cardinality (raw rows): `{0: 6501, 1: 3948, 2: 1849, 3: 200, 4: 120, 5: 5}` — the catalogue still caps at **5 own moods**. After the 8-source merge, taste-mood cardinality jumps to **8 / 9 / 11** on 941 rows:

`merged closed moods: {… 8: 423, 9: 472, 11: 46}`

Those 8+ counts are almost entirely children of three **umbrella cinema events**:

| event_id | title | child rows | distinct films | parent taste moods |
|---|---|---:|---:|---|
| E003 | Programmation Utopia Borderouge | 423 | 37 | 8 — `rigolo\|cerveau\|epique\|tendre\|festif\|critique\|leger\|intense` |
| E003b | Programmation Utopia Tournefeuille | 472 | 41 | 9 — + `angoissant\|brutal` |
| E006 | Rentrée Cinémathèque (Fritz Lang, animation…) | 46 | 36 | 11 — `intense\|leger\|epique\|rigolo\|sombre\|tendre\|intimiste\|cerveau\|brutal\|festif\|dansant` |

16 events have ≥5 distinct child titles (festivals + these season cards). **1 283** programme rows sit under such umbrellas.

The brief’s histogram (842 / 466 / 105 / 46 / 5) does not match raw programme rows nor unique works on current `main` (1 818 works: 692 / 674 / 345 / 71 / 34 / 2). Treat it as an older or filtered snapshot; the **cap-at-5 own / explode-after-merge** pattern is the same.

### 3. Traces — Tokyo and Chasse

#### Des Fleurs pour Tokyo (`film_id` F0043, 34 séances)

Two shapes of parent:

1. **Per-film event** (`ETMP_L127_…`, `UTP00xx`, …): `ev.moods = ''`, `ev.genres_mood = fiction\|drame`. Closed scoring slugs ≈ `{drame}` (`fiction` is not in `CLOSED_GENRES`).
2. **Umbrella E003** (Utopia Borderouge): empty own moods, inherit the **8** season moods + the season’s genre/theme union (~28 closed slugs).

Bench pin is Monday **2026-09-21**. The only F0043 séances in-window are:

- `P1094` 2026-09-21 **11:45** → E003
- `P1122` 2026-09-22 12:05 → E003

`workIdOf` densifies on `film_id`, but **scoring is per séance**. The E003 row wins. Bench display: 8 moods, `reasonSource: profile`, 25 hits, 9 profiles.

On 2026-09-21, among cine séances that carry `rigolo` (own or inherited), **Tokyo 11:45 is the earliest**. For a single-mood `rigolo` profile the overlap score ties every other E003/E003b child; `compareRank` then picks this row.

#### Chasse à l’homme — E002 is the wrong row

| row | title | event_id | parent | own moods |
|---|---|---|---|---|
| P0088 | **Chasse au trésor nautique kayak** | **E002** | *Un été au bord du lac* — `festif\|dansant\|tendre`, themes `handicap\|sport\|famille\|jeunesse` | empty |
| **P0179** | **Chasse à l’homme** (Fritz Lang) | **E006** | *Rentrée Cinémathèque* — **11** moods | `intense\|cerveau\|brutal` |
| PTMP_L131_41_… | Man Hunt (Chasse à l'homme) | ETMP_L131_53024_0922 | same film, own `intense` | `intense` |

E002’s 12 children are kayak / paddle / yoga — **correct** join, form `enfants`, **0** `film_id`. The brief copied E002 tags onto the recommended cine title.

The recommended work is **P0179 → E006** (2026-09-22 19:00, `F0317`). Own 3 moods are plausible for Lang; the bench shows **11** because `itemTasteMoods` unions parent E006 (36 films’ tags). Also recommended as an event-level card: « Rentrée Cinémathèque (Fritz Lang, animation…) » 9× with the same 11-mood vector.

**Bad join, yes — but Utopia / Cinémathèque umbrellas, not E002.** A cine séance `event_id` pointing at a season card is a real join-quality bug. Spot check: 37 distinct films share E003; 41 share E003b; 36 share E006.

### 4. Among recommended items, who inherits?

Eloi25 bench: **271** rows, **65** distinct titles/works, **46** vivant (the coverage numerator).

| | inherit-only moods | own moods | no closed mood |
|---|---:|---:|---:|
| 46 vivant works | **0** | 44 | 2 (fallback / tagless) |
| 19 cine works | **2** (Tokyo, Decorado) | 16 (several **own + parent union**) | 1 (event card uses parent) |

Frequent items (`n ≥ 8`):

| n | profiles | slot | own taste moods | parent taste moods | title |
|---:|---:|---|---|---|---|
| 25 | 9 | cine | — | **8** E003 | Des Fleurs pour Tokyo |
| 16 | 9 | concert | festif, rigolo, leger | — | Quiz de culture générale… |
| 15 | 8 | cine | intense, cerveau, brutal | **11** E006 | Chasse à l’homme |
| 14 | 5 | theatre | rigolo | rigolo, dansant (same show) | Les Clotildes |
| 10 | 6 | concert | festif | festif | Open Mic Night |
| 10 | 8 | concert | intense, dansant, festif | same | Light Asylum |
| 9 | 9 | cine | — | **11** E006 | Rentrée Cinémathèque (event card) |

**Cine concentration = umbrella inheritance. Vivant concentration ≠ inheritance.**

### 5. 8–11 moods on the bench are not a display bug

Confirmed. `toListRow` prints `itemTasteMoods(item)`. Those slugs are in the 16 locked goûts and sit on `ev.moods` of E003 / E003b / E006. Scoring uses the same parent moods plus closed genres/themes.

---

## §2 — Fiction noise

`inverseMoodWeights` (`reco.ts` L1151–1176) counts **only** `CLOSED_MOODS` (the 16). Comment on site: *« 82 % rigolo → ≈ 0 »* — that kill switch is `n ≥ 6 && share ≥ 0.75 → idf = 0`. It never looks at genres.

Genre contribution in `scoreOverlapHit` is `(pct/100) * SLOT_WEIGHTS[slot].genre * 1` (cine genre weight **0.35**, no IDF).

`fiction`:

- Present on **76.4 %** of cine *rows*, **42.1 %** of cine *works* (token in prog/ev `genre` / `genres_mood`).
- **Not** in `CLOSED_GENRES` → `itemClosedSlugs` **drops it**.
- `CINE_VIVANT_NEIGHBORS.fiction` maps to `theatre_contemporain | chanson_variete | jazz_blues`.
- `FICTION_NEIGHBOR_LIGHT = 0.5` applies only when `slot !== 'cine'` **and** the profile has a `fiction` key **and** the living item hits those neighbor targets. It is a **bridge discount for living slots** (Eloi C4 « Cinéphile pur » has `genres.fiction`). It does **nothing** to Tokyo’s cine score.

Tokyo’s winning séances do not need `fiction`. They score Σ (user.pct × mood-idf) over the **8 inherited E003 moods**, plus parent genres that *are* closed (`comedie`, `action`, `polar`, `animation`, …) and parent themes (`famille`, `guerre`, `amour`, …).

Approximate month-window cine IDF (807 séances, same formula as the engine): `rigolo` share **15 %** (idf ≈ 1.90), not 75 %. The dominant-tag kill switch does **not** fire on inherited umbrella moods — they are wide for the *child* but not 75 % of the whole cine slot.

For a 6-mood flat profile, Tokyo sums ~4 mood hits (≈ 1.15 raw overlap) vs ~0.3 for a one-mood film. For a single `rigolo` profile, overlap **ties** every other rigolo cine item; 11:45 + key wins.

---

## §3 — Inter-profile diversity

No repeat penalty, no popularity amortisation, no daily salt, no “already shown to other users” (and there should not be, per-user, at request time). `recommendSlice` (the 6-pack under top 3) has max-2-per-genre and 1 untagged — **top 3 does not**.

```1281:1290:src/lib/reco.ts
/** score desc, then date+time, then key. No Math.random. */
function compareRank(a: ScoredDayItem, b: ScoredDayItem): number {
  if (b.score !== a.score) return b.score - a.score;
  const day = a.item.dayIso.localeCompare(b.item.dayIso);
  if (day !== 0) return day;
  const clock = (itemClockHHMM(a.item) || '99:99').localeCompare(
    itemClockHHMM(b.item) || '99:99',
  );
  if (clock !== 0) return clock;
  return (a.item.key || '').localeCompare(b.item.key || '');
}
```

Same score ⇒ earliest day ⇒ earliest clock ⇒ lexicographic `item.key`. Monday 11:45 Tokyo is a stable attractor.

Week vs month #1 (Eloi25): **same title for 22 / 25** profiles. Mismatches (B6, C3, D2) still stay cine. The month window is a superset of the week; the week winner remains feasible and keeps the best score / earliest tie-break. That **structurally caps coverage**: the 400 denominator includes vivant works that only exist on days 8–30, but month #1/#2 rarely leave the week’s winners.

Living fallback is `1/freq(work)` (rarity). Cine fallback is `n_seances × 1.6` if nouveauté — **more** séances help cine cold start, the opposite of living. Not the Tokyo-profile path (`reasonSource: profile`), but it concentrates guest / A1 cine on high-inventory films (Eloi A1 week/month #1 = Avengers Extended).

---

## §4 — `vivantShare` is a slot identity

Top 3 = at most 1 cine + 1 theatre + 1 concert (`SLOT_ORDER`, `pickBestPerSlot`). When all three fill: vivant = 2/3.

Eloi25 runs:

| list length | vivantShare | n runs |
|---:|---:|---:|
| 3 | **0.667** | **77** |
| 2 | 0.500 | 17 |
| 1 | 0.000 | 6 |

A4 (`angoissant`, `NO_BRIDGE_MOODS`): monday/friday/week = cine only (share 0); month adds Dracula theatre → 0.5; **mean 0.125**. That is the intended “do not invent living stock” behaviour.

Global mean 0.598 is just the mix of full 1+1+1 and holes. **Do not use vivantShare as a top-3 quality KPI.** Keep it, if at all, for free slices (`recommendSlice`) where the 2/3 identity does not apply.

---

## §5 — Cold start / `profileHasChipWeight` / `n_total=2`

```909:917:src/lib/reco.ts
export function profileHasChipWeight(profile?: TasteProfile | null): boolean {
  if (!profile) return false;
  return (
    Object.values(profile.genres).some((e) => entryWeight(e) > 0) ||
    Object.entries(profile.moods).some(
      ([key, e]) => isTasteMood(key) && entryWeight(e) > 0,
    ) ||
    Object.values(profile.themes ?? {}).some((e) => entryWeight(e) > 0)
  );
}
```

Gate is **weight > 0** on genres ∪ (16 taste moods) ∪ themes. Not a high numeric threshold.

What does **not** open personal reco (but `hasScorableState` in `signals.ts` **does** accept some of these):

| signal | `profileHasChipWeight` | `hasScorableState` |
|---|---|---|
| taste mood / closed genre / theme | yes | yes |
| `tastesText` only (unparsed) | **no** | **yes** |
| communes only | **no** | **yes** |
| `profile.cats` only (e.g. cinema chip) | **no** | no (cats ignored) |
| mood `sortie` only | **no** (`!isTasteMood`) | no |

If testers only used the Cinéma chip, a commune, or a phrase that never landed in `profile.moods`, they see **repli** (`popularite` / `nouveaute`) even when admin KPI 18 / `hasScorableState` counts them as “with tastes”.

Eloi 25: **24 / 25** pass the gate (only A1 empty fails; `fallbackRate = 1`). D4 « texte libre » already has parsed moods. D5 « genres sans ambiance » passes via genres. The synthetic bench is **not** a 28/30 cold-start story.

### `n_total=2` vs « 2 / 30 »

`buildReal30Export` (`src/lib/real30Export.ts` on PR #142):

```text
n_total    = rows.length          // every account_tastes row from listAccountTastesForAdmin
n_eligible = J1 filter survivors
n_cold     = n_total - n_eligible
```

`real30` is a **campaign name**. It does not pad to 30. PR #142 on a VM without `POSTGRES_URL` printed `n_total=0`. A Neon run that printed `n_total=2` means **two persisted comptes**, not a 30-row sample with 28 dropouts.

There is **no** `bench-results/real30/*.json` in git (gitignored, 0 email). This repo therefore **cannot** confirm “28/30 fail `profileHasChipWeight`”.

The brief’s real-profile line (coverage **3 %**, 11 / 400) is numerically what you get by running the same bench on **~2** profiles (11 unique vivant works / 400 ≈ 2.75 %). That is a small-n union, not proof that 93 % of testers never see personal reco.

**Read:** treat `n_total=2` as the real dataset size until Neon has more `account_tastes` rows (or a hashed export is produced locally). Do not plan a cold-start rewrite on a misread 2/30.

Repli **does** concentrate: cine fallback boosts high séance-count nouveautés; living fallback is rarity but still 1 slot × deterministic tie-break. Guest / A1 already show Avengers Extended as a stable #1.

---

## Why coverage is 11.5 % (putting the pieces together)

```
25 profiles × 4 windows × ≤2 vivant slots ≈ 200 vivant picks
union = 46 works
denominator = 400 vivant works in the month window
46 / 400 = 0.115
```

Monday stock is only **27** vivant works; week **139**; month **400**. Because week and month share the same #1/#2 for almost every profile, the extra ~260 month-only vivant works are almost never chosen.

Drivers, in order of impact on **that** metric:

1. **1+1+1** — at most 2 vivant items per list.
2. **No inter-profile (and no intra-month) exploration** — same taste ⇒ same winner; month does not re-roll.
3. **Deterministic tie-break** — shared attractors (Quiz Monday, Clotildes, Light Asylum).
4. **Shared Eloi tastes** — many profiles carry `rigolo` / `festif` / `intense`.
5. **Not** parent-mood inheritance on vivant (0 inherit-only among the 46).

Cine umbrella inheritance is a **separate, confirmed product bug**. It makes Tokyo / Chasse / Cinémathèque look like 8–11-ambiance films and monopolise the cine slot. Fixing it will change **what** is recommended and cine diversity; it will **not**, by itself, lift vivant coverage well above 11.5 %. After each fix, re-run `npm run bench` and watch both: cine title entropy **and** `global.coverage`.

---

## Proposed fixes (do not implement — Manager GO)

Ranked by leverage / risk. No cosine. No mass retag.

### P0 — Stop inheriting umbrella / season tags onto children

**Do this first.** Several equivalent guards (pick one, test):

1. If `film_id` is set, ignore `ev.moods` / `ev.genres_mood` / `ev.themes` / `ev.genre` unless parent title ≈ work title (or parent has a single distinct child `film_id`).
2. If an event has ≥ N distinct child titles or film_ids (N ≈ 5), treat it as umbrella: do not merge parent tags into children. Still score the **event card** itself with its own tags.
3. Weaker: inherited slugs × 0.15 vs own × 1.0 (does not fix Tokyo inherit-only, only dampens Chasse-style own+parent).

Expected: Tokyo séances on E003 fall back to `{drame}` or untagged; Chasse keeps `intense|cerveau|brutal` only; bench 8–11-mood cine rows disappear. **Cine** concentration should drop. **Vivant coverage** likely stays near 11 % until P2.

### P1 — Bench metric: replace top-3 `vivantShare`

Report `slotsFilled` (0–3) and vivantShare only on `recommendSlice`. Stop putting 66.7 % in the top-3 dashboard.

### P2 — Intra-user / window diversity (coverage lever)

Without inter-user state:

- Month (and week) should not clone Monday’s #1: e.g. exclude identities already picked in a shorter window, or add a light day-hash on `compareRank` after score (`hash(userKey, dayIso, workId)` only on **ties**, or a small exploration ε).
- Cap repeat of the same `workId` across the 4 bench windows when reporting coverage (measurement) **and/or** in product when the user switches Lundi → Semaine → Mois.

Expected: coverage moves because month-only stock can win. Risk: “worse” Monday if ε is too large. Tune on Eloi25 before GO.

### P3 — Align cold-start gates

Decide product-wise:

- Either `tastesText` / communes open `profileHasChipWeight` (same as `hasScorableState`), **or**
- Admin / export copy must say “scorable ≠ personal reco”.

Numeric threshold is already `> 0`. Do not raise it. If Neon really has 2 rows, recruit / persist more comptes before claiming 93 % cold start.

Guest / empty-profile cine fallback: consider `1/freq` (or novelty without séance-count boost) so Avengers-with-30-séances does not lock the slot.

### P4 — Genre IDF / `fiction` (low priority for Tokyo)

- Adding `fiction` to `CLOSED_GENRES` would **activate** a currently inert token (opposite of “neutralise” unless IDF also hits genres).
- Genre IDF + 75 % kill switch would matter for `drame` / `comedie` if they become dominant **after** P0.
- `FICTION_NEIGHBOR_LIGHT` is already only a living-bridge dimmer; leave it until C4 vivant quality is re-measured post-P0.

### P5 — Do not do now (brief §7)

- Cosine / Matching C.
- Mass retag to equalise mood counts (842 one-mood items are fine).
- Optimising coverage in isolation (random vivant would raise 11.5 % and look absurd).

---

## Instrumentation (not shipped)

No change to `reco.ts`. The dump JSON lists each of the 65 recommended works with:

- bench `displayedMoods`
- catalogue own vs parent taste moods
- `moodsOnlyViaParent`
- parent title + umbrella flag

Re-run after a future P0 by joining a new `eloi25` JSON the same way.

---

## Appendix — Eloi25 global (PR #142, unchanged)

```text
coverage  46 / 400 = 11.5 %   ⚠  (threshold 15 %)
vivant    59.8 %              (77 % of runs are exactly 66.7 %)
repli     7.8 %
271 reco rows, 65 titles
```
