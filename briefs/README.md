# Briefs : file d'attente pour l'agent de code

Les briefs de ce dossier sont écrits par Claude (conception, revue) ou par l'équipe, et codés par Cursor.
Ce fichier est **la seule file d'attente officielle**.

## Prochain brief

> **`tags-mix-curseurs.md` : EN ATTENTE** (GO de Katia et Steph sur la nouvelle grille de tags). Ne pas coder.
> En attendant : les tickets de `feuille-de-route-tags-reco.md` §3 encore **À faire** (voir sa section 1, mise à jour le 03/10).

L'humain lance une tâche avec une seule phrase : **« Prends le prochain brief de `briefs/README.md` »**, ou en nommant un fichier de `briefs/`.

## Protocole (v2, 03/10)

1. **Pas de code sans fichier de brief.** Si la consigne arrive par le chat (tip, QA, « Manager »), crée d'abord `briefs/AAAA-MM-JJ-sujet.md` à partir de `briefs/_modele.md`, en 10 lignes s'il le faut, dans la même PR que le code. Sinon personne d'autre ne sait ce qui a été demandé.
2. Au début de chaque tâche : lis ce fichier, puis le brief, puis les fichiers de référence du domaine.
3. Passe le brief en **En cours** dans le tableau, dans la PR du code. Le titre de la PR commence par l'identifiant du brief (ex. `M1 mixFadersOf : …`).
4. À la fin de la PR, coche dans la description de la PR chaque critère d'acceptation du brief : `[x]` fait, `[ ]` pas fait + pourquoi.
5. Une fois mergé : **Fait (#PR)** ici, **et** dans le tableau d'état du brief s'il en a un (ex. `feuille-de-route-tags-reco.md` §1).
6. Brief faux, flou, ou en contradiction avec le code **ou avec une consigne du chat** : ne devine pas. **Bloqué** + la question en une ligne dans Notes, et arrête-toi. En cas de conflit entre le chat et un brief, c'est la question qui gagne, pas la consigne la plus récente.
7. Un brief **En attente** ne se code pas, même en partie.
8. Les briefs écrits par Claude sont en lecture seule pour toi, sauf leur tableau d'état. Pour les corriger, Notes ou commentaire de PR.

Statuts : **À faire** · **En attente (de qui)** · **En cours** · **Fait (#PR)** · **Bloqué** · **Remplacé**

## Référence (à lire avant de toucher au domaine concerné)

| Fichier | Sert à |
|---|---|
| `briefs/feuille-de-route-tags-reco.md` | **Pilotage tags + reco.** Son §3 « Ordre d'exécution unique » est la file d'attente détaillée de ce chantier (L1 → Duels). |
| `briefs/tags-v2-evenements-et-profils.md` | Schéma des tags v2 (événements) et familles de profils |
| `briefs/tags-v2-addendum-ponderation.md` | Pondération par rang × confiance |
| `briefs/tags-v2-correctifs-revue-1.md` | Correctifs C1–C3 sur #172 / #173 |
| `briefs/duels-signal-compare.md` | Signal `duel_*` et tirage des paires |
| `briefs/tags-mix-curseurs.md` | 5 curseurs d'humeur (écran « Ton mix ») : mapping des moods, mesures |
| `docs/ton-plan-c.md` | **Tout texte affiché** : ton, lexique, couleurs Plan C |
| `docs/bibliographie-culture.md` | Sources (lecture humaine, rien à coder) |

## File d'attente

| # | Brief | Statut | Notes |
|---|---|---|---|
| 1 | `feuille-de-route-tags-reco.md` §3, tickets 1 à 14 dans l'ordre | En cours | L1 fait (#174, #177, #192). Ticket 13 (L8.1) mergé hors ordre (#181). Tags v2 (C1 → PR 5) en attente de la nouvelle grille. État détaillé : §1 du brief. |
| 1 bis | `tags-mix-curseurs.md` (M1 → M3) | En attente (Katia, Steph) | Dépend de la nouvelle grille de tags. Ne pas coder avant GO. |
| 2 | `v1-beta/fiche-cine-web-split.md` | À confirmer | Écrit avant ce protocole : indiquer Fait (#PR) s'il est déjà livré. |
| 3 | `top3-compact-no-desc.md` | À confirmer | idem |
| 4 | `top3-hauteur-uniforme.md` | À confirmer | idem |
| 5 | `badge-presse-cartes-musique.md` | À confirmer | idem |
| 6 | `chip-enfants-films-theatre.md` | À confirmer | idem |
| — | `tagging-methode-v2.md` | Remplacé | par `tags-v2-evenements-et-profils.md` |
| — | tip Relance digeste 2 fenêtres (`sam_dim` / `lun_ven`) | Fait (#206) | API `POST /api/agenda?reco=1` + `digest=relance`. Sheet Mes recos et Top 3 inchangés (max 3). |
| — | tip digeste : liste comptes Google + unsub 1 clic | En cours | Fenêtre test jusqu'au 2026-12-01 : pas de gate `opted_in`. HOLD merge soft + GO. |
| — | tip Bot chat feedback V0 | En cours | PATCH soft RGPD sur #215 (notice, purge cron, pas de xAI). HOLD merge jusqu'au GO. |
| — | tip feedback capture V0 | Fait (#230) | Compositeur « Joindre une capture », 1 JPEG, 5 Mo, Neon 90 j, admin seul. |
| — | tip PWA 3/3 refresh contenu ouvert | En cours | Shell réseau d'abord. Focus + 10 min : `reg.update()`, reload si l'écran est libre, sinon bandeau. Agenda refetch sans tuer l'app. HOLD merge jusqu'au GO. |
| — | tip 1/3 popup 1ère connexion digeste jeudi | En cours | Une fois par compte (`seen`) + drapeau local. Pas de case sur la carte. HOLD merge jusqu'au GO. |
| — | tip Partager trop long | En cours | Toast / sheet au tap, mint async. POST allégé (guest sans `auth()`, SET NX). HOLD merge jusqu'au GO soft. |
| — | tip Reset froid admin (1ʳᵉ visite) | En cours | Bouton `/admin` pour `ADMIN_EMAILS`. Client seulement : cookies séparés `cc_vid` + `cc_signals_v1`. KV `cc:vs:*` intact. HOLD merge jusqu’au GO. Soft ne merge pas. |
| — | retirer le CTA « Voir le mois » | Fait (#228) | Lien hors bande filtres retiré. Calendrier Date… conservé. |
| — | tip recherche NL → chips | Fait (#231) | Preview sous `#cc-search` + Confirmer. 0 date = catalogue ≥ today Paris. |
| — | tip auth gate Partager / Envie / J’y vais | Fait (#232) | Sheet « Connexion rapide ». |
| — | splash PWA cold open V0 | En cours | Path A+B brandé + prefetch `window=home` pendant le splash. HOLD soft+GO. Soft tip No merge. |
| — | tip social beat 1 | En cours | Une ligne sous Envie / J’y vais, 1ʳᵉ Envie ou Partager connecté, drapeau `cc_social_tip_b1_seen`. HOLD soft+GO. Soft ne merge pas. |
