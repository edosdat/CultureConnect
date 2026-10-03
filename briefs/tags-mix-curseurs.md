# Tags pour « Ton mix » : 5 curseurs d'humeur

> **Statut : EN ATTENTE** du GO de Katia et Steph sur la nouvelle grille de tags. Ne pas coder : la table `MOOD_TO_FADER` changera avec leur grille.

Brief pour l'agent de code. Rédigé le 03/10/2026. Complète `tags-v2-evenements-et-profils.md` et `tags-v2-addendum-ponderation.md`, sans les remplacer.

## 0. Contexte

Nouvel écran à venir : « Ton mix de ce soir » (maquette Plan C, page « Mood du moment », 5.1). L'utilisateur règle 5 curseurs d'humeur, partant de son profil, et voit 10 plans se reclasser en direct. **Ce brief ne demande aucun écran.** Il prépare les données pour que les curseurs départagent vraiment les plans.

Mesure sur `data/evenements.csv` (œuvres vivantes à venir au 03/10, moods v1) :

| | Valeur | Conséquence pour le mix |
|---|---|---|
| Œuvres avec un seul mood | 418 / 542 (77 %) | trois comédies ont la même forme « Rire seul » : ex æquo |
| Œuvres qui touchent un seul curseur | 439 / 542 (81 %) | idem |
| Œuvres touchant le curseur Cérébral | 30 / 542 (5,5 %) | curseur presque vide |
| Films à venir avec au moins un mood | 23 / 163 (14 %) | le ciné ne bouge pas avec les curseurs |

Le tagueur v2 de #173 demande déjà 2 ou 3 moods classés + `confiance` : il corrige l'essentiel **quand il aura tourné** (`data/tags_evenements.csv` est vide sur `main`). Ce brief ajoute ce qui manque pour le mix, rien de plus.

## 1. M1 : fonction `mixFadersOf` (faisable tout de suite)

Nouveau fichier `src/lib/mixFaders.ts`, fonction pure, testée, branchée nulle part.

```ts
export const MIX_FADERS = ['rire', 'frisson', 'emotion', 'fete', 'cerebral'] as const;
export type MixFader = (typeof MIX_FADERS)[number];

/** Les 16 TASTE_MOODS, chacun dans un seul curseur. `sortie` n'est pas un goût : ignoré. */
export const MOOD_TO_FADER: Record<TasteMood, MixFader> = {
  rigolo: 'rire', absurde: 'rire', leger: 'rire',
  intense: 'frisson', angoissant: 'frisson', sombre: 'frisson', brutal: 'frisson', epique: 'frisson',
  tendre: 'emotion', poetique: 'emotion', intimiste: 'emotion', contemplatif: 'emotion',
  festif: 'fete', dansant: 'fete',
  cerveau: 'cerebral', critique: 'cerebral',
};

/** Valeurs 0..1 par curseur. */
export function mixFadersOf(item: DayItem): Record<MixFader, number>;
```

Règles :

1. **Source** : `eventTagsOf(item).moods` (v2) d'abord. Sans ligne v2, les `moods` v1 de l'item, et le résultat porte `source: 'v1'` (ajouter ce champ au retour si besoin : `{ faders, source: 'v2' | 'v1' | 'none' }`).
2. **Poids d'un mood** = poids de rang × poids de confiance, **les mêmes constantes** que l'addendum pondération (`RANK_WEIGHTS = [1, 0.6, 0.3]`, `CONFIDENCE_WEIGHTS` haute 1 / moyenne 0,8 / basse 0,5). Si elles n'existent pas encore dans le code, les créer dans `eventTags.ts` et les importer ici : **une seule définition** pour la reco et le mix.
3. **Valeur d'un curseur** = le **max** des poids de ses moods (pas la somme : trois moods de Rire ne font pas un « super Rire »).
4. **Cérébral, appoint** : si `exigence = 3`, Cérébral vaut au moins 0,4 (`exigence = 2` : au moins 0,2). C'est le seul axe v2 utilisé en plus des moods. Pas d'autre dérivation.
5. Pas de mood → tous les curseurs à 0, `source: 'none'`. Jamais de valeur inventée.

Tests (`src/lib/mixFaders.test.ts`), au minimum :

- les 16 `TASTE_MOODS` ont exactement un curseur ; `sortie` est ignoré ;
- `['rigolo','absurde']` confiance haute → rire 1, rien d'autre au-dessus de 0 ;
- `['tendre','rigolo','cerveau']` confiance moyenne → émotion 0,8, rire 0,48, cérébral 0,24 ;
- `exigence = 3` sans `cerveau` → cérébral 0,4 ;
- item sans tags → tout à 0, `source: 'none'`.

## 2. M2 : mesures dans `tags:audit` (rapport, non bloquant)

Ajouter une section « Mix » au rapport de `scripts/tagAudit.ts`, calculée sur les œuvres vivantes à venir **et** séparément sur les films :

| Mesure | Cible de départ (à revoir après la 1ʳᵉ mesure v2) |
|---|---|
| Part des œuvres qui touchent ≥ 2 curseurs (valeur > 0,2) | ≥ 60 % |
| Part des œuvres par curseur | chaque curseur ≥ 8 % ; Cérébral le plus surveillé |
| Ex æquo : sur les 5 mix prêts ci-dessous, nombre de paires de plans à vecteur identique dans le top 10 de la semaine | ≤ 2 par mix |
| Films à venir avec `source ≠ 'none'` | ≥ 80 % avant de mettre le ciné dans le mix |

Mix prêts (vecteurs rire, frisson, émotion, fête, cérébral) : fou rire `[.95,.05,.2,.6,.1]`, qui secoue `[.05,.95,.4,.2,.6]`, tout doux `[.2,0,.95,0,.4]`, ça va danser `[.4,.1,.1,1,0]`, profil type `[.8,.2,.6,.5,.3]`. Classement par cosinus, comme dans la maquette.

**Non bloquant** : ces chiffres s'affichent, ils ne font pas échouer `--strict`. On décidera des seuils bloquants après la première passe v2.

## 3. M3 : tagueur et gold set (dans les tickets existants, pas de nouveau ticket)

- **Prompt du tagueur (#173) : ne rien changer.** « 2 ou 3 moods, la principale en premier » suffit. Ne pas pousser l'agent à remplir des curseurs : un mood sans preuve dans le texte est pire qu'un curseur vide.
- **Gold set (C1, #176)** : ajouter au CSV de relecture une colonne `curseurs_ok` (oui / non / commentaire) où l'humain dit si le vecteur `mixFadersOf` lui paraît juste. Le rapport `--eval-gold` donne le taux de `oui`.
- **Films** : vérifier que le chemin film (`filmTags.ts`, `backfillFilmTags.ts`) produit lui aussi 2 ou 3 moods ordonnés + une confiance. Si non, l'écrire dans `briefs/README.md` en **Bloqué** avec ce qui manque ; ne pas brancher le tagueur v2 sur les films sans GO.

## 4. Hors périmètre

- Aucun écran, aucune route, aucun changement de la reco ou de son score (règle de la feuille de route : jamais deux changements de scoring dans le même banc).
- Pas de note 0 à 3 par curseur demandée au tagueur : c'est l'étape suivante **seulement si** la mesure « ex æquo » reste mauvaise après la passe v2. À spécifier, ne pas coder.

## 5. Ordre et critères

| Ticket | Dépend de | Critère de merge |
|---|---|---|
| M1 `mixFadersOf` + constantes de pondération partagées | — | tests verts, `tsc` sans nouvelle erreur |
| M2 section « Mix » de `tags:audit` | M1 | rapport généré sur `main`, chiffres v1 actuels du même ordre que le tableau §0 (77 % / 81 % / 5,5 % / 14 %) ; tout écart de plus de 5 points est expliqué dans la PR (seuil 0,2, dédoublonnage par œuvre) |
| M3 colonne `curseurs_ok` + vérif films | M1, C1 | colonne présente, statut films écrit dans `briefs/README.md` |

Une PR par ticket. Mettre à jour `briefs/README.md` à chaque PR.
