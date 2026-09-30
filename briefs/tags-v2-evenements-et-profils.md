# Tags v2 : événements et profils utilisateurs (familles de sortie)

Brief de référence pour l'agent de code. Rédigé le 28/09/2026.
**Remplace** `briefs/tagging-methode-v2.md` (conservé pour l'historique, ne plus l'utiliser).
**À faire avant** `briefs/duels-signal-compare.md` : les duels et le swipe n'ont d'intérêt que si les tags de base sont propres.

Deux chantiers liés :

- **Partie A : taguer les événements** avec une méthode v2, plus riche et plus variée, fondée sur la sociologie des sorties culturelles.
- **Partie B : taguer les profils** : calculer pour chaque utilisateur une **famille de sortie** (17 familles + des badges), affichée avec humour à la fin de la première connexion.

---

## 0. Fondements : ce que disent les données socio françaises

Les axes de tags ci-dessous ne sont pas inventés : chacun répond à un résultat d'enquête. Chiffres issus des publications citées (vérifier sur les PDF originaux avant tout usage public ou marketing).

| Constat | Source | Ce qu'on en fait |
|---|---|---|
| On ne sort pas pour les mêmes raisons : quatre expériences de sortie, **intéressante**, **agréable**, **de partage**, **d'évasion** (50 entretiens, 2021–2022) | Observatoire des politiques culturelles, *Pourquoi sortons-nous ? Quatre expériences de sortie culturelle* | nouvel axe **`sortie`** sur chaque événement (§A2.2) ; il structure les familles (§B2) |
| Les motivations sont souvent **extérieures au spectacle**, surtout la recherche d'une expérience sociale. On y va rarement seul : **8 % seuls**, 37 % en couple, 32 % entre amis, 20 % en famille | DGCA, *La sortie au spectacle vivant* (Repères DGCA, 2012, base DEPS 2008) | axe **`ideal_pour`** (§A2.6) ; badge « Toujours en bande » ; le partage WhatsApp est au cœur du produit |
| En 2023 : **24 %** des Français ont assisté à un concert dans l'année, **14 %** sont allés au théâtre | DEPS, *Chiffres clés 2024*, fiche « Sorties culturelles des Français en 2023 » (Crédoc, oct. 2023) | le spectacle vivant reste minoritaire : l'onboarding doit rassurer et proposer de l'accessible |
| Freins : **prix** (53 % des non-spectateurs de concert, 39 % pour le théâtre) et **manque d'intérêt** (45 % pour le théâtre) | même source | axe **`budget`** calculé (§A2.8), badge « Chasseur de bons plans » ; axe **`exigence`** (§A2.4) pour proposer d'abord ce qui ne demande aucun prérequis |
| Le « manque d'intérêt » et la distance sociale au théâtre : **16 %** des cadres contre **7 %** des employés et ouvriers y sont allés (2018) ; diplôme et catégorie sociale restent les variables les plus discriminantes | DEPS, enquête *Pratiques culturelles* 2018 (9 200 personnes) ; Lombardo & Wolff, *Cinquante ans de pratiques culturelles en France*, 2020 | on **ne collecte pas** la CSP ni le diplôme (§B7) ; l'axe `exigence` sert à ne pas enfermer : on recommande de l'accessible à tout le monde, et du pointu à qui le demande |
| Les goûts se structurent moins en « savant contre populaire » qu'en **éclectisme** : des **omnivores** qui cumulent des genres variés, face à des répertoires plus exclusifs | Coulangeon, *La stratification sociale des goûts musicaux* (RFS, 2003) ; Donnat, *Les pratiques culturelles des Français à l'ère numérique* (2009) | score d'**éclectisme** dans le profil (§B1) ; famille « Couteau suisse » |
| Les publics âgés sont très présents : les 65–74 ans assistant à un spectacle vivant sont passés de 14 % (1981) à **41 %** (2018) | DEPS 2018 | les familles ne supposent aucun âge ; l'humour ne vise jamais l'âge (§B5) |

**Principe qui en découle** : on décrit **ce que les gens cherchent dans une sortie** (expérience, énergie, compagnie, budget, audace), jamais **qui ils sont socialement**. La socio sert à choisir les bons axes, pas à classer les gens par milieu.

---

# PARTIE A : taguer les événements

## A1. Diagnostic actuel (mesuré sur `data/evenements.csv`, `theatre_danse` + `musique`, n = 1 271)

- Théâtre : **213 / 512** lignes taguées n'ont **que** `rigolo` ; `rigolo` = 57 % → IDF 0 dans `inverseMoodWeights` (`src/lib/reco.ts`), donc ce tag ne pèse plus rien.
- Concerts : `festif` = 56 % (50 lignes n'ont que `festif`).
- **500 lignes sans ambiance** (39 %), dont **211** avec une description de plus de 80 caractères.
- 506 lignes à un seul tag, 265 seulement à 2 tags ou plus.
- `mood_confiance` : basse 635, haute 236, moyenne 206, vide 194.
- `mood_source = genre` : 65 lignes, **65 × `rigolo`** (règle mécanique « humour → rigolo ») ; `remap` : 87 lignes dont 65 × `rigolo`.
- 108 lignes avec des ambiances mais `mood_source = vide` ; `sortie` (pas un goût) dans 41 lignes ; séparateur `,` dans 25 lignes.
- Erreurs : `TOM` (théâtre sur le sida en 1986) → `rigolo` ; récital classique `Lio Kuokman / Nelson Goerner` → `rigolo`.
- Doublons : `Xandria + Seven Spires + Tulip` / `… (metal)`, `DJ Pone - 30 ans de Platines` / `… (hip-hop|rap)`, `Primal Fear` / `… (metal)`, `HYPNO5E & HIPPOTRAKTOR` / `… (metal|post-metal)` ; titres qui ne sont qu'une date (`Vendredi 02 octobre 2026 - 20H30`).

**Cause racine** : le tag décrit la **catégorie** au lieu de **l'expérience**. Il n'y a qu'**une** dimension (l'ambiance) pour tout dire, alors elle sature.

## A2. Le modèle v2 : 8 axes par événement

Un événement est décrit sur **8 axes**. Les axes 1 à 6 sont **tagués** (LLM + relecture) ; les axes 7 et 8 sont **calculés**.

| # | Axe (colonne) | Valeurs | Nb | Tagué / calculé |
|---|---|---|---|---|
| 1 | `moods` | 16 ambiances verrouillées | 2–3, ordonnées | tagué |
| 2 | `sortie` | `interessante` · `agreable` · `partage` · `evasion` | 1–2, ordonnées | tagué |
| 3 | `energie` | `1` à `5` | 1 | tagué |
| 4 | `exigence` | `1` · `2` · `3` | 1 | tagué |
| 5 | `format_scene` | voir A2.5 | 1–2 | tagué |
| 6 | `ideal_pour` | `solo` · `couple` · `amis` · `famille` | 1–3 | tagué |
| 7 | `notoriete` | `tete_affiche` · `confirme` · `emergent` · `scene_ouverte` | 1 | tagué (aidé par `casting`, lieu) |
| 8 | `budget`, `jauge` | voir A2.8 | 1 | **calculé**, jamais tagué |

Plus trois colonnes de contrôle : `tag_confiance` (`haute` · `moyenne` · `basse`), `tag_preuve` (citation courte du texte, jamais affichée), `tag_version` (`v2`).

### A2.1 `moods` : les 16 ambiances, mieux utilisées

- **Vocabulaire verrouillé** (`TASTE_MOODS`, `src/lib/phraseTags.ts` : « Do not invent a 17th ») : rigolo, tendre, intense, angoissant, epique, brutal, festif, cerveau, intimiste, absurde, critique, sombre, poetique, dansant, contemplatif, leger. `sortie` n'en fait pas partie.
- **2 ou 3 ambiances**, la principale en premier, séparateur `|` uniquement.
- **`rigolo` jamais seul** : ajouter *quel* rire, parmi `absurde` (non-sens, clown), `critique` (satire), `tendre`, `leger` (boulevard), `cerveau` (humour d'idées), `sombre` (humour noir) ou `intimiste` (seul en scène proche du public).
- **`festif` jamais seul sur un concert** : ajouter l'énergie ou le registre, parmi `dansant`, `intense`, `brutal`, `epique`, `poetique`, `intimiste` ou `contemplatif`.
- `rigolo` **principal** seulement si le rire est le but du spectacle.
- **Plafond de distribution** : aucune ambiance au-dessus de 35 % d'un créneau (théâtre, concert).

### A2.2 `sortie` : l'expérience recherchée (OPC)

| Valeur | Question que se pose le spectateur | Indices dans le texte | Exemples du catalogue |
|---|---|---|---|
| `interessante` | « Je vais apprendre, comprendre, réfléchir » | sujet de société, conférence, texte, création contemporaine, « interroge », « questionne » | L'Esprit d'entreprise, TOM, [R.A.P.] |
| `agreable` | « Je vais passer un bon moment, me détendre » | comédie, boulevard, chanson, « bonne humeur », têtes d'affiche humour | Toc Toc, Kevin Levy, Chanson Soudaine |
| `partage` | « Je vais vivre ça avec d'autres, participer » | bal, jam, scène ouverte, fanfare, « venez nombreux », participatif, danse collective | Jam jazz manouche, En bal et vous !, Cornélius |
| `evasion` | « Je vais décrocher, être transporté ailleurs » | immersif, épique, onirique, voyage, grand spectacle, metal symphonique, opéra | Xandria, Naine Rouge, récital à la bougie |

1 ou 2 valeurs, la principale en premier. C'est l'axe le plus important pour les familles (§B2).

### A2.3 `energie` : de 1 à 5

`1` assis, calme, silence (récital, lecture) · `2` assis, attentif (théâtre de texte) · `3` réactif (comédie, rires, applaudissements) · `4` ça bouge (concert assis-debout, cabaret) · `5` debout, on danse ou on pogote (DJ, metal, bal).

### A2.4 `exigence` : faut-il des clés pour apprécier ?

`1` aucune (grand public, on comprend tout de suite) · `2` un peu de curiosité (création contemporaine accessible, jazz, chanson à texte) · `3` pour initiés (théâtre expérimental, musique improvisée, post-metal, musique contemporaine).

**Usage** : l'onboarding et les profils « Page blanche » reçoivent d'abord du `1`–`2`. On ne pousse du `3` qu'à ceux qui en ont aimé. C'est la réponse produit au frein « manque d'intérêt » (§0).

### A2.5 `format_scene`

`seul_en_scene` · `duo` · `troupe` · `orchestre` · `groupe` · `dj` · `scene_ouverte` · `participatif` · `sans_paroles` (cirque, danse, mime) · `lecture` · `jeune_public`. 1 ou 2 valeurs.

### A2.6 `ideal_pour` (DGCA : on sort rarement seul)

`solo` (on peut y aller seul sans se sentir à part : scène ouverte, jam, lecture) · `couple` (intime, dîner-spectacle, piano-voix) · `amis` (festif, concert, humour) · `famille` (jeune public, tout public). 1 à 3 valeurs.

### A2.7 `notoriete`

`tete_affiche` (tournée nationale, grande salle) · `confirme` · `emergent` (premier album, jeune compagnie) · `scene_ouverte` (amateurs, jam). Indices : `casting`, jauge du lieu, mentions « premier », « révélation », « tournée ».

### A2.8 Calculés (dans le code, jamais par le tagueur)

- **`budget`** depuis `prix` / `gratuit` : `gratuit` · `lt15` · `15_35` · `gt35` · `nc`. Helper `parsePriceEuros` (spécifié dans le brief duels §5.4) : `gratuit` / `entrée libre` → 0 ; sinon premier nombre, virgule décimale acceptée ; sinon `null` → `nc`.
- **`jauge`** depuis `lieux.csv` : `petite` (bar_scene, bar, salle_asso, mjc, cave), `moyenne` (theatre, centre_culturel, smac, salle), `grande` (salle_concert > 1 000 places connue, Halle aux Grains, Zénith, Casino). Table de correspondance `type` → jauge dans le code, surchargeable par lieu (`lieu_id`).

## A3. Où stocker les tags (important)

Le README l'impose déjà pour les films : **un tag posé sur une ligne réécrite par le sync disparaît au sync suivant**. Donc :

- Les tags v2 vivent dans un **fichier durable séparé** : `data/tags_evenements.csv`, **une ligne par œuvre**, clé `event_id`.
- Colonnes : `event_id, moods, sortie, energie, exigence, format_scene, ideal_pour, notoriete, tag_confiance, tag_preuve, tag_version, tagged_at, tagged_by` (`llm` | `manuel`).
- Au chargement (`src/lib/data.ts`), jointure sur `event_id`. Les séances de `programme.csv` héritent des tags de leur événement (même logique que l'héritage des tags de films, `itemInheritsParentMoods`).
- Priorité de lecture pour `moods` : `tags_evenements.csv` (v2) > colonne `moods` actuelle (v1), pour une migration progressive.
- **À vérifier par l'agent** : que `event_id` est stable d'un sync à l'autre. S'il ne l'est pas, proposer une clé stable (titre normalisé + `lieu_id` + `date_debut`) **avant** de taguer quoi que ce soit.
- Films : même principe plus tard dans `films.csv` (hors périmètre de ce lot).

## A4. Consigne de tagging (prompt LLM et guide humain)

Script `scripts/tagEvents.ts` (dev-only). Il lit les événements sans tag v2, appelle un LLM (clés déjà gérées par `src/lib/phraseAi.ts` : `OPENAI_API_KEY` ou `XAI_API_KEY`), valide la sortie et écrit **uniquement** dans `data/tags_evenements.csv`. Options : `--limit`, `--only-missing`, `--event E123`, `--dry-run`.

**Entrée envoyée au modèle** : titre, catégorie, genre, `description_longue` (sinon `description_courte`), `citation`, `casting`, nom et type du lieu, prix. **Jamais** de données utilisateur.

**Prompt système (à reprendre tel quel)** :

> Tu tagues un spectacle vivant à Toulouse pour un moteur de recommandation. Tu décris **l'expérience vécue par le spectateur**, pas la catégorie du spectacle.
> Réponds **uniquement** en JSON valide, au format ci-dessous, avec les valeurs **exactes** autorisées. N'invente aucune valeur.
> - `moods` : 2 ou 3 parmi [rigolo, tendre, intense, angoissant, epique, brutal, festif, cerveau, intimiste, absurde, critique, sombre, poetique, dansant, contemplatif, leger], la principale en premier. Si tu mets rigolo, ajoute quel rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste). Pour un concert, festif n'est jamais seul (ajoute dansant, intense, brutal, epique, poetique, intimiste ou contemplatif). rigolo en premier seulement si le rire est le but du spectacle.
> - `sortie` : 1 ou 2 parmi [interessante, agreable, partage, evasion], la principale en premier.
> - `energie` : entier de 1 (assis, silence) à 5 (debout, on danse).
> - `exigence` : 1 (grand public), 2 (un peu de curiosité), 3 (pour initiés).
> - `format_scene` : 1 ou 2 parmi [seul_en_scene, duo, troupe, orchestre, groupe, dj, scene_ouverte, participatif, sans_paroles, lecture, jeune_public].
> - `ideal_pour` : 1 à 3 parmi [solo, couple, amis, famille].
> - `notoriete` : un parmi [tete_affiche, confirme, emergent, scene_ouverte].
> - `confiance` : haute (l'ambiance principale est **dite** dans le texte), moyenne (déduite avec un indice clair), basse (devinée).
> - `preuve` : une citation **exacte** et courte (moins de 120 caractères) du texte, qui justifie l'ambiance principale.
> Si le texte fait moins de 80 caractères utiles, réponds `{"skip": true}`.

**Format de sortie** :

```json
{"moods":["rigolo","intimiste","tendre"],"sortie":["agreable"],"energie":3,"exigence":1,
 "format_scene":["seul_en_scene"],"ideal_pour":["amis","couple"],"notoriete":"confirme",
 "confiance":"haute","preuve":"Seul en scène, il raconte son histoire, mêlant sketch, stand-up"}
```

**Validation côté script** (rejet et réessai une fois, puis log d'erreur) : valeurs hors enum ; nombre de valeurs hors bornes ; règles `rigolo` / `festif` ; `preuve` absente du texte source (vérification par sous-chaîne après normalisation) ; `confiance: haute` sans preuve.

## A5. Exemples de référence (tirés du catalogue)

| Spectacle | v1 | v2 : moods · sortie · énergie · exigence · format · idéal pour · notoriété |
|---|---|---|
| Kevin Levy : Cocu | `rigolo` | rigolo·intimiste·tendre · agreable · 3 · 1 · seul_en_scene · amis·couple · confirme |
| Toc Toc | `rigolo` | rigolo·absurde·leger · agreable · 3 · 1 · troupe · amis·famille · confirme |
| L'Esprit d'entreprise | `rigolo·absurde·intense` | critique·absurde·rigolo · interessante·agreable · 2 · 2 · troupe · amis · confirme |
| Naine Rouge (théâtro-clownesque, exoplanètes) | `rigolo·poetique` | absurde·poetique·rigolo · evasion·agreable · 3 · 1 · seul_en_scene · famille·amis · emergent |
| TOM (1986, épidémie de sida) | `rigolo` ❌ | intense·tendre · interessante · 2 · 2 · troupe · couple·solo · confirme |
| Lio Kuokman / Nelson Goerner | `rigolo` ❌ | contemplatif·epique · evasion · 1 · 2 · orchestre · couple·solo · tete_affiche |
| Fat Freddy's Drop | `dansant` | dansant·festif · partage · 5 · 1 · groupe · amis · tete_affiche |
| Xandria + Seven Spires + Tulip | `intense·poetique` | epique·intense·poetique · evasion · 5 · 2 · groupe · amis · confirme |
| Hypno5e & Hippotraktor | `intense` | brutal·intense·sombre · evasion · 5 · 3 · groupe · amis·solo · emergent |
| Cornélius (fanfare New Orleans / caraïbes) | `tendre·intimiste·poetique` | festif·poetique·tendre · partage · 4 · 1 · orchestre·participatif · amis·famille · emergent |
| Jam jazz manouche (Maison Blanche) | — | festif·intimiste · partage · 3 · 2 · scene_ouverte · solo·amis · scene_ouverte |
| Superpêche (sax baryton + violoncelle, impro) | — | contemplatif·poetique·cerveau · evasion·interessante · 1 · 3 · duo · solo·couple · emergent |

Ces 12 lignes servent de **tests** pour le script (§A6) et d'exemples dans le prompt (few-shot : en inclure 4, variés).

## A6. Contrôle qualité : `scripts/tagAudit.ts`

Script dev-only, **lecture seule**, sur le modèle de `scripts/recoBench.ts`. À lancer après chaque sync hebdo et chaque passe de tagging. `--out bench-results/<date>-tags.md`, `--compare <fichier>`, `--strict` (sortie non nulle si un seuil est raté).

**Rapport, par créneau (theatre, concert)** : taux de lignes taguées ; nombre moyen d'ambiances ; part et IDF de chaque ambiance ; distribution de chaque axe (`sortie`, `energie`, `exigence`, `format_scene`, `ideal_pour`, `notoriete`) ; répartition des confiances.

**Seuils** :

| Règle | Cible |
|---|---|
| Aucune ambiance > 35 % d'un créneau | obligatoire |
| Lignes avec ≥ 2 ambiances | ≥ 90 % des lignes taguées v2 |
| Lignes taguées parmi celles qui ont ≥ 80 caractères de texte | ≥ 90 % |
| Ambiances utilisées ≥ 10 fois dans le vivant | ≥ 12 sur 16 |
| Chaque valeur de `sortie` | entre 10 % et 45 % |
| `energie` | au moins 3 niveaux à ≥ 10 % par créneau |
| `tag_confiance = basse` | ≤ 20 % |

**Erreurs bloquantes, listées ligne à ligne** : valeur hors enum ; `rigolo` seul ; `festif` seul sur un concert ; `rigolo` principal sans indice d'humour dans le texte (regex `humou?r|rire|drôle|comédie|hilar|stand|sketch|burlesque|clown|cabaret|impro|comique`) ; `preuve` introuvable dans le texte ; doublons (même `lieu_id`, même date, titre normalisé préfixe de l'autre) ; titre qui n'est qu'une date ; tags v1 incohérents avec v2 sur la même œuvre.

**Gold set** : 60 spectacles tirés au hasard (graine fixe, 30 théâtre, 30 concerts), tagués **à la main** par Eloi selon §A4, dans `scripts/fixtures/tag-gold.json`. Mesures : ambiance principale identique ≥ 70 % ; Jaccard moyen des ambiances ≥ 0,5 ; `sortie` principale identique ≥ 70 % ; `energie` à ±1 près ≥ 85 %. En dessous, on corrige le prompt **avant** de taguer tout le catalogue.

## A7. Code côté app (événements)

1. `src/lib/types.ts` : type `EventTagsV2` (tous les axes, optionnels).
2. `src/lib/data.ts` : chargement tolérant de `data/tags_evenements.csv` (fichier absent → aucun tag v2, rien ne casse) et jointure.
3. `src/lib/eventTags.ts` (nouveau, pur) : `eventTagsOf(item: DayItem): EventTagsV2` avec héritage programme → événement ; `budgetOf(item)` ; `jaugeOf(item)` ; `axesTagsOf(item): string[]` qui renvoie des clés **namespacées** (`sortie:evasion`, `energie:5`, `exigence:1`, `format:groupe`, `pour:amis`, `noto:emergent`, `budget:lt15`, `jauge:petite`), utilisées par les profils (§B1).
4. `src/lib/reco.ts` : lire les `moods` v2 en priorité ; **multiplier par 0,5** la contribution des ambiances `tag_confiance = basse` (constante nommée `LOW_CONFIDENCE_MOOD_FACTOR`, test à l'appui). Aucun autre changement de scoring dans ce lot.
5. Tests `src/lib/eventTags.test.ts` (ajouté au script `test` de `package.json`) : héritage, jointure, fichier absent, budget (cas réels : `Tarif unique : 28€` → `15_35`, `25,80 € Prévente` → `15_35`, `entrée libre 5 euros conseillés` → `gratuit`, `''` → `nc`), jauge par type de lieu.

---

# PARTIE B : taguer les profils (familles de sortie)

## B1. Le vecteur de profil

Le `TasteProfile` actuel (`src/lib/signals.ts`) garde `moods`, `genres`, `themes`, `cats`, `communes`. On ajoute **un seul** bucket générique :

```ts
axes: Record<string, TasteEntry>; // clés namespacées : 'sortie:evasion', 'energie:5', 'budget:gratuit', …
```

- Alimenté exactement comme `moods` : quand un signal qui écrit des goûts (`favorite`, `reserve`, `share`, `open_card`, duels…) concerne un événement, on ajoute `axesTagsOf(item)` au signal (nouveau champ optionnel `axes?: string[]` sur `Signal` / `TrackPayload`), puis `applySignalToProfile` fait `addWeight(profile.axes, key, w)`.
- **Mêmes invariants** que les autres buckets : pas de poids négatif, un 0 veut dire « retiré par l'utilisateur », `coerceProfile` tolère l'absence de `axes` (anciens profils), `sanitizeTasteProfile` filtre les clés hors namespaces connus.
- Contrôler la taille du cookie de profil (`COOKIE_BUDGET = 3200` dans `accountTasteStore.ts`) : `axes` compte au plus environ 40 clés. Si ça déborde, ne garder que les N plus fortes dans le cookie ; Postgres garde tout.

À partir de `moods`, `cats`, `communes` et `axes`, une fonction pure calcule les **features** (toutes entre 0 et 1) :

| Feature | Calcul |
|---|---|
| `mood.<m>` (16) | `pct` de l'ambiance |
| `sortie.<s>` (4) | part de chaque valeur dans `axes` |
| `energie` | moyenne pondérée des `energie:n`, ramenée à [0, 1] |
| `exigence` | idem pour `exigence:n` |
| `format.<f>`, `pour.<p>`, `noto.<n>`, `budget.<b>`, `jauge.<j>` | parts |
| `cat.theatre`, `cat.concert`, `cat.famille` | parts de `cats` |
| `eclectisme` | entropie de Shannon normalisée sur `moods` et `cats` (0 = un seul registre, 1 = tout à égalité) : le **score d'omnivorisme** (Coulangeon) |
| `communes` | nombre de communes distinctes avec un poids > 0 |
| `masse` | somme des poids positifs (quantité d'information disponible) |

## B2. Les 17 familles

Chaque famille = un **prototype** (poids sur les features), un nom drôle et neutre en genre, une punchline, ce qu'on va proposer, et 2 spectacles du catalogue pour la tester.

| id | Nom affiché | Expérience (OPC) | Prototype (features dominantes) | Punchline | Pour la tester |
|---|---|---|---|---|---|
| `billet_ailleurs` | Billet pour ailleurs | évasion | sortie.evasion, mood.epique, mood.contemplatif, energie basse | « Tu sors pour décoller. Ton canapé ne te reconnaît plus. » | récital à la bougie, Lio Kuokman |
| `mur_du_son` | Mur du son | évasion | sortie.evasion, mood.intense, mood.brutal, energie 5, cat.concert | « Tu mesures une bonne soirée en acouphènes. » | Primal Fear, Hypno5e |
| `tete_en_orbite` | Tête en orbite | évasion | mood.absurde, mood.poetique, format.sans_paroles | « Clowns, exoplanètes et non-sens : tu préfères quand ça part en vrille. » | Naine Rouge, Puppetmastaz |
| `boule_a_facettes` | Boule à facettes | partage | sortie.partage, mood.dansant, mood.festif, energie 5, format.dj | « Tu juges un concert au nombre de pas de danse par minute. » | DJ Pone, Fat Freddy's Drop |
| `fanfare_ambulante` | Fanfare ambulante | partage | sortie.partage, format.participatif, budget.gratuit, mood.festif | « Si ça se chante en chœur et que c'est gratuit, tu y es déjà. » | Cornélius, En bal et vous ! |
| `pilier_de_jam` | Pilier de jam | partage | format.scene_ouverte, noto.scene_ouverte, jauge.petite, pour.solo | « Tu connais le guitariste, le bassiste et le prénom du chien du patron. » | Jam jazz manouche, Open Mic Night |
| `tribu_du_mercredi` | Tribu du mercredi | partage | pour.famille, cat.famille, format.jeune_public | « Tes sorties sont validées par un comité de moins de 12 ans. » | spectacles jeune public |
| `machine_a_rire` | Machine à rire | agréable | mood.rigolo, mood.leger, format.seul_en_scene, noto.tete_affiche | « Ton abdo préféré, c'est celui qui travaille quand tu ris. » | Kevin Levy, Pierre-Emmanuel Barré |
| `portes_qui_claquent` | Portes qui claquent | agréable | mood.rigolo, mood.leger, format.troupe, cat.theatre | « Quiproquos, amants dans le placard : tu es chez toi. » | Toc Toc, Un grand cri d'amour |
| `coeur_en_velours` | Cœur en velours | agréable | mood.tendre, mood.intimiste, pour.couple, energie basse | « Piano-voix, bougies, chanson : tu sors pour être touché·e, et tu assumes. » | Louis Cattelat, Schooet |
| `plumes_et_paillettes` | Plumes et paillettes | agréable | mood.festif, mood.rigolo, genre cabaret, energie 4 | « La vie est trop courte pour les soirées beiges. » | Willkommen mes amours, Maudite répétition |
| `neurones_en_ebullition` | Neurones en ébullition | intéressante | sortie.interessante, mood.cerveau, mood.critique | « Tu sors avec trois idées et un débat pour le métro. » | L'Esprit d'entreprise |
| `grand_frisson` | Grand frisson | intéressante | mood.sombre, mood.intense, mood.angoissant, cat.theatre | « Les histoires qui secouent ne te font pas peur. Prévois les mouchoirs. » | TOM |
| `poete_de_poche` | Poète de poche | intéressante | mood.poetique, mood.intimiste, format.lecture, jauge.petite | « Lectures, slam, petites salles : tu aimes les mots qui chuchotent. » | [R.A.P.], Bienvenue à la Bouqala d'Alger |
| `radar_a_pepites` | Radar à pépites | intéressante | noto.emergent, exigence haute | « Tu as vu le groupe avant qu'il passe à la radio. Et tu le fais savoir. » | Superpêche, Hypno5e |
| `couteau_suisse` | Couteau suisse | (toutes) | **règle** : eclectisme ≥ 0,8 et masse ≥ 30 | « Opéra le mardi, metal le jeudi : ton agenda est une playlist aléatoire. » | — |
| `page_blanche` | Page blanche | — | **règle** : masse < 12 | « On ne te connaît pas encore. Et ça, c'est plutôt excitant. » | — |

Les prototypes chiffrés vont dans `src/lib/profileFamilies.ts` (`FAMILIES`), **une seule source de vérité**. Poids de départ : 1,0 sur les features principales listées, 0,5 sur les secondaires ; réglés ensuite par les tests et le banc (§B6).

## B3. Les badges (pour avoir « plein » de profils)

Une famille + **0 à 2 badges** donne des centaines de combinaisons (« Machine à rire · Noctambule · Chasseur de bons plans »).

| id | Badge | Condition (features) |
|---|---|---|
| `malin_gratuit` | Chasseur de bons plans | `budget.gratuit + budget.lt15 ≥ 0,5` |
| `noctambule` | Noctambule | ≥ 50 % des spectacles aimés commencent à 21 h 30 ou plus tard (feature `heure_tardive`, à ajouter dans `axes` : `heure:tard`) |
| `toujours_en_bande` | Toujours en bande | `pour.amis ≥ 0,5` **ou** au moins 3 liens partagés avec au moins une réponse « J'y vais » (données `shareActivity`, comptage seulement) |
| `solo_assume` | Solo assumé | `pour.solo ≥ 0,4` |
| `globe_trotter` | Globe-trotter de la métropole | `communes ≥ 4` |
| `premier_rang` | Premier rang | `noto.tete_affiche ≥ 0,5` |
| `petites_salles` | Amoureux·se des petites salles | `jauge.petite ≥ 0,5` |
| `derniere_minute` | Dernière minute | ≥ 50 % des favoris posés le jour même du spectacle |
| `omnivore_en_herbe` | Omnivore en herbe | `0,6 ≤ eclectisme < 0,8` (et famille ≠ `couteau_suisse`) |

Au plus 2 badges affichés : les deux dont la condition est le plus largement dépassée.

## B4. Algorithme d'attribution (pur, testable)

```
features = profileFeatures(profile)
si features.masse < 12                                          → page_blanche
si features.eclectisme ≥ 0,8 et features.masse ≥ 30             → couteau_suisse
sinon, pour chaque famille f à prototype :
    score(f) = cos(features, prototype(f))                      // similarité cosinus
famille = argmax score
tendance = 2e meilleure famille si score2 ≥ 0,85 × score1       // « Machine à rire, tendance Cœur en velours »
confiance = score1 − score2
```

- **Stabilité (hystérésis)** : on ne change la famille stockée que si le nouveau meilleur score est ≥ 1,15 × le score de la famille actuelle. Évite qu'un utilisateur change de famille à chaque clic.
- Recalcul à chaque écriture de profil (`commitTasteSignals`), résultat stocké dans l'état : `family: { id, tendance?, badges[], score, computedAt, override? }`.
- **Retour utilisateur** : bouton « C'est tout moi » (confirme) et « Pas du tout » (propose les 3 familles suivantes ; le choix est stocké dans `override`). `override` est gardé tant que le score de la famille choisie reste ≥ 0,6 × le meilleur score, puis on reprend le calcul. Ces retours **n'écrivent pas** de goûts (kind `family_feedback`, non taste-writing), mais sont précieux pour régler les prototypes.
- Les invités (`vid`) ont une famille calculée **côté client** à partir de leur store local. Rien n'est joint entre `vid` et compte (règle `assertNoVidAccountJoin`).

## B5. L'écran « Ton profil de sortie » (fin de première connexion)

Déclenché à la fin de l'onboarding (choix d'ambiances ou 5 duels), puis consultable dans « Mes goûts ».

**Contenu, dans l'ordre** :

1. Petit titre : `Ton profil de sortie`
2. Nom de la famille, en grand (serif) : `Machine à rire`
3. Punchline : `Ton abdo préféré, c'est celui qui travaille quand tu ris.`
4. Tendance, si elle existe : `tendance Cœur en velours`
5. Badges (pastilles) : `Noctambule` · `Chasseur de bons plans`
6. Trois traits en barres (les 3 features les plus fortes, en langage humain) : `Rire`, `Passer un bon moment`, `Seul en scène`
7. `Ce qu'on va te proposer cette semaine` : 3 cartes de spectacles réels, les meilleurs scores de `recommendForProfile`
8. Boutons : `C'est tout moi` · `Pas du tout` · `Partager mon profil` (lien WhatsApp avec image de partage générée par la route OG existante `src/app/api/og`)

**Règles d'humour** (à respecter dans toute copie de famille ou de badge) :

- Tutoiement, bienveillant, **on rit avec** la personne, jamais d'elle.
- **Jamais** sur l'âge, le genre, l'origine, le milieu social, le revenu, le physique ou la santé. « Chasseur de bons plans » valorise ; « radin » ou tout libellé qui renvoie aux moyens de la personne est interdit.
- Un seul trait d'humour par écran (la punchline). Le reste est clair et utile.
- Neutre en genre : noms de familles sans personne genrée (« Machine à rire », pas « Le rieur ») ; point médian quand c'est inévitable (`touché·e`).
- Aucune donnée technique à l'écran (pas de score, pas de slug, pas de pourcentage brut).
- `Page blanche` doit donner envie, pas culpabiliser : proposer 3 duels de plus (lien vers les duels).

## B6. Tests et réglage

`src/lib/profileFamilies.test.ts` (ajouté au script `test`) :

1. **Profils synthétiques** : pour chaque famille, un profil construit à la main (ex. `mur_du_son` : moods intense 40 / brutal 30, `energie:5`, `cat.concert`) → la famille attendue sort en premier.
2. **Chaque famille est atteignable** (aucun prototype dominé par un autre).
3. `masse < 12` → `page_blanche` ; éclectisme élevé → `couteau_suisse`.
4. Hystérésis : un petit signal ne fait pas changer de famille ; un gros changement, oui.
5. `override` respecté, puis abandonné quand le profil diverge trop.
6. Badges : chaque condition testée aux bornes ; au plus 2 badges.
7. Aucun texte de famille ou de badge ne contient de mot de la liste interdite (`radin`, `vieux`, `jeune`, `pauvre`, `riche`, `bobo`, `beauf`…).
8. Profil ancien sans `axes` → pas d'erreur, famille calculée sur les ambiances seules.

**Banc** : étendre `scripts/recoBench.ts` (ou nouveau `scripts/familyBench.ts`) pour sortir la famille de chacun des 25 profils Eloi25. Cibles : au moins 8 familles différentes, aucune famille > 30 % des profils, `page_blanche` ≤ 10 %. Joindre le tableau à la PR.

## B7. Vie privée (non négociable)

- **Aucune** donnée socio-démographique collectée ni déduite : pas d'âge, de CSP, de diplôme, de revenu, de genre. Les familles décrivent des **goûts de sortie**, calculés depuis les actions dans l'app.
- La famille est un **profilage** au sens RGPD : on l'annonce sur `/confidentialite` (ce qui est calculé, à quoi ça sert, comment le modifier ou le supprimer), elle est **visible** et **modifiable** par l'utilisateur (§B5), et elle est supprimée avec le profil.
- Toute analyse **agrégée** des familles (statistiques, « 30 % de ton public est Intimiste » pour les salles) : comptes connectés uniquement, jamais de `vid`, jamais d'export nominatif. C'est une nouvelle finalité à ajouter sur `/confidentialite` **avant** de la lancer.

---

## C. Ordre de réalisation (PR)

| # | PR | Contenu | Condition pour merger |
|---|---|---|---|
| 1 | Audit | `scripts/tagAudit.ts` + tests ; rapport « avant » committé (`bench-results/2026-09-xx-tags.md`) | `npm test` vert |
| 2 | Stockage v2 | `data/tags_evenements.csv` (vide + en-têtes), types, `data.ts`, `eventTags.ts` + tests | aucun changement visible ; bench identique |
| 3 | Gold set | `scripts/fixtures/tag-gold.json` (60 lignes, **tagué à la main par Eloi**) | revue humaine |
| 4 | Tagger | `scripts/tagEvents.ts` + validation ; passe sur les 12 exemples §A5 puis sur le gold set | seuils gold §A6 atteints |
| 5 | Tagging complet | passe sur tout le vivant, correction manuelle des erreurs bloquantes | `tagAudit --strict` vert |
| 6 | Reco | lecture v2 + facteur confiance basse | `npm run bench -- --compare …` : plus de variété, pas de régression de slots |
| 7 | Profils | bucket `axes`, `profileFamilies.ts`, badges + tests + banc familles | cibles §B6 |
| 8 | UI | écran « Ton profil de sortie » derrière `NEXT_PUBLIC_PROFILE_FAMILY=1` ; mise à jour de `/confidentialite` | relecture copie (§B5) |
| 9 | Duels | `briefs/duels-signal-compare.md` (qui utilisera aussi `sortie`, `energie`, `exigence` comme axes de paires) | selon ce brief |

Chaque PR : `npm run lint`, `npm test`, `npm run build` verts avant push. Aucune écriture dans `data/evenements.csv` ni `data/programme.csv` : les tags v2 vont **uniquement** dans `data/tags_evenements.csv`.

## D. Hors périmètre

- 17e ambiance.
- Tags v2 des films (`films.csv`) : même méthode, lot suivant.
- « Les gens comme toi ont aimé » (filtrage collaboratif).
- Correction automatique des tags à partir du comportement des utilisateurs.

## Sources

- DEPS, *Chiffres clés 2024*, fiche « Sorties culturelles des Français en 2023 » : https://www.culture.gouv.fr/Media/medias-creation-rapide/chiffres-cles-2024_deps_sorties-culturelles-des-francais-en-2023_fiche.pdf
- DEPS, enquête *Pratiques culturelles* 2018 : https://www.culture.gouv.fr/espace-documentation/service-statistique-ministeriel-deps/l-enquete-pratiques-culturelles
- Lombardo & Wolff, *Cinquante ans de pratiques culturelles en France*, Culture études 2020-2 : https://www.culture.gouv.fr/Sites-thematiques/Etudes-et-statistiques/Publications2/Collections-de-synthese/Culture-etudes-2007-2020/Cinquante-ans-de-pratiques-culturelles-en-France-CE-2020-2
- Observatoire des inégalités, sorties culturelles selon les catégories sociales : https://www.inegalites.fr/Les-sorties-culturelles-different-selon-les-categories-sociales-et-les-revenus
- DGCA, *La sortie au spectacle vivant* : https://www.culture.gouv.fr/Media/Documentation/Documentation-scientifique-et-technique/La-sortie-au-spectacle-vivant
- Observatoire des politiques culturelles, *Pourquoi sortons-nous ? Quatre expériences de sortie culturelle* : https://www.observatoire-culture.net/etude-quatre-experiences-sortie-culturelle/
- Coulangeon, *La stratification sociale des goûts musicaux*, Revue française de sociologie, 2003 : https://shs.cairn.info/revue-francaise-de-sociologie-1-2003-1-page-3?lang=fr
- Donnat, *Les pratiques culturelles des Français à l'ère numérique*, La Découverte, 2009 : https://www.editionsladecouverte.fr/les_pratiques_culturelles_des_francais_a_l_ere_numerique-9782707158000
