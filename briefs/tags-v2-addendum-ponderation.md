# Addendum au brief tags v2 : pondération des tags par rang

Complète `briefs/tags-v2-evenements-et-profils.md` (28/09/2026). À intégrer au dev en cours, en priorité sur la PR 6 (reco) et la PR 7 (profils). Rien ne change pour le tagueur : il ordonne déjà ses tags, la principale en premier.

## 1. La règle

Le poids d'un tag vient de **sa position** et de **la confiance** de la ligne. Aucune note libre n'est demandée au LLM.

```ts
// src/lib/eventTags.ts
export const RANK_WEIGHTS = [1, 0.6, 0.3] as const;              // 1er, 2e, 3e
export const CONFIDENCE_WEIGHTS = { haute: 1, moyenne: 0.8, basse: 0.5 } as const;
export const EXTRA_TAG_WEIGHT = 0.3; // tag hors champ v2 (déduit du texte, hérité v1…)

export function rankWeight(index: number): number; // index ≥ 3 → EXTRA_TAG_WEIGHT
export function confidenceWeight(c?: string): number; // vide/inconnu → 0.5
export function tagWeight(index: number, confidence?: string): number; // produit des deux
```

Exemple : Kevin Levy, `rigolo|intimiste|tendre`, confiance haute → rigolo 1 · intimiste 0,6 · tendre 0,3.

**Remplace** `LOW_CONFIDENCE_MOOD_FACTOR` (§A7.4 du brief) : la confiance passe désormais par `CONFIDENCE_WEIGHTS` (basse = 0,5, même valeur).

## 2. S'applique à

- `moods` (2–3 valeurs).
- Axes multi-valeurs : `sortie`, `format_scene`, `ideal_pour`.
- **Pas** aux axes à valeur unique (`energie`, `exigence`, `notoriete`) ni aux axes calculés (`budget`, `jauge`) : ceux-là ont un poids de 1 × la confiance.

## 3. Ce qui change dans le code

### 3.1 Garder l'ordre

- `eventTagsOf(item)` renvoie les listes **dans l'ordre du fichier** `tags_evenements.csv`, sans les trier.
- `tasteTagsFromDayItem` (`signals.ts`) : mettre les ambiances v2 **en premier, dans leur ordre**. Les ambiances ajoutées ensuite par `extractMoods` / `parsePhraseRules` (déduites du texte) viennent après et prennent `EXTRA_TAG_WEIGHT`.
- Le dédoublonnage `[...new Set(...)]` conserve l'ordre d'insertion : c'est suffisant. Ne pas le remplacer par un tri.

### 3.2 Transporter le poids dans le signal

Sur `Signal` et `TrackPayload` (`signals.ts`), ajouter deux champs optionnels :

```ts
tagConfidence?: 'haute' | 'moyenne' | 'basse';
v2MoodCount?: number; // nombre d'ambiances issues du champ v2 en tête de `moods`
```

- Renseignés côté client à partir de `eventTagsOf(item)` au moment de fabriquer le payload.
- `makeSignal` les recopie ; un signal ancien (sans ces champs) reste valide.
- Pour les signaux existants ou sans v2 : tous les tags au poids 1, comme aujourd'hui (non-régression).

### 3.3 Profil : `applySignalToProfile`

```ts
for (const [i, m] of signal.moods.entries()) {
  if (!isTasteMood(m)) continue;
  const w = signal.v2MoodCount == null
    ? signal.weight                                   // ancien signal : inchangé
    : signal.weight * (i < signal.v2MoodCount ? tagWeight(i, signal.tagConfidence) : EXTRA_TAG_WEIGHT);
  addWeight(profile.moods, m, w);
}
```

Même logique pour `profile.axes` avec les clés namespacées de `sortie:`, `format:`, `pour:` (rang dans leur propre liste).

Attention au cas négatif (`unfavorite` −6, duels perdus) : la pondération s'applique pareil. Un `unfavorite` doit **annuler exactement** le `favorite` correspondant, donc il doit porter les mêmes `v2MoodCount` / `tagConfidence`. Test obligatoire.

### 3.4 Reco : `scoreOverlapHit` (`reco.ts`)

Pour chaque ambiance de l'item, multiplier les points par `tagWeight(rang dans les moods v2 de l'item, confiance)` :

```ts
const pts = (pct / 100) * weights[bucket] * idfMul * itemTagWeight(item, slug);
```

- `itemTagWeight` renvoie 1 pour les genres et thèmes, et pour un item sans tags v2 (non-régression).
- L'IDF (`inverseMoodWeights`) continue de compter la **présence** d'une ambiance, sans pondération : on ne change pas deux choses à la fois.

### 3.5 Duels (`briefs/duels-signal-compare.md`)

- Dans `duelPayloads`, chaque tag du différentiel garde son rang **dans son propre spectacle** : on transmet l'ordre et `tagConfidence`, et `applySignalToProfile` fait le reste.
- Dans `pickDuelPair`, le score d'information devient `Σ idf(m) × tagWeight(m) × incertitude(m)` : un duel dont la seule différence est une 3ᵉ ambiance apprend peu.

### 3.6 Familles de profils

Rien à changer dans `profileFamilies.ts` : les features sont calculées à partir du profil, qui est déjà pondéré.

## 4. Tests à ajouter

1. `rankWeight` / `confidenceWeight` / `tagWeight` : valeurs exactes, index ≥ 3, confiance vide.
2. Favori sur `rigolo|intimiste|tendre` (haute) → +6 / +3,6 / +1,8 dans `profile.moods`.
3. Même favori en confiance basse → +3 / +1,8 / +0,9.
4. `favorite` puis `unfavorite` sur la même fiche → profil revenu exactement à l'état initial.
5. Signal ancien sans `v2MoodCount` → comportement strictement identique à avant (test de non-régression sur un profil figé).
6. Ambiance ajoutée par `extractMoods` après les v2 → `EXTRA_TAG_WEIGHT`.
7. `scoreOverlapHit` : à profil égal, un spectacle où l'ambiance du profil est **principale** score plus haut qu'un spectacle où elle est **3ᵉ**.
8. Axes : `sortie: evasion|interessante` → `sortie:evasion` +w, `sortie:interessante` +0,6 w.
9. Duels : le différentiel conserve le rang d'origine de chaque tag.

## 5. Vérification

- `npm test`, `npm run lint` et `npm run build` verts.
- `npm run bench -- --compare bench-results/2026-09-27-eloi25-b3b.json` **avant et après** cet addendum, sortie jointe à la PR. Attendu : pas de perte de slots remplis ; des raisons « Pour toi » plus souvent tirées de l'ambiance principale.
- Les constantes `RANK_WEIGHTS` et `CONFIDENCE_WEIGHTS` sont des points de départ : on les règle avec le banc, jamais au cas par cas dans les données.
