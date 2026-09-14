# Badge Presse — musique pack/rail cards

Eloi GO follow-up after #104 (theatre). The compact « Presse » pill now also lights on **Musique** pack thumbs and Top 3 rail cards. Theatre #104 behavior is unchanged.

## Predicate (same as #104)

`cardPressBadge` — used by `PressBadge` on pack/rail vignettes:

- cat theatre (`isTheatreDayItem`) **or** musique (`isMusiqueDayItem`)
- programme **OR** evenement has a real citation (source / citation / note via `fichePressCitation`)
- hide when empty — **no ghost pill**
- label: compact « Presse », or « Vu dans {média} » when the outlet name is ≤14 chars

`theatreCardPressBadge` stays theatre-only (the #104 gate). Cinema / expo / enfants stay clean.

`slimDayItem` already keeps catalogue `citation*` so first-paint musique cards resolve the same way as theatre.

## Surfaces

- Musique pack thumbs (`CinemaCarousel` FilmThumb, compact)
- Top 3 rail (`SeanceCard` rail, compact)
- Live / default cards already mount `PressBadge` — musique now resolves

## Out of scope

- Theatre pill copy / placement (#104)
- Cinema badges
- Artist-only fallback on the card (fiche still uses `withConcertArtistPress`)
- Catalogue TSV / new press rows

## QA

1. Musique pack → concert with `citation`+`source` shows « Vu dans Télérama » (or « Presse » if the name is long)
2. Musique pack → concert without citation → no pill
3. Théâtre pack → same pills as #104
4. Cinéma pack → no Presse pill even when a quote exists
