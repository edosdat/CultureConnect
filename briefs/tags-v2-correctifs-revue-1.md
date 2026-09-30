# Tags v2 : correctifs de revue n° 1 (PR #173 et audit #172)

Revue du 29/09/2026 sur `main` (#171 stockage, #172 audit) et la branche `cursor/tags-v2-tagger-gold-e97c` (PR #173). Référence : `briefs/tags-v2-evenements-et-profils.md`.

Ce qui est conforme et ne doit pas bouger : jointure sur `event_id` (stabilité vérifiée : les 6 173 `event_id` du 19/09 sont tous présents le 29/09 avec le même titre), héritage séance → événement, `budget` / `jauge` calculés, écriture uniquement dans `data/tags_evenements.csv`, prompt §A4 et validation du tagueur, garde-fou contre une passe complète.

## 1. BLOQUANT : le gold set doit être humain

**Constat** : `scripts/fixtures/tag-gold.json` compte 60 lignes, toutes `"tagged_by": "agent"`. Le brief (§A6) demande un gold tagué à la main par Eloi. Un gold produit par un agent ne mesure pas la justesse du tagueur, seulement l'écart entre deux modèles, et le FAIL actuel (30 % d'ambiance principale identique) n'est pas interprétable.

**À faire** :
1. Générer `scripts/fixtures/tag-gold-review.csv` pour relecture humaine, une ligne par spectacle : `event_id, titre, categorie, lieu, texte (description utilisée par le tagueur), moods, sortie, energie, exigence, format_scene, ideal_pour, notoriete`. Les colonnes de tags sont pré-remplies avec la proposition actuelle, à corriger dans un tableur.
2. Ajouter `npm run tags:gold-import` : relit le CSV corrigé, valide les enums et cardinalités (mêmes règles que le tagueur), réécrit `tag-gold.json` avec `"tagged_by": "manuel"`.
3. `--eval-gold` et `tagAudit` **refusent** de calculer les scores si une ligne du gold n'est pas `manuel` (message clair, pas de chiffre).
4. Ne pas merger #173 tant que le gold n'est pas `manuel` et que `--eval-gold` en `gpt-4o` n'a pas atteint les seuils §A6.

## 2. Fuite des exemples few-shot dans le gold

**Constat** : `Lio Kuokman / Nelson Goerner` et `HYPNO5E & HIPPOTRAKTOR` sont à la fois dans `FEW_SHOTS` (`scripts/tagEvents.ts`) et dans le gold. Le modèle voit la réponse avant d'être évalué dessus.

**À faire** : remplacer ces 2 lignes du gold par 2 autres spectacles du même créneau (graine fixe, même règle de tirage) ; ajouter un test qui échoue si un `event_id` ou un titre normalisé est présent à la fois dans `FEW_SHOTS` et dans le gold.

## 3. `tagAudit --strict` doit bloquer sur les erreurs graves

**Constat** : le rapport indique que « les erreurs bloquantes ne changent pas le code de sortie ». Aujourd'hui : 221 `rigolo_seul`, 166 `rigolo_principal_sans_humour`, 69 `festif_seul_concert`, 60 `doublon`, 41 `titre_date`, 41 `hors_enum`. La condition de la PR 5 (« `tagAudit --strict` vert ») pourrait donc passer avec des tags faux.

**À faire** : en `--strict`, code de sortie non nul dès qu'une ligne **taguée v2** a une erreur bloquante (`hors_enum`, `hors_bornes`, `rigolo_seul`, `festif_seul_concert`, `rigolo_principal_sans_humour`, `preuve_introuvable`, `doublon`, `v1_v2_incoherent`). Les erreurs sur les lignes encore en v1 restent dans le rapport, sans bloquer. `titre_date` bloque aussi pour une ligne v2. Tests : une fixture v2 par type d'erreur → exit ≠ 0 ; mêmes erreurs en v1 seulement → exit 0.

## 4. ~~Seuil de 35 % mesuré sur les lignes taguées~~ (retiré, voir `briefs/feuille-de-route-tags-reco.md` §2)

**Constat** : la part d'une ambiance est calculée sur tout le créneau, lignes non taguées comprises (rigolo : 36,5 % du créneau, mais 57,4 % des lignes taguées). Moins on tague, plus on passe le seuil.

**À faire** : afficher les deux parts (déjà présentes dans le tableau) ; le seuil « aucune ambiance > 35 % » s'applique à la **part des lignes taguées**. L'IDF reste calculé sur le créneau entier (cohérent avec `inverseMoodWeights`). Mettre à jour le rapport de référence `bench-results/2026-09-28-tags.md` avec la nouvelle règle (rigolo en théâtre passe en RATÉ à 57,4 %).

## 5. Pour plus tard (PR 6 et 7, pas dans ce lot)

Intégrer `briefs/tags-v2-addendum-ponderation.md` : poids par rang 1 / 0,6 / 0,3 × confiance (haute 1, moyenne 0,8, basse 0,5), qui remplace `LOW_CONFIDENCE_MOOD_FACTOR`.

## Vérification

`npm run lint`, `npm test` et `npm run build` verts ; nouveau rapport d'audit committé ; rapport `--eval-gold` régénéré **uniquement** après import du gold manuel.
