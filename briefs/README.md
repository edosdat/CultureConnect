# Briefs : file d'attente pour l'agent de code

Les briefs de ce dossier sont écrits par Claude (conception, revue) et codés par Cursor.
Ce fichier est **la seule file d'attente officielle**. Tout brief qui n'est pas listé ici n'est pas à traiter.

## Protocole

1. Au début de chaque tâche, lis ce fichier et prends le premier brief au statut **À faire** (ou celui que l'humain désigne).
2. Passe-le en **En cours** dans ce tableau, dans la même PR que le code.
3. Quand la PR est mergée, passe-le en **Fait** avec le numéro de PR.
4. Un brief qui te paraît faux, flou ou contredit le code : ne devine pas. Passe-le en **Bloqué**, écris la question en une ligne dans la colonne Notes, et arrête-toi.
5. Tes propres consignes de travail (lots, sous-tickets) vont aussi dans `briefs/`, pas seulement dans ton espace de travail : sinon Claude ne les voit pas.
6. Les briefs sont en lecture seule pour toi, sauf ce tableau. Pour les corriger, signale-le dans Notes.

Statuts : **À faire** · **En cours** · **Fait (#PR)** · **Bloqué** · **Remplacé**

## Référence (à lire avant de toucher au domaine concerné)

| Fichier | Sert à |
|---|---|
| `briefs/feuille-de-route-tags-reco.md` | **Pilotage tags + reco.** Son §3 « Ordre d'exécution unique » est la file d'attente détaillée de ce chantier (L1 → Duels). |
| `briefs/tags-v2-evenements-et-profils.md` | Schéma des tags v2 (événements) et familles de profils |
| `briefs/tags-v2-addendum-ponderation.md` | Pondération par rang × confiance |
| `briefs/tags-v2-correctifs-revue-1.md` | Correctifs C1–C3 sur #172 / #173 |
| `briefs/duels-signal-compare.md` | Signal `duel_*` et tirage des paires |
| `docs/ton-plan-c.md` | **Tout texte affiché** : ton, lexique, couleurs Plan C |
| `docs/bibliographie-culture.md` | Sources (lecture humaine, rien à coder) |

## File d'attente

| # | Brief | Statut | Notes |
|---|---|---|---|
| 1 | `feuille-de-route-tags-reco.md` §3, tickets 1 à 14 dans l'ordre | À faire | Mettre à jour le tableau §1 « Ce qui est fait » du brief à chaque ticket mergé. |
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
