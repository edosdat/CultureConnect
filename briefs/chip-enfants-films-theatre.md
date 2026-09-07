# Enfants chip — kids films & jeune-public theatre

Eloi GO 08/09. Chip `enfants_famille` was cat-only: `animation_jeune_public` maps to **cinema**, `isEnfantsDayItem` never steals cine / théâtre, so kids films and theatre classified as `theatre_danse` vanished when the chip was on.

## Predicate (do not remap mains)

`matchesEnfantsChipContent` — used by the Enfants filter and the Enfants-only carousel:

- cat `enfants_famille` / `atelier`
- films: genre `animation_jeune_public`, or cinema + tags `famille|enfants|jeune_public`
- theatre: genre `jeune_public`, or theatre + the same tags / `public_cible`

`GENRE_SLUG_TO_MAIN` is unchanged (`animation_jeune_public` → cinema, `jeune_public` → theatre_danse) so exclusive Cinéma / Théâtre chips (#49) still own those cards.

`isEnfantsDayItem` stays exclusive on the default home (kids films stay in Ciné — never steal).

Age veto: `Interdit` / 12+ on `public_cible` or `age_min` drops adult animation that AlloCiné dumped into `animation_jeune_public` (Jim Queen, Belladonna). Catalogue rows that stay `animation_jeune_public` + `tout_public` (Akira) still match — that is data, not the Cinéma chip.

## Chip ON

- API pool: `matchesMainCategories` + dual-index into `byMain.enfants_famille`
- Enfants-only: hide cine / théâtre / musique / expo rails; Enfants carousel uses the broad predicate
- Sorties pack stays hidden (`catsAllowCinemaPack`) — no awkward kids-only Sorties
- Combined extra chips (expo + enfants) still show all packs

## Out of scope

- Chip rename
- Living suggestions evening rules (fin-film PR)

## QA

1. Chip Enfants → `animation_jeune_public` films visible
2. Chip Enfants → tagged jeune-public theatre visible
3. Chip Enfants → no adult thriller leak
4. Clear chip → normal catalogue (kids films back in Ciné)
