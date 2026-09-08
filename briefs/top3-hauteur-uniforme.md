# Top 3 — hauteur uniforme, cartes moins hautes

Eloi GO 08/09 (+ Manager addendum). Home Top 3 rail cards must be **moins hautes** (less tall, not lower on the page) and **the same fixed height** in the snap carousel. Variable title / reason lines must not grow a slide.

## Cards

- Locked frame: `TOP3_RAIL_CARD_HEIGHT_CLASS` (`h-[7.5rem]`). Every 1–3 card, mobile rail + md grid.
- Title: `line-clamp-2` (1–2 lines), reserved min-height so 1-line titles stay even.
- Reason: `line-clamp-1`. Reasons stay (guest / logged-in). Never hide them.
- Vignette: same image area on every slide (`TOP3_RAIL_THUMB_CLASS` fills card height, fixed portrait width).
- **NO_DESC**: `source="top3"` / `seanceCardShowsPitch` — no pitch / synopsis.
- Denser body padding. Date / horaire / lieu on one meta line.

## Gap filters → Top 3

Too much empty well under QUAND/QUOI / Voir le mois. Tighten:

- `HOME_CHROME_STACK_CLASS` (boot + live)
- list-wait overlay (no reserved 32px hole)
- `TOP3_SECTION_CLASS` padding / stack

Goal: no big empty hole; denser first screen at ~380px.

## Keep

- H2 scale = Ciné (`HOME_SECTION_TITLE_CLASS`)
- Peek + snap (`w-[78%]`, `TOP3_CAROUSEL_*`)
- Display order théâtre → ciné → concert (`DISPLAY_SLOT_ORDER`)
- Reco scoring unchanged

## Out of scope

- Pack heroes / fiche description
- Reco algo
- Merge (batch with other home PRs)

## QA (~380)

1. All three cards the same height; next poster peeks; snap 1/3 → 2/3
2. Long title wraps to 2 lines; short title does not shrink the card
3. Reason visible, one line; no pitch
4. Voir le mois sits close to Top 3 (no 32–87px empty well)
5. H2 « Le/Mon top 3 » matches Ciné type + scale
