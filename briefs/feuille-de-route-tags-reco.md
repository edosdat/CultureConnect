# Feuille de route unifiée : catalogue, tags v2, reco (29/09/2026)

Document de pilotage pour l'agent de code. Il **fusionne** deux séries de consignes écrites en parallèle et tranche leurs désaccords :

- **Lot 3** (`L1` → `L8`, consignes du 29/09 sur `main` à `5e67e3f`) : santé du catalogue et du moteur.
- **Tags v2** : `briefs/tags-v2-evenements-et-profils.md` (PR 1 à 9), `briefs/tags-v2-addendum-ponderation.md`, `briefs/tags-v2-correctifs-revue-1.md` (C1 à C4), `briefs/duels-signal-compare.md`.

En cas de contradiction, **ce document prime**. Chiffre du lot 3 revérifié le 29/09 : L1 = 30 événements / 273 séances poubelle (reproduit à l'identique).

---

## 1. Ce qui est fait

| | État |
|---|---|
| Tags v2 : stockage `tags_evenements.csv` (#171), audit `tags:audit` (#172) | ✅ mergés |
| Tagueur + gold set (#173) | 🟡 ouvert, **ne pas merger** (voir C1, C2) |
| `event_id` stables d'un sync à l'autre | ✅ vérifié (6 173 / 6 173 conservés du 19/09 au 29/09, titres identiques) |
| N1 `demoteChainFor`, N2 parité des chargeurs, N3 audit catalogue | ✅ (lot 3 §0) |
| Tests | ✅ 749 / 750 |
| `tsc` | ❌ 25 erreurs (dont 3 dans `eventTags.test.ts`, code tags v2) |

## 2. Arbitrages entre les deux séries

| Sujet | Lot 3 | Tags v2 | **Décision** |
|---|---|---|---|
| Où poser les tags vivants | L5 : « magasin d'œuvre », `tags_evenements.csv` d'abord, sinon meilleure ligne sœur, jamais l'union | PR 6 : la reco lit les `moods` v2 en priorité | **Même chantier.** L5 **est** la PR 6. On garde la règle de résolution de L5 (v2 > meilleure sœur, `mood_source = 'work'`) et on y ajoute la pondération par rang de l'addendum. |
| Retagger `rigolo_seul` / `rigolo_principal_sans_humour` | L4 : retagger en v2, pas rafistoler en v1 | PR 5 : tagging v2 complet | **Identique.** L4 point 4 = PR 5. |
| `festif_seul_concert` (69) | L4 : compléter le **genre** musical (poids concert : genre 1,5, mood 0,5) | `festif` jamais seul : ajouter une 2ᵉ ambiance (dansant, intense…) | **Les deux.** Le genre porte la reco concert ; la 2ᵉ ambiance sert les duels et les familles de profils. Le tagueur remplit les deux. |
| Seuil « aucune ambiance > 35 % » | L4 : cible `mood_share` théâtre < 35 %, mesurée sur le **créneau** (rigolo 36,5 %) | C4 : mesurer sur les lignes **taguées** (rigolo 57,4 %) | **On retire C4.** Toulouse a réellement beaucoup de comédie : viser < 35 % des lignes taguées pousserait le tagueur à sous-déclarer le rire. On garde la mesure du lot 3 comme garde-fou, et la **discrimination** passe par des règles bloquantes : `rigolo_seul = 0`, ≥ 2 ambiances sur ≥ 90 % des lignes v2. Les deux parts restent affichées dans le rapport. |
| `--strict` | L4 : `tags:audit --strict` en CI « dès que le compte est redescendu » ; cible < 100 erreurs bloquantes | C3 : `--strict` échoue sur toute erreur bloquante d'une ligne **v2** | **Compatibles.** C3 d'abord (bloque les nouvelles lignes v2 fausses) ; CI `--strict` activée dès maintenant, puisqu'elle ne bloque que le v2. Objectif global < 100 erreurs bloquantes après L1 + PR 5. |
| Titres poubelle | L1 : `isJunkTitle`, filtre au chargement + purge revue | audit : erreur `titre_date` | **L1 englobe `titre_date`.** L'audit doit utiliser `isJunkTitle` (une seule définition) au lieu de sa propre regex. |
| Doublons | L4 point 3 : dédoublonnage lieu + horaire | audit : erreur `doublon` (préfixe de titre, même lieu, même date) ; duels §5.4 | **Une seule fonction** de détection des doublons, partagée par la purge, l'audit et les duels. |
| Héritage parent ciné (#158) | L2 : annuler #158 (option A) | le brief tags v2 §A3 citait `itemInheritsParentMoods` comme analogie | **Option A du lot 3.** Sans impact sur les tags v2 : l'héritage séance → événement vivant passe par `eventTagsOf`, pas par `itemInheritsParentMoods`. |
| Propriété « la raison affichée = la raison scorée » | L2 : `reason.mood ∈ reasonTasteSlugsForItem(item)` sur toute la sortie du banc | pondération et familles de profils | **À étendre** : quand la PR 6 lira les tags v2, `reasonTasteSlugsForItem` lit la **même** fonction (`eventTagsOf` / magasin d'œuvre). La propriété du banc reste le garde-fou. |
| Gold set | — | C1 : gold humain ; C2 : pas de fuite few-shot | **Retirer du tirage** les `event_id` poubelle de L1 (aucun n'y est aujourd'hui, à garder vrai). |
| Normalisation du score (cosinus) | L8.3 : pas avant bancs stables | la pondération par rang change aussi le classement | **Pondération d'abord** (PR 6), bancs, **puis** L8.3. Jamais deux changements de scoring dans le même banc. |
| Décroissance temporelle du profil | L8.2 : à spécifier | familles : hystérésis | Plus tard, banc dédié. Les familles devront être recalculées avec la décroissance quand elle arrivera. |

## 3. Ordre d'exécution unique

Une branche et une PR par ligne. Chaque PR : `npm run audit` et `npm run tags:audit` avant/après joints, `npm test` + `npx tsc --noEmit` verts.

| # | Ticket | Contenu | Dépend de | Critère de merge |
|---|---|---|---|---|
| 1 | **L1** | `isJunkTitle` + filtre dans `normalizeProgrammeRows` + CSV de revue `data/evenements-poubelle.csv` ; purge **après relecture humaine** | — | repro = `0 / 0` |
| 2 | **L2** | annuler #158 + propriété raison affichée = raison scorée sur tout le banc | — | propriété verte |
| 3 | **L7** | `tsc` 25 → 0 (dont `eventTags.test.ts`) + CI `npm test`, `tsc`, `tags:audit --strict` | — | CI verte |
| 4 | **C2 + C3** | fuite few-shot → gold ; `--strict` bloque les lignes v2 ; audit branché sur `isJunkTitle` et la détection de doublons partagée | 1 | tests |
| 5 | **C1** | CSV de revue du gold + `tags:gold-import` ; **relecture des 60 lignes par un humain** ; `--eval-gold` en gpt-4o | 4 | seuils §A6 atteints → merger #173 |
| 6 | **L6** | garde-fou ingestion (ou, scraper hors repo : filtre au chargement + note README) | 1 | test « pagination » |
| 7 | **L4 hors retag** | `hors_enum` (alias ou suppression, pas de nouvel enum), `doublon` | 1, 4 | compteurs à 0 |
| 8 | **PR 5 = L4 retag** | tagging v2 : d'abord les **30 œuvres vivantes sans mood qui ont le plus de séances** (L5), puis les `rigolo_seul`, `rigolo_principal_sans_humour`, `festif_seul_concert` (ambiance + genre) | 5, 7 | erreurs bloquantes < 100 ; lignes v2 à 0 erreur |
| 9 | **PR 6 = L5 + addendum** | magasin d'œuvre vivant (v2 > meilleure sœur), pondération par rang × confiance, `reasonTasteSlugsForItem` sur la même source | 8 | colonne « via œuvre » non nulle ; propriété L2 verte |
| 10 | **L3 → Banc 4** | banc via `queryAgenda`, deux fenêtres (15/09 et courante), A2 ≠ B1 dans `benchProfiles.eloi.json`, `meta` archivée | 1, 2, 9 | cibles Banc 4 : couverture > 19,5 %, slots > 2,75, repli < 7,8 %, duplication 0/25 |
| 11 | **PR 7** | bucket `axes`, familles de profils, badges | 10 | cibles §B6 |
| 12 | **PR 8** | écran « Ton profil de sortie » (flag) + `/confidentialite` | 11 | relecture copie |
| 13 | **L8.1** | brancher `recommendSlice` | 10 | banc |
| 14 | **Duels** | `briefs/duels-signal-compare.md` | 11 | selon ce brief |
| — | **L8.2, L8.3, L8.4** | décroissance temporelle, cosinus, compléments ciné → vivant | bancs stables | **à spécifier, ne pas coder** |

**Si on ne fait que trois choses cette semaine : L1, L2, C1.** Les deux premières touchent ce que voient les bêta-testeurs, la troisième débloque tout le chantier des tags.

## 4. Actions humaines (l'agent ne peut pas les faire)

1. Relire `data/evenements-poubelle.csv` avant la purge L1 (certains « Théâtre » sont peut-être des lieux mal parsés à récupérer).
2. Relire et corriger les 60 lignes du gold set (C1).
3. Décider pour `hors_enum` : alias ou suppression, sans nouvelle valeur d'enum.
4. Donner à l'agent une clé `OPENAI_API_KEY` pour `--eval-gold` et le tagging, ou lancer ces commandes soi-même.
