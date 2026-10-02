# Soft Design LOCK — Recherche NL → chips filtres (Plan C)

**Role:** Soft Design · CultureConnect Plan C  
**Status:** Soft **LOCK** · Soft WAIT preview Site · Soft PASS later on preview  
**Soft tip:** No (tips → parent / Manager Cc / Site only)  
**Soft merge:** No  
**Guest Design:** OK  
**LIVE baseline:** https://culture-connect-2q8c-three.vercel.app/  
**Brand densif Plan C:** terracotta `#E85D3B` · cream `#F7F0E8`  
**Checked / locked:** 2026-10-02 ~00:18 CEST (Europe/Paris)  
**Supersedes (primary UX):** `/workspace/qa-search-suggest-v0/BRIEF.md` — Google-léger dropdown titres/lieux/artistes becomes **secondary** only (see §3). Soft LOCK clear: **chips-first for NL**.

**Anchor code (LIVE today):** sticky `#cc-search` / `SearchOmnibox` · home axes QUAND / QUOI / Ville / Salle · `parseSearchChips` already maps NL → QUAND + QUOI on **Enter submit** (auto-apply). Soft LOCK changes UX: **preview under field + Confirmer** before apply. Soft dig: optional DIG.md (no computerUse this turn).

---

**NL LOCK update (steer #231):** salle OUT of parse → chips. Ville / QUOI / QUAND / genre / Enfants stay.

## Soft one-liner STEER LOCK

NL sous `#cc-search` → **preview chips déduits** (QUAND / QUOI / Ville / Salle / genre) cream strip + CTA **« Confirmer »** terracotta — pas d’auto-apply · catalogue ≤8 secondaire titre/artiste seulement.

---

## 1 — Flow Soft (LOCK)

| Step | Soft LOCK |
|------|-----------|
| 1 · Type | User types natural language in `#cc-search` (ex. **« jazz ce week-end à Lyon »**). |
| 2 · Deduce | Soft debounce (~200 ms, align suggest V0) → local parse maps intent to Plan C filter axes (reuse / extend `parseSearchChips` + commune / salle / genre where product already has chips). |
| 3 · Preview | Soft shows a **preview row of deduced chips** **sous** the field (not alone title jump). Chips look like home filter chips but in a **preview** state (not yet applied to home axes). |
| 4 · Confirm | Primary CTA **« Confirmer »** (terracotta) applies preview chips to home filters (QUAND / QUOI / Ville / Salle / genre as deduced). Soft alt label OK: **« Appliquer les filtres »** — Soft LOCK **one** primary button label on ship: prefer **« Confirmer »**. |
| 5 · Secondary | Soft densif row actions: **Modifier** (focus back to field / keep draft + preview) · **dismiss** (✕ or « Annuler » — close strip, draft stays, home filters **unchanged**). |

**Example Soft map (design target):**  
« jazz ce week-end à Lyon » → preview chips **Ce WE** (QUAND) · **Jazz** (genre / QUOI facet) · **Lyon** (Ville) → Confirmer → home axes update.

**FAIL:** auto-apply chips while typing; apply on Enter without Confirmer when preview is showing filter chips; modal confirm sheet; jump to titre fiche as the **only** path for NL filter phrases.

---

## 2 — Placement densif (LOCK)

| Rule | Soft LOCK |
|------|-----------|
| Position | Preview strip **directly under** `#cc-search` (same form / sticky search stack). **Not** a modal, **not** a bottom sheet, **not** alone under page title. |
| Pattern | Google-light **cream strip** `#F7F0E8` · light border terracotta/10 · subtle shadow · radius ~12–14px (`rounded-xl`). |
| Chip touch | Preview chips **36–40px** height (Soft densif strip; home axes can stay ≥44). Tap target ≥36. |
| CTA row | Soft densif: chips wrap left · CTA **Confirmer** right (or below chips on narrow if wrap) · secondary dismiss muted. |
| Width | Anchored to search field / `role=search` width — not full viewport bleed. |
| z-index | Above agenda (`z-40` densif like suggest V0) · **below** fiche / blocking modals (`z-50+`). Non-modal; no focus trap. |
| Keyboard mobile | Input stays visible; strip grows downward; clamp `max-height` if needed. Soft: strip must **not** cover `#cc-search`. |

**FAIL:** modal; chips only in title area; strip covering the field; desktop-only mega panel.

---

## 3 — Empty / ambiguous Soft (LOCK) — **primary = chips-first**

Soft LOCK **one primary:** **chips-only for NL filter intent**. Catalogue dropdown is **secondary**, not co-primary.

| Case | Soft LOCK |
|------|-----------|
| NL with ≥1 filter chip deduced | Show **preview strip** only (chips + Confirmer). Do **not** also open catalogue dropdown. |
| Query looks like **bare titre / artiste** (no QUAND / QUOI / Ville / Salle / genre intent — e.g. « Les Misérables », « Dune ») | Soft secondary path Soft note Site: optional catalogue dropdown ≤8 (titles/lieux/artistes) under field — same Google-léger as old suggest V0. Soft V0 may ship chips-path first and defer dropdown; Soft PASS accepts chips-path alone if Site defers. |
| Ambiguous / Soft can't deduce any filter chip **and** not a clear title hit | Soft FR copy in strip (muted, one line): **« On n’a pas trouvé de filtre — précise une date, un type ou une ville »**. No fake chips. Soft optional: keep draft; no Confirmer (disabled or hidden). |
| Empty / &lt; 2 chars | Strip closed. |
| Partial NL (typing « jazz ce ») | Soft pick → show preview as soon as ≥1 chip stable after debounce; update live; Confirmer only when ≥1 chip. |

**FAIL:** English empty; invent chips Soft can't map; auto-apply on ambiguous; catalogue as only UX for « jazz ce week-end ».

---

## 4 — Confirm Soft LOCK wording FR

| Element | Soft LOCK |
|---------|-----------|
| Primary CTA | **« Confirmer »** — fill terracotta `#E85D3B` · cream/ink on label · min-h 36–40 · rounded-full densif Plan C |
| Soft alt (if Site needs longer) | **« Appliquer les filtres »** — same style; Soft prefer short **Confirmer** on mobile |
| Secondary dismiss | Soft pick densif one: muted **« Annuler »** text button **or** ✕ icon 36 touch — Soft LOCK: dismiss = no apply |
| Modifier | Soft densif: tap a preview chip to remove it from draft preview **or** edit field text (re-parse). Soft V0 minimum: edit field + re-debounce is enough; chip × Soft nice-to-have |

**FAIL:** English « Confirm » / « Apply »; terracotta outline-only as sole primary; Confirmer that closes without applying.

---

## 5 — Chip mapping Soft densif (LOCK)

Preview chips must map to **existing Plan C home filters** (same labels / axes), not invent a parallel taxonomy.

| Axis | Soft preview chip | Notes |
|------|-------------------|--------|
| QUAND | Ce soir · Aujourd’hui · Ce WE · Cette semaine · Date… | One QUAND max (same as `parseSearchChips`) |
| QUOI | Cinéma · Musique · Théâtre… (main cats) | Multi OK |
| Genre | Jazz / etc. under QUOI facet | When deduceable from NL |
| Ville | Commune chip (ex. Lyon) | Soft LOCK UX even if LIVE parse is QUAND/QUOI-only today — Site extends parse |
| Salle | Venue chip when NL names a known salle | Soft LOCK UX; Soft note Site catalogue match |
| Leftover titre | Soft densif: if leftover title after chip strip, Soft show muted micro-line **« + titre : … »** in strip — Confirmer applies chips **and** title `q` leftover. Soft: leftover alone without chips → secondary catalogue path §3 |

**FAIL:** preview chips that don't exist on home axes; English chip labels.

---

## 6 — OUT (LOCK)

Strictement hors scope Soft LOCK:

- Google Suggest / Places / remote autocomplete externe  
- **Auto-apply without confirm** (while typing or on debounce alone)  
- Alone jump titre / fiche **as only UX** for NL filter phrases (chips path must exist)  
- Ads / sponsored / remote ML ranking chrome  
- Soft merge · Soft tip Site|Manager direct  

**Soft note:** Enter key Soft densif when preview open with ≥1 chip → Soft LOCK **activate Confirmer** (same as tap CTA), **not** silent auto-apply without the confirm affordance visible. Soft: user must have seen preview.

---

## 7 — Soft acceptance checklist (LIVE / preview)

Guest Soft · mobile-first **~380** (+ smoke desktop). Soft PASS later on preview only.

| # | Check | Expect |
|---|--------|--------|
| N1 | Type « jazz ce week-end à Lyon » (or site-supported equivalent) | Preview strip **sous** `#cc-search` with deduced chips (QUAND + genre/QUOI + Ville as available) — cream Google-light |
| N2 | Chips preview | 36–40 touch; not yet applied on home axes until confirm |
| N3 | Tap **Confirmer** | Home filters update to match preview; strip closes or collapses Soft densif |
| N4 | Dismiss / Annuler | Home filters unchanged; draft may stay |
| N5 | Ambiguous NL, 0 chips | FR copy « On n’a pas trouvé de filtre… » ; no fake chips ; Confirmer off/hidden |
| N6 | Bare titre (ex. film name) | Soft secondary catalogue ≤8 **or** title search path — Soft: **not** fake QUAND/QUOI |
| N7 | No auto-apply while typing | Home axes stay until Confirmer |
| N8 | Mobile keyboard | Field visible; strip under field |
| N9 | Brand | Terracotta CTA · cream strip `#F7F0E8` · `#E85D3B` |
| N10 | Network | No Google Suggest externe for this strip |
| N11 | Soft primary | Chips-first for NL filter phrases; titre-alone dropdown not the only UX |
| N12 | Enter with preview chips | Soft = Confirmer (apply) |

**Soft PASS later:** Soft re-QA preview after Site ship; Soft tip No.

---

## Dig note

See `DIG.md` — light baseline from LIVE fetch + code (`parseSearchChips` Enter-apply today). Soft #227 may hold desktop; Soft BRIEF without computerUse screenshots this turn.

---

## Tips (parent relay — Soft tip No)

**FR tip Manager Cc:** Soft Design LOCK NL → preview chips sous `#cc-search` + **Confirmer** (terracotta) avant apply — chips-first ; catalogue titre secondaire. Soft tip No · Soft merge No.

**FR tip Site:** Soft LOCK READY — `/workspace/qa-search-nl-chips/BRIEF.md` · Soft WAIT preview · Soft PASS later. Soft tip No.

---

## Soft ALIGN — défaut agenda time (Manager / Eloi · 2026-10-02 ~00:24)

**Authoritative product LOCK:**

| Soft LOCK | Rule |
| --- | --- |
| **0 chip date** | Agenda = **full catalogue ≥ today** Europe/Paris — **pas** défaut semaine / mois / 14j |
| Date chips (QUAND) | Intentionnels — user (or Soft NL Confirmer) only |
| NL date | If Soft NL déduit un QUAND → preview chip + Confirmer (intentionnel). If Soft NL **sans** date → Soft apply **0** QUAND chip → full ≥ today |
| Soft FAIL | Soft defaulting search/home to « cette semaine » / mois / 14j when no date chip |

Soft WAIT tip Site dig+preview. Soft tip No.
