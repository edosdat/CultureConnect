# Duels « plutôt A ou B ? » — signal `duel_*` et tirage des paires

Brief pour l'agent de code. Rédigé le 28/09/2026 après lecture de `src/lib/signals.ts`, `src/lib/reco.ts`, `src/lib/pourToi.ts`, `src/lib/shareRsvp.ts` et `data/evenements.csv`.

Maquettes (écrans A et B, deuxième rangée) : https://claude.ai/artifact/VNovLmaDjewsNqWy91RVq3

---

## 1. Objectif

Apprendre les goûts plus vite et plus précisément qu'avec des likes isolés. On montre **deux spectacles vivants du même soir** et l'utilisateur choisit : A, B, **Les deux** ou **Aucun des deux**.

- Un like isolé mélange « j'aime ce spectacle » et « je like facilement ». Un choix A contre B mesure une **préférence relative**.
- Seules les **différences** entre A et B nous apprennent quelque chose. Les tags communs aux deux ne comptent pas.
- Le résultat alimente le **même** `TasteProfile` que les autres signaux (`favorite`, `open_card`…), donc `recommendForProfile` en profite sans autre changement.

Hors périmètre de ce brief (voir §10) : les profils types (clustering), le « les gens comme toi ont aimé », un bucket « je n'aime pas », le nettoyage des tags.

---

## 2. Ce qui existe déjà (à réutiliser, ne pas dupliquer)

| Besoin | Existant | Où |
|---|---|---|
| Types de signal et poids | `SignalKind`, `SIGNAL_WEIGHTS` | `src/lib/signals.ts` (~l. 20 et ~l. 101) |
| Fabriquer un signal | `makeSignal(payload: TrackPayload)` (accepte `weight` explicite) | `signals.ts` ~l. 457 |
| Appliquer au profil | `commitTasteSignals` → `applyIncomingSignals` → `applySignalToProfile` → `addWeight` | `signals.ts` ~l. 1087–1122, ~l. 560, ~l. 963 |
| Tags d'un spectacle | `tasteTagsFromDayItem`, `moodsFromDayItem`, `genresMoodFromDayItem` | `signals.ts` ~l. 1468–1544 |
| Les 16 ambiances | `TASTE_MOODS`, `isTasteMood` | `src/lib/phraseTags.ts` |
| Libellés FR des ambiances | `TASTE_MOOD_LABELS_FR`, `labelTasteMood` | `src/lib/pourToi.ts` ~l. 52 |
| Forme du créneau (theatre/concert/cine) | `slotFormOfItem` (exporté) | `src/lib/reco.ts` ~l. 1020 |
| Identité d'une œuvre (dédoublonnage) | `workIdOf` (exporté) | `reco.ts` ~l. 1164 |
| Séance encore atteignable | `isTimeReachable(item, now)` (exporté) | `reco.ts` ~l. 1452 |
| Pouvoir discriminant d'une ambiance | `inverseMoodWeights(items, slot)` (**non exporté**) | `reco.ts` ~l. 1197 |
| Découpage des tags | `splitTagSlugs` (reco, `|` et `,`) / `splitSlugs` (signals, `, ; / |`) | `reco.ts` ~l. 1007 / `signals.ts` ~l. 1430 |
| Réception des signaux | `POST /api/signals` (valide via `isKnownSignalKind`, `payloadExceedsLimit`, rate limit) | `src/app/api/signals/route.ts` |
| Stockage compte | Postgres `account_tastes` (JSONB) | `src/lib/accountTasteStore.ts`, `account_tastes.sql` |
| Stockage invité | KV append-only par `vid` | `src/lib/guestSignalStore.ts` |
| Banc d'essai reco | `npm run bench` (profils Eloi25, `--compare`) | `scripts/recoBench.ts`, `bench-results/` |

### Invariants du profil à respecter (lus dans le code)

1. **Un poids n'est jamais négatif.** `addWeight` supprime la clé dès que `weight <= 0`. Un duel perdu fait donc **baisser** un goût existant, jusqu'à le supprimer, mais ne crée pas de « je n'aime pas ». C'est voulu pour ce lot.
2. **Un poids à 0 veut dire « l'utilisateur a retiré ce goût »** (`wipeProfileKey`, `overlayZeroWeights`). Il ne doit jamais être recréé ni effacé par un duel. Voir §4.4 : aujourd'hui `commitTasteSignals` appelle `unzeroKeysTouchedBySignal` sur **tous** les signaux qui écrivent des goûts, ce qui serait faux pour les duels.
3. **Le profil est incrémental.** `rebuildTasteState` ne recalcule pas depuis `signalsRecent` ; `signalsRecent` est plafonné à `ACCOUNT_CAP = 40` (et `GUEST_CAP = 80`).
4. **RGPD** : jamais de `cc_vid` associé à un compte, jamais d'email en clair (voir `assertRsvpRgpd`, `assertNoVidAccountJoin`). Les duels ne changent rien à ça.

---

## 3. Données : ce qu'on a vraiment (mesuré sur `data/evenements.csv`)

- `theatre_danse` + `musique` : **1 271** lignes, dont **771** avec `moods` et **831** avec `genres_mood`.
- `mood_confiance` sur ces lignes : `basse` 635 · `haute` 236 · `moyenne` 206 · vide 194.
- Distribution très déséquilibrée des ambiances (lignes taguées) :
  - Théâtre (512) : rigolo 57 %, tendre 14 %, festif 13 %, poetique 9 %, intense 6 %, intimiste 5 %, absurde 4 %, autres ≤ 3 %.
  - Concerts (259) : festif 56 %, dansant 32 %, intense 19 %, tendre 8 %, intimiste 7 %, autres ≤ 5 %.
- Conséquence déjà gérée par la reco : `inverseMoodWeights` met l'IDF d'une ambiance à **0** quand elle couvre ≥ 75 % d'un créneau (commentaire : « theatre ≈ 82 % rigolo → 0 »). **Un duel dont la seule différence est une ambiance à IDF 0 n'apprend rien d'utile à la reco : ne pas le tirer.**
- Doublons réels dans le catalogue (même spectacle en 2 lignes) : `Xandria + Seven Spires + Tulip` / `… (metal)`, `DJ Pone - 30 ans de Platines` / `… (hip-hop|rap)`, `Primal Fear` / `… (metal)`, `HYPNO5E & HIPPOTRAKTOR` / `… (metal|post-metal)`. Des titres ne sont qu'une date : `Vendredi 02 octobre 2026 - 20H30` (La Comédie de Toulouse). **Ne jamais faire un duel entre deux lignes du même spectacle.**
- Tags douteux repérés : `Lio Kuokman / Nelson Goerner` (concert classique) est tagué `rigolo`. D'où la règle de confiance au §5.1.
- **Prérequis qualité** : la variété des tags conditionne tout ce brief. Voir `briefs/tagging-methode-v2.md` (2 à 3 ambiances ordonnées, `rigolo` / `festif` jamais seuls, confiance stricte, script `tagAudit`). Les duels peuvent être codés avant ce retagging, mais ils ne donneront leur plein effet qu'après.
- Les prix sont souvent vides ou en texte libre (`Tarif unique : 28€`, `28–35€`, `à partir de 39€`, `entrée libre 5 euros conseillés`, `gratuit`).

---

## 4. Spécification du signal

### 4.1 Nouveaux `SignalKind`

Ajouter quatre kinds dans `SignalKind` et `SIGNAL_WEIGHTS` (`src/lib/signals.ts`) :

| Kind | Émis pour | Poids | Tags portés par le signal |
|---|---|---|---|
| `duel_win` | le spectacle choisi | **+2** | uniquement les tags **propres** au gagnant (absents du perdant) |
| `duel_lose` | le spectacle écarté | **−1** | uniquement les tags **propres** au perdant |
| `duel_both` | chacun des deux | **+1** | tous ses tags éligibles |
| `duel_none` | chacun des deux | **−0,5** | tous ses tags éligibles |

- Un duel = **2 signaux** (un par spectacle), envoyés dans le **même** POST.
- Les tags sont calculés **avant** l'envoi (fonction pure, §5), puis passés dans `moods` / `genres` du `TrackPayload`. Le serveur ne recalcule pas le différentiel.
- Si le différentiel est vide pour un côté (ex. le gagnant n'a aucun tag propre), **ne pas émettre** ce signal-là.
- Poids : constantes nommées exportées (`DUEL_WIN_WEIGHT = 2`, etc.) pour pouvoir les régler avec le banc.

### 4.2 Ce que ces kinds ne sont PAS

- **Pas** dans `ACTION_KINDS` : un duel n'est pas une action sur une fiche (il ne doit pas déclencher `shouldPromptLogin`, ni compter dans `hasActionSignals`, `cinemaActionShare`…).
- **Pas** dans `TASTE_TAG_PEER_KINDS` ni `TASTE_INHERIT_KINDS` : un duel ne doit **ni hériter** des tags d'un autre signal de la même fiche (`inheritTasteTagsFromPeers`), **ni prêter** les siens. Ses tags sont exactement le différentiel calculé.
- **Pas** dans `PAIRED_CLICK_KINDS`.
- `isTasteWritingSignal` doit renvoyer `true` pour les 4 kinds (c'est le cas par défaut pour un kind connu hors `chip_cat` / `chip_time` ; ajouter un test).

### 4.3 Dédoublonnage

`dedupAppend` fusionne « même kind + même cible dans les 30 min » en gardant le poids max. Pour les duels, c'est acceptable : refaire le même duel dans les 30 minutes ne doit pas compter deux fois. Ajouter un test qui le vérifie.

### 4.4 Respect des goûts retirés (bug à éviter)

`commitTasteSignals` fait `unzeroKeysTouchedBySignal(profile, s)` pour chaque signal qui écrit des goûts, **y compris négatifs**. Pour les duels :

- `duel_lose` et `duel_none` : **ne jamais** « dé-zéroter ». Une ambiance que l'utilisateur a retirée (poids 0) doit rester à 0.
- `duel_win` et `duel_both` : **ne pas dé-zéroter non plus**. Le choix est forcé entre deux options ; ça ne vaut pas un « je rajoute ce goût » explicite. Le poids 0 doit rester 0 et le +2 / +1 est ignoré pour cette clé.
- Implémentation suggérée : un prédicat `isDuelKind(kind)` et, dans `commitTasteSignals`, sauter `unzeroKeysTouchedBySignal` pour ces kinds. Dans `applySignalToProfile` (ou juste avant), ignorer les clés dont le poids stocké est exactement 0 quand le signal est un duel.
- Tests obligatoires (§8) : une ambiance wipée reste à 0 après `duel_win`, `duel_both`, `duel_lose`, `duel_none`.

### 4.5 `signalsRecent` et plafond 40

Chaque duel ajoute jusqu'à 2 entrées dans `signalsRecent` (plafond 40, FIFO). 5 duels d'onboarding = 10 entrées, qui peuvent pousser dehors des favoris récents utilisés par `lastOpenCardDayIso`, `cinemaActionShare`, `shouldPromptLogin`…

Décision : **appliquer les duels au profil, mais ne pas les conserver dans `signalsRecent`**. Ils n'y servent à rien, puisque le profil est incrémental. Faire le filtrage dans `commitTasteSignals` (le `for (const s of mapped) events = dedupAppend(...)` ne doit pas ajouter les duels) et le tester. Côté invité, même règle pour `GuestSignalsStore.events`. Le journal append-only KV (`guestSignalStore`) peut, lui, garder la ligne brute pour l'analyse.

Si un effet de bord de ce choix apparaît (par exemple le dédoublonnage 30 min de §4.3, qui s'appuie sur `events`), le signaler dans la PR plutôt que de contourner : dans ce cas, garder les duels dans `events` mais relever le plafond n'est **pas** la bonne solution.

---

## 5. Module pur `src/lib/duels.ts` (nouveau)

Zéro I/O, zéro React, entièrement testable. Signatures cibles (ajuster les noms si une convention locale existe) :

```ts
export type DuelResult = 'a' | 'b' | 'both' | 'none';
export type DuelTags = { moods: string[]; genres: string[] };

export function duelTagsOf(item: DayItem): DuelTags;
export function isDuelEligible(item: DayItem, now: Date): boolean;
export function duelDiff(a: DuelTags, b: DuelTags): { onlyA: DuelTags; onlyB: DuelTags; shared: DuelTags };
export function duelPayloads(a: DayItem, b: DayItem, result: DuelResult): TrackPayload[];
export function pickDuelPair(pool: DayItem[], profile: TasteProfile, now: Date, opts?: PickDuelOptions): [DayItem, DayItem] | null;
export function pickOnboardingDuels(pool: DayItem[], now: Date, count?: number): Array<[DayItem, DayItem]>;
export function duelFeedbackCopy(a: DayItem, b: DayItem, result: DuelResult): string;
```

### 5.1 `duelTagsOf` : quels tags comptent

- Ambiances : `moodsFromDayItem(item)`, filtrées par `isTasteMood`. **Ne pas** utiliser `extractMoods` / `parsePhraseRules` sur la description (trop bruité pour un duel).
- **Confiance** : ne garder les ambiances que si `mood_confiance` (programme, sinon événement) vaut `haute` ou `moyenne`. `basse` ou vide → ambiances ignorées pour les duels. Mettre la liste dans une constante `DUEL_MOOD_CONFIDENCE = ['haute', 'moyenne']`.
- Genres : `genresMoodFromDayItem(item)`, filtrés par `TASTE_GENRE_SLUGS` (vocabulaire fermé). Pas de genres libres.
- Exclure la pseudo-ambiance `sortie` (déjà exclue par `isTasteMood` ; ajouter un test).

### 5.2 `isDuelEligible`

Vrai si **tout** est vrai :
- `slotFormOfItem(item)` vaut `theatre` ou `concert` (le cinéma est hors périmètre de ce lot) ;
- `isTimeReachable(item, now)` ;
- `duelTagsOf(item).moods.length >= 1` ;
- le titre n'est pas une date seule (regex du type `^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\p{L}+\s+\d{4}`, insensible à la casse, à mettre dans une constante testée).

### 5.3 `duelPayloads` (règles du §4.1)

- Différentiel via `duelDiff` sur les **ambiances et les genres**.
- `a` → `duel_win` (A, `onlyA`) + `duel_lose` (B, `onlyB`).
- `b` → symétrique.
- `both` → `duel_both` sur A (tous ses tags) et sur B (tous ses tags).
- `none` → `duel_none` sur A et sur B (tous leurs tags).
- Chaque payload porte les ids habituels (`event_id`, `programme_id`, `lieu_id`, `commune`, `categorie`, `dayIso`) comme les autres signaux de fiche, **et** un `weight` explicite.
- Pas de payload si ses `moods` et `genres` sont tous deux vides.

### 5.4 `pickDuelPair` : tirer une paire qui apprend quelque chose

Entrée : le pool du moment (le même que la reco), le profil courant, `now`.

1. **Candidats** : `pool.filter(i => isDuelEligible(i, now))`.
2. **Dédoublonnage** : une seule ligne par `workIdOf(item)`. En plus, considérer comme le même spectacle deux lignes au même `lieu_id`, même `dayIso`, dont le titre normalisé de l'une est un préfixe de l'autre (`normalizeFr`, sans le suffixe entre parenthèses). Test avec le cas réel `Xandria + Seven Spires + Tulip` / `… (metal)`.
3. **Paires possibles** : A et B du **même créneau de jour** (`dayIso` identique). Fallback si aucune paire le même jour : même semaine (dates à ≤ 3 jours d'écart). Jamais A et B au même `workIdOf`.
4. **Prix proches** : si les deux prix sont lisibles, écart ≤ 10 €. Si un seul ou aucun n'est lisible, autoriser (ne pas pénaliser l'absence de prix). Helper `parsePriceEuros(raw: string): number | null` : `gratuit` / `entrée libre` → 0 ; sinon premier nombre (virgule décimale acceptée) ; sinon `null`. Ajouter les cas de test du §3.
5. **Différence utile** : au moins une ambiance du différentiel (`onlyA ∪ onlyB`) avec IDF > 0 dans son créneau. Exporter `inverseMoodWeights` depuis `reco.ts` (ou extraire son calcul dans un helper partagé) plutôt que de le recopier.
6. **Score d'information** de la paire, à maximiser :
   `info = Σ_{m ∈ onlyA ∪ onlyB} idf(m) × incertitude(m)`
   avec `incertitude(m) = 1 / (1 + entryWeight(profile.moods[m]))`. Une ambiance déjà très connue (gros poids) apprend peu ; une ambiance inconnue apprend beaucoup. Ambiance wipée (poids 0 explicite) → incertitude 0 (on ne la reteste pas).
7. **Départage** : `info` décroissant, puis séance la plus proche, puis `workIdOf` (ordre stable, pour des tests déterministes).
8. `opts.excludeWorkIds` : les œuvres déjà vues en duel dans la session.
9. Aucune paire valide → `null` (l'UI n'affiche pas de duel, elle ne dégrade pas).

Complexité : le pool du jour est petit, O(n²) accepté. Borner à 200 candidats (les plus proches dans le temps) par sécurité.

### 5.5 `pickOnboardingDuels` : 5 duels pour un nouvel utilisateur

- Profil vide, donc l'incertitude vaut 1 partout : le score dépend seulement de l'IDF.
- **Diversité** : chaque duel doit tester un **couple d'ambiances différent** (pas deux fois Rire contre Intense). Aucun spectacle réutilisé.
- Viser au moins un duel `theatre` contre `theatre`, un `concert` contre `concert` et un `theatre` contre `concert` quand le stock le permet.
- Fenêtre : les 14 prochains jours (pas uniquement ce soir).
- Moins de 5 paires trouvées → renvoyer ce qu'on a (0 à 4) ; l'UI s'adapte.

### 5.6 `duelFeedbackCopy`

Libellés via `labelTasteMood` (FR, tutoiement, cohérent avec `pourToi.ts`) :
- `a` / `b` : `Noté : plutôt {ambiance propre au gagnant} que {ambiance propre au perdant}.` Prendre l'ambiance à plus fort IDF de chaque côté. Si un côté n'a pas d'ambiance propre, utiliser le titre du spectacle.
- `both` : `Noté : les deux te tentent.`
- `none` : `Noté : ni l'un ni l'autre ce coup-ci.`
- Jamais de slug brut à l'écran (règle du brief design).

---

## 6. API

- **Réutiliser `POST /api/signals`** : pas de nouvelle route. Les kinds `duel_*` passent la validation dès qu'ils sont dans `SIGNAL_WEIGHTS`.
- Le client envoie les 1 ou 2 payloads d'un duel dans **le même** POST.
- Vérifier que `payloadExceedsLimit` et le rate limit invité (`GUEST_RATE_LIMIT_PER_HOUR`, `IP_RATE_LIMIT_PER_HOUR`) laissent passer 5 duels d'onboarding à la suite (10 signaux). Sinon, régler le rate limit pour ces kinds, sans l'enlever.
- Invité et compte connecté suivent **le même** chemin qu'aujourd'hui (KV par `vid` / `account_tastes`). Aucune nouvelle table.
- La fusion au login (`resolveLoginMerge`) n'a rien à faire de spécial : elle fusionne des profils, et les duels y sont déjà appliqués.

---

## 7. UI (PR séparée, derrière un flag)

Le lot 1 (lib + API + tests) doit être mergeable **sans** UI. L'UI arrive dans une PR à part, derrière `NEXT_PUBLIC_DUELS=1`.

### 7.1 Duel dans le fil (écran B des maquettes)

- Fréquence : **1 carte sur 8**, au plus **3 duels par session**, et jamais deux duels à la suite.
- En-tête : `Ce soir, plutôt…` puis en petit `Duel rapide · ça affine tes suggestions`.
- Deux cartes empilées, avec la pastille `ou` entre les deux. Carte = couleur de catégorie, catégorie, heure, titre (serif), lieu · prix, **une** pastille d'ambiance (celle du différentiel à plus fort IDF).
- Sous les cartes : `Aucun des deux` · `Les deux` (vrais `<button>`, 44 px de haut minimum).
- Après le choix : bandeau `duelFeedbackCopy(...)` + bouton `Continuer`.
- Si `pickDuelPair` renvoie `null` : on n'affiche pas de duel, on montre la carte suivante.

### 7.2 Onboarding en 5 duels (écran A des maquettes)

- Remplace (ou précède) la sélection d'ambiances de `TastesSheet` pour un profil vide. Toujours un lien `Passer`.
- Progression `Duel n sur 5` + barre en 5 segments.
- Écran final `Ton profil de sortie` : barres des ambiances qui ont bougé (poids positifs en terracotta, baisses en gris), puis la phrase `Les ambiances communes aux deux spectacles ne comptent pas : seule la différence nous apprend quelque chose.`, puis CTA `Voir mes spectacles`.

### 7.3 Accessibilité et règles du brief design

- Les cartes sont des `<button>` avec `aria-pressed` ; focus visible terracotta.
- Contraste AA : pas de texte blanc sur `#E85D3B` en petite taille, utiliser `culture-clay` `#C44A2F`.
- Pas de slug, pas de note de scrape, pas de prix inventé : `Prix non communiqué` quand il manque.

---

## 8. Tests à écrire

Fichier `src/lib/duels.test.ts` (même style que les tests existants : `node:test` + `tsx`). **L'ajouter au script `test` de `package.json`**, sinon il ne tourne pas.

**Signal et profil** (ajouter au besoin dans `signalsAction.test.ts` ou `tasteIngest.test.ts`) :
1. `duel_win` +2 sur `tendre` : le poids de `tendre` augmente de 2 ; `pct` recalculé.
2. `duel_lose` −1 sur `intense` à 1,5 : poids à 0,5. Même chose sur `intense` à 0,5 : la clé est **supprimée** (pas mise à 0).
3. Goût wipé (`intense` = 0) : reste 0 après chacun des 4 kinds (§4.4).
4. Un duel **n'hérite pas** des tags d'un `favorite` sur la même fiche (`inheritTasteTagsFromPeers`).
5. Les duels ne sont pas ajoutés à `signalsRecent` / `events` (§4.5), mais le profil bouge.
6. `isTasteWritingSignal` est vrai pour les 4 kinds ; aucun des 4 n'est dans `ACTION_KINDS`.
7. Même duel rejoué dans les 30 min → compté une seule fois.

**Module duels** :
8. `duelDiff` : les tags communs sont exclus des deux côtés.
9. `duelTagsOf` : ambiances `basse` / vides ignorées ; `sortie` ignorée ; genres hors vocabulaire fermé ignorés.
10. `isDuelEligible` : cinéma exclu ; séance passée exclue ; titre « Vendredi 02 octobre 2026 - 20H30 » exclu.
11. `parsePriceEuros` : `Tarif unique : 28€` → 28 ; `28–35€` → 28 ; `à partir de 39€` → 39 ; `25,80 € Prévente` → 25.8 ; `gratuit` → 0 ; `entrée libre 5 euros conseillés` → 0 ; `''` → null.
12. `pickDuelPair` ne propose jamais deux lignes du même spectacle (cas `Xandria…` / `… (metal)`).
13. `pickDuelPair` refuse une paire dont la seule différence est `rigolo` dans un créneau théâtre où `rigolo` a un IDF de 0.
14. `pickDuelPair` préfère l'ambiance inconnue du profil à l'ambiance déjà forte (à IDF égal).
15. Une ambiance wipée n'est jamais la raison d'une paire.
16. `pickOnboardingDuels` : 5 couples d'ambiances distincts, aucune œuvre répétée ; renvoie moins de 5 paires si le stock est pauvre.
17. `duelFeedbackCopy` : libellés FR (`Rire`, pas `rigolo`).
18. `duelPayloads('a')` sans ambiance propre au gagnant → un seul payload (`duel_lose`).

**Non-régression** :
19. `npm test` entièrement vert.
20. `npm run bench -- --compare bench-results/2026-09-27-eloi25-b3b.json` : aucune dégradation des métriques existantes (les duels n'étant pas dans les profils Eloi25, le résultat doit être identique). Joindre la sortie à la PR.

### 8.1 Mesure de l'apport (bonus, script dev, pas un test bloquant)

`scripts/duelSim.ts` : pour chaque profil Eloi25 pris comme « vérité », simuler un utilisateur qui répond aux duels selon ce profil (il choisit le spectacle dont les ambiances du différentiel ont le plus de poids dans la vérité). Partir d'un profil vide, jouer 5 duels d'onboarding, puis mesurer la proximité (cosinus sur les 16 ambiances) entre profil appris et vérité. Comparer avec 5 likes aléatoires parmi les spectacles que la vérité aime. Rendre le tableau dans la PR. **Aucune écriture dans `data/`.**

---

## 9. Découpage en PR

1. **PR 1 : lib + signal** : §4 et §5, tests §8 (1 à 18), aucun changement UI. Mergeable seule.
2. **PR 2 : API** : §6 (rate limit si nécessaire) + test de route si le repo en a le pattern.
3. **PR 3 : UI derrière flag** : §7.
4. **PR 4 (optionnelle)** : `scripts/duelSim.ts` (§8.1).

Chaque PR : `npm run lint`, `npm test`, `npm run build` verts avant push.

---

## 10. Hors périmètre (ne pas faire ici)

- **« Je n'aime pas »** : aujourd'hui un poids ne descend pas sous 0 (§2, invariant 1). Représenter une aversion demanderait un nouveau bucket (ex. `profile.avoid`) et une pénalité dans `scoreOverlapHit` (`reco.ts` ~l. 1267, qui ignore tout `pct <= 0`). À traiter dans un brief dédié, après mesure.
- **Profils types (clustering)** et **« les gens comme toi »** : nouvelle finalité de traitement ; nécessite une mise à jour de `/confidentialite`, uniquement pour les comptes connectés. Brief séparé.
- **Nettoyage et méthode de tagging** : voir `briefs/tagging-methode-v2.md`. Les duels s'en protègent déjà via §5.1 et §5.4.
- Cinéma dans les duels.
- Mobile natif.

---

## 11. Checklist de relecture

- [ ] Aucun duel ne dé-zérote un goût retiré.
- [ ] Aucun duel n'hérite de tags d'un autre signal de la fiche.
- [ ] `signalsRecent` / `events` ne contiennent pas de duels.
- [ ] Deux lignes du même spectacle ne s'affrontent jamais.
- [ ] Pas de paire dont la seule différence a un IDF de 0.
- [ ] Ambiances `mood_confiance` basse ou vide ignorées.
- [ ] Tous les libellés en FR via `labelTasteMood` ; aucun slug à l'écran.
- [ ] `duels.test.ts` ajouté au script `test`.
- [ ] Bench identique avant/après (sortie jointe).
- [ ] Aucune donnée écrite dans `data/` ; aucun `cc_vid` associé à un compte.
