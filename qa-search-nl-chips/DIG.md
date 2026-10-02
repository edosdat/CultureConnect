# Dig — recherche NL → chips

Baseline code (avant ce ship) : `#cc-search` commit les chips QUAND / QUOI **à l’Enter** (`parseSearchChips` + `handleSearchSubmit`). Pas de bandeau de preview. Pas de Google Suggest.

## Vocabulaire déjà dans l’app

| Axe | Mots reconnus | Chip home |
|---|---|---|
| QUAND | ce soir, aujourd’hui, ce week-end / WE, cette semaine, demain, un jour de la semaine, « 12 septembre » | Ce soir · Aujourd’hui · Ce WE · Cette semaine · Date… |
| QUOI | ciné/film, concert/musique, théâtre/danse/humour, festival, expo/musée, enfants/famille | Cinéma · Musique · Théâtre · Festival · Expo & patrimoine · Enfants |
| Genre | libellés `genres_legend` (ex. jazz, blues, rock, électro) | Jazz / blues, etc. + QUOI parent (Musique) |
| Ville | communes du catalogue (Toulouse, Blagnac, Labège, …) | chip Ville |
| Salle | nom de `lieux.csv` (ex. Bikini) | chip Salle |

Lyon n’est pas dans le catalogue métropole : « à Lyon » ne pose pas de chip Ville. Équivalent couvert : « jazz à Blagnac », « au bikini ».

## Temps — 0 chip date

`bootTimeScope()` et Confirmer sans date → scope `tous`.

`listForRange` ouvre alors `upcomingRange(today Paris, dataMaxIso())` : tout le catalogue **≥ aujourd’hui**, sans plafond 14 jours / semaine / mois.

Une date dans la phrase (ce soir, demain, ce week-end, …) reste un chip QUAND, visible dans le preview, appliqué seulement par **Confirmer**.
