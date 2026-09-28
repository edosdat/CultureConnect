> **⚠ Remplacé** par `briefs/tags-v2-evenements-et-profils.md` (28/09/2026), qui reprend ce diagnostic et ajoute 6 axes de tags et les familles de profils. Ne plus utiliser ce fichier comme référence.

# Tagging des ambiances — méthode v2 (plus varié, plus fiable)

Brief pour l'agent de code et pour quiconque produit les colonnes `moods` / `mood_source` / `mood_confiance` des CSV. Rédigé le 28/09/2026, chiffres mesurés sur `data/evenements.csv` (lignes `theatre_danse` + `musique`, n = 1 271).

À lire avec `briefs/duels-signal-compare.md` : les duels n'apprennent que ce que les tags savent distinguer. Si un spectacle sur deux porte le même tag, ni la reco ni les duels n'ont de quoi travailler.

---

## 1. Diagnostic : pourquoi on retrouve toujours les mêmes tags

| Constat | Chiffre | Effet |
|---|---|---|
| Théâtre : **un seul tag, et c'est `rigolo`** | **213 / 512** lignes taguées | `inverseMoodWeights` met `rigolo` à IDF 0 dans le créneau théâtre (≥ 75 %) : ce tag ne pèse plus rien pour la reco |
| Théâtre : part de `rigolo` | 57 % des lignes taguées | idem |
| Concerts : part de `festif` | 56 % (50 lignes n'ont que `festif`) | même problème côté concerts |
| Lignes **sans aucune ambiance** | 500 / 1 271 (39 %) | invisibles pour la reco et pour les duels |
| … dont avec une description de plus de 80 caractères | **211** | on avait le texte, on n'a pas tagué |
| Lignes à **un seul** tag | 506 | aucune nuance possible |
| Lignes à 2 tags ou plus | 265 seulement | |
| `mood_confiance = basse` | 635 (la moitié) | la reco les traite comme des tags sûrs |
| `mood_source = genre` | 65 lignes, **65 × `rigolo`** | règle mécanique « genre humour → rigolo » |
| `mood_source = remap` | 87 lignes, dont 65 × `rigolo` | même biais |
| `mood_source = vide` **mais** des ambiances présentes | 108 | contradiction : d'où viennent ces tags ? |
| `sortie` dans `moods` | 41 lignes | ce n'est pas un goût (`phraseTags.ts` : « never a 17th goût ») |
| Séparateur `,` au lieu de `|` | 25 lignes | toléré par `splitTagSlugs`, mais le format doit être unique |
| Erreurs manifestes | ex. concert classique `Lio Kuokman / Nelson Goerner` → `rigolo` ; `TOM` (théâtre sur le sida en 1986) → `rigolo` | un duel ou un like sur ces lignes apprend à l'envers |
| Ambiance quasi absente | `angoissant` < 10 lignes | on ne pourra rien recommander aux profils qui l'aiment |

**Cause racine** : le tag décrit **la catégorie** (« c'est une comédie », « c'est un concert ») au lieu de **l'expérience** (« de quel rire ? quelle énergie ? »). Toutes les comédies finissent en `rigolo`, tous les concerts en `festif`, donc les tags ne départagent plus rien.

---

## 2. Principes de la méthode v2

### P1. Ne pas ajouter de 17e ambiance

Le vocabulaire des 16 ambiances est **verrouillé** (`TASTE_MOODS`, `phraseTags.ts` : « Do not invent a 17th »). La variété doit venir de **l'usage** des 16, pas de nouveaux mots. Ce qui n'est pas une ambiance va dans d'autres colonnes (P6).

### P2. Deux à trois ambiances, ordonnées

- Chaque spectacle tagué porte **2 ambiances minimum, 3 maximum**, dans l'ordre : **la première est l'ambiance principale**.
- Format de `moods` : `principale|secondaire|tertiaire`, séparateur `|` uniquement, slugs en minuscules.
- Pas de changement de schéma : l'ordre suffit. Un code qui veut l'ambiance principale prend le premier slug.
- S'il n'y a vraiment qu'une seule ambiance défendable : un seul tag, avec `mood_confiance` au plus `moyenne`.

### P3. Les tags « par défaut » doivent être nuancés

`rigolo` pour une comédie et `festif` pour un concert ne disent rien de plus que la catégorie. Règle :

- **`rigolo` n'est jamais seul.** Il doit être accompagné d'au moins une nuance qui dit *quel* rire :
  - `absurde` (non-sens, clown, burlesque, surréaliste) ;
  - `critique` / Satirique (politique, société, entreprise, satire) ;
  - `tendre` (comédie romantique, famille, émotion) ;
  - `leger` (divertissement pur, boulevard) ;
  - `cerveau` (stand-up d'idées, humour intello) ;
  - `sombre` (humour noir) ;
  - `intimiste` (seul en scène proche du public, confidence).
- **`festif` n'est jamais seul pour un concert.** Préciser l'énergie ou le registre : `dansant`, `intense`, `brutal` (metal, punk), `epique`, `poetique`, `intimiste` (acoustique, petite jauge), `contemplatif`.
- `rigolo` ne peut être **principal** que si le rire est **le but** du spectacle (humour, stand-up, comédie). Un drame avec des moments drôles → `rigolo` en secondaire au mieux.

### P4. Taguer l'expérience à partir du texte, pas du genre

- Source prioritaire : `description_longue`, puis `description_courte`, puis `citation` presse, puis `casting` / `genre`.
- **Supprimer la règle mécanique « genre → ambiance »** (`mood_source = genre` / `remap` qui produit 65 × `rigolo`). Le genre peut **proposer** un candidat, jamais décider seul.
- Pas de texte exploitable (moins de 80 caractères utiles) → **ne pas deviner** : `moods` vide, `mood_source = vide`, `mood_confiance` vide. Un tag vide vaut mieux qu'un tag faux.

### P5. Une confiance qui veut dire quelque chose

| Valeur | Définition stricte | Usage côté code |
|---|---|---|
| `haute` | l'ambiance est **dite** dans le texte (mot ou synonyme explicite : « hilarant », « poétique », « bal », « huis clos angoissant ») | reco + duels |
| `moyenne` | **déduite** du texte avec un indice clair (sujet, forme, public), sans être nommée | reco + duels |
| `basse` | plausible mais **devinée** (genre seul, titre seul) | reco avec poids réduit ; **exclue des duels** (`DUEL_MOOD_CONFIDENCE`) |

La confiance porte sur **la ligne**. Si les tags d'une même ligne n'ont pas la même solidité, prendre la plus faible. Une évolution possible : une confiance par tag, voir P6.

`mood_source` ne prend que ces valeurs : `pitch` (description), `presse` (citation), `genre` (candidat issu du genre, donc forcément `basse`), `manuel` (relu par un humain), `vide`. **Interdit** : des ambiances avec `mood_source = vide`.

### P6. Mettre la variété dans des colonnes à part (phase 2, optionnel)

Ce qui distingue vraiment deux soirées sans être une ambiance, à ajouter en colonnes **optionnelles** (le loader `src/lib/data.ts` doit tolérer leur absence) :

| Colonne | Valeurs | Pourquoi |
|---|---|---|
| `energie` | `1` à `5` (1 = calme, assis ; 5 = debout, ça bouge) | axe continu, très bon pour les duels (calme contre énergique) |
| `format_scene` | `seul_en_scene` · `duo` · `troupe` · `musique_live` · `dj` · `participatif` · `sans_paroles` | ce que les gens choisissent vraiment, orthogonal aux ambiances |
| `public` | `grand_public` · `initie` · `jeune_public` | évite de proposer du post-metal à un débutant ou l'inverse |

La **jauge** (petit lieu / grande salle) ne se tague pas : on la calcule depuis `lieux.csv` (`type`, et à terme une capacité).

Ces colonnes ne sont **pas** des goûts du `TasteProfile` dans ce lot. Elles serviront aux duels (axes du §5.4 du brief duels) dans un second temps.

---

## 3. Consigne de tagging (à donner au tagueur, humain ou LLM)

Texte à reprendre tel quel dans le prompt ou le guide du tagueur :

> Tu tagues l'**expérience vécue** par le spectateur, pas la catégorie du spectacle.
> Vocabulaire fermé, 16 ambiances, slugs exacts : rigolo, tendre, intense, angoissant, epique, brutal, festif, cerveau, intimiste, absurde, critique, sombre, poetique, dansant, contemplatif, leger. N'invente aucun autre mot. `sortie` n'est pas une ambiance.
> Donne **2 ou 3 ambiances**, la principale en premier, séparées par `|`.
> Si tu mets `rigolo`, ajoute obligatoirement **quel rire** : absurde, critique, tendre, leger, cerveau, sombre ou intimiste.
> Si c'est un concert et que tu mets `festif`, ajoute obligatoirement l'énergie ou le registre : dansant, intense, brutal, epique, poetique, intimiste ou contemplatif.
> `rigolo` en principal seulement si le rire est le but du spectacle.
> Appuie-toi sur la description. Si elle fait moins de 80 caractères utiles, ne tague pas.
> Pour chaque ligne, rends : `moods`, `mood_source` (pitch | presse | genre | manuel | vide), `mood_confiance` (haute = ambiance dite dans le texte ; moyenne = déduite avec un indice clair ; basse = devinée), et **une citation courte du texte** qui justifie l'ambiance principale.

La **citation justificative** est la clé du contrôle qualité : sans citation, pas de confiance `haute`. Si on ajoute une colonne pour la stocker (`mood_preuve`), elle ne s'affiche jamais dans l'UI (règle « jamais de note de scrape »).

### Exemples attendus (tirés du catalogue)

| Spectacle | Avant | Après (v2) |
|---|---|---|
| Kevin Levy : Cocu (seul en scène, rupture, sketch, danse, impro) | `rigolo` | `rigolo|intimiste|tendre` |
| Toc Toc (huis clos, six patients TOC) | `rigolo` | `rigolo|absurde|leger` |
| L'Esprit d'entreprise (entreprise Farbo, 250 employés) | `rigolo|absurde|intense` | `critique|absurde|rigolo` |
| Naine Rouge (conférence théâtro-clownesque sur les exoplanètes) | `rigolo|poetique` | `absurde|poetique|rigolo` |
| TOM (San Francisco, 1986, épidémie de sida) | `rigolo` ❌ | `intense|tendre` ou `sombre|tendre` |
| Lio Kuokman / Nelson Goerner (piano, classique) | `rigolo` ❌ | `contemplatif|epique` |
| Fat Freddy's Drop (reggae, soul, dub, groove) | `dansant` | `dansant|festif` |
| Xandria (metal symphonique, voix lyriques) | `intense|poetique` | `epique|intense|poetique` |
| Hypno5e & Hippotraktor (post-metal, Meshuggah, Gojira) | `intense` | `brutal|intense|sombre` |
| Cornélius (fanfare poétique New Orleans / caribéenne) | `tendre|intimiste|poetique` | `festif|poetique|tendre` (une fanfare n'est pas intimiste) |

---

## 4. Contrôle qualité : `scripts/tagAudit.ts` (à coder)

Script **dev-only, lecture seule** (n'écrit jamais dans `data/`), sur le modèle de `scripts/recoBench.ts`. À lancer après chaque mise à jour hebdo des CSV.

Usage : `npx tsx scripts/tagAudit.ts [--out bench-results/<date>-tags.md] [--strict]`

### 4.1 Rapport de distribution (par créneau `slotFormOfItem` : theatre, concert, cine)

- Nombre de lignes, % taguées, % avec ≥ 2 ambiances, nombre moyen d'ambiances.
- Part de chaque ambiance ; **IDF** calculé comme `inverseMoodWeights` ; liste des ambiances à IDF 0.
- Répartition `mood_source` × `mood_confiance`.
- Comparaison avec le rapport précédent si `--compare <fichier>`.

### 4.2 Seuils (⚠ en mode normal, sortie non nulle en `--strict`)

| Règle | Seuil cible |
|---|---|
| Aucune ambiance > **35 %** d'un créneau | sinon ⚠ « `rigolo` 57 % en theatre » |
| Lignes avec **≥ 2 ambiances** | ≥ 70 % des lignes taguées |
| Lignes taguées | ≥ 80 % des lignes avec ≥ 80 caractères de description |
| Au moins **12 des 16** ambiances utilisées ≥ 10 fois dans le vivant | |
| `mood_confiance = basse` | ≤ 25 % des lignes taguées |

### 4.3 Erreurs bloquantes (listées ligne par ligne, avec `event_id` / `programme_id`)

1. slug hors des 16 (dont `sortie`) ;
2. séparateur autre que `|` ;
3. ambiances présentes avec `mood_source = vide`, ou `mood_confiance` vide ;
4. `rigolo` seul, ou `festif` seul sur un concert (règle P3) ;
5. `rigolo` principal sans indice d'humour dans le texte (regex `humou?r|rire|drôle|comédie|hilar|stand|sketch|burlesque|clown|cabaret|impro|comique`). Cas réels détectés aujourd'hui : `TOM`, `L'Esprit d'entreprise`, `G.R.A.I.N - Histoire de fous`, `Spike and the Gimme Gimmes`… (9 lignes) ;
6. doublons de spectacle : même `lieu_id`, même date, titre normalisé préfixe de l'autre (ex. `Xandria + Seven Spires + Tulip` / `… (metal)`), avec des tags différents ;
7. titre qui n'est qu'une date (`Vendredi 02 octobre 2026 - 20H30`).

### 4.4 Jeu de référence (gold set)

- 50 spectacles vivants tirés au hasard (graine fixe), tagués **à la main** par Eloi selon la consigne du §3, stockés dans `scripts/fixtures/tag-gold.json`.
- Le script mesure l'accord entre le tagging courant et le gold set : ambiance principale identique (%), recouvrement des ensembles (Jaccard moyen).
- Cible : ambiance principale identique ≥ 70 %, Jaccard ≥ 0,5. En dessous, revoir la consigne avant de retaguer tout le catalogue.

Tests : `scripts/tagAudit.test.ts` sur un petit CSV fixture couvrant chaque erreur du §4.3, ajouté au script `test` de `package.json`.

---

## 5. Plan de migration

1. **Coder `scripts/tagAudit.ts`** et ses tests. Committer le rapport de référence actuel (`bench-results/2026-09-28-tags.md`) : c'est le « avant ».
2. **Constituer le gold set** (50 lignes, humain).
3. **Retaguer** avec la consigne du §3 : d'abord les 213 théâtres « `rigolo` seul », les 50 concerts « `festif` seul » et les 211 lignes non taguées qui ont une description ; ensuite le reste. Même traitement pour `programme.csv` (moods au niveau de la séance) et, séparément, `films.csv` (films : même vocabulaire, même règle P3).
4. **Relancer l'audit** ; viser les seuils du §4.2.
5. **Relancer le banc de reco** : `npm run bench -- --compare bench-results/2026-09-27-eloi25-b3b.json`. On attend **plus de variété** dans les top 3 théâtre et concert (moins de `rigolo` à IDF 0). Documenter les écarts dans la PR.
6. **Dans le code** (petit changement, PR séparée) : réduire le poids des tags `mood_confiance = basse` dans `scoreOverlapHit` (ex. × 0,5), constante nommée, test à l'appui. Les duels les excluent déjà (brief duels §5.1).

---

## 6. Hors périmètre

- Ajouter une 17e ambiance.
- Afficher les colonnes de preuve ou de confiance dans l'UI.
- Corriger les tags à partir du comportement des utilisateurs (duels perdus en série, etc.) : bonne idée pour plus tard, une fois les duels en production et mesurés.
