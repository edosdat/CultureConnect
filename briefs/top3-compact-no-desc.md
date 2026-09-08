# Top 3 — compact scan, no description

Eloi GO 08/09. Home Top 3 cards must be **compact scan**: image, title, short meta (lieu · horaire · cat if already there), CTA to open the fiche. **No description / pitch / synopsis** — short, long, or 2-line clamp.

Height stays compact so the block is scannable as one row on a 380-wide viewport, and Ciné / vivant sit above the fold without a long scroll.

## Render gate

`seanceCardShowsPitch(variant)` — `false` only for `rail` (the Top 3 SeanceCard variant used by `SeanceGrid` `fixedSlots`). Catalogue `default` / `live` / `compact` cards keep `itemPitch`.

`itemPitch` / `description_courte` / `description_longue` stay on the model. Opening a fiche from Top 3 still shows the full description (#56).

## Out of scope

- Detail fiches / pack heroes: full description **stays** (#56)
- Reco algo / scoring: unchanged
- Top 3 H2 Le/Mon: unchanged (#53)
- Top 3 hide on cat/search: unchanged (#55)

## QA

1. Top 3: 0 description paragraph under cards
2. Top 3 block shorter → Ciné/vivant reachable without long scroll
3. Opening fiche from Top 3 still shows full description
4. 1/2/3 card layouts still OK
