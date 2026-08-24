# Audit qualité dates — 24 août 2026 (PT)

Objectif : détecter / corriger les bugs de type **off-by-one** (cf. Rex L076) et les décalages titre↔date sur les lieux musique & théâtre à risque.

**L076 Le Rex : non modifié** (47 événements déjà corrigés).

## Synthèse par lieu

| Lieu | Statut | Notes |
|------|--------|-------|
| L083 Le Bikini | **corrigé** | Dates Unfaced/Young Gods/Convention OK (pas d'off-by-one UTC). Corrections heures + After 28/08 + ajout Fat Freddy's 28/09. Autres club nights sept non exhaustives (hors bug date). |
| L082 Le Metronum | **corrigé** | E017 OK; ajout Labess 24/09, Zinée 25/09, Paloma Colombe 26/09 (homepage officielle). |
| L081 Salle Nougaro | **corrigé** | Sept: Jérémy Rollando 25/09 20h30. Oct+ (Ben l'Oncle Soul etc.) non importés (hors fenêtre priorité sept). |
| L078 Le Bijou | **OK** | Despechadas Night 29/08 OK; Soirées 9–10/09 OK (titres non détaillés sur site) |
| L075 Le Taquin | **corrigé** | WCS JSON revalidé: 13/15 dates sept déjà OK; +2 manquants (24–25/09) ajoutés. Sample 5 IDs intactes. |
| L079 Zénith Toulouse Métropole | **corrigé** | Lieu était vide — 4 événements sept ajoutés depuis homepage (NEJ marqué annulé). |
| L070 Halle aux Grains | **bloqué** | Page lieu ONCT sans calendrier daté; pas d'événements sept trouvés via WebFetch. Bikini liste des événements @ Halle hors Bikini — non importés ici. |
| L062 Odyssud | **corrigé** | Dates 24/09 Rythme Feu et 26/09 Rentrée OK vs odyssud.com; doublons scrapes fusionnés. |
| L040 Théâtre du Capitole | **OK** | Rusalka 22/09,25/09,27/09,30/09,04/10 + conférence 18/09 18h — match exact page officielle. |
| L044 Théâtre Sorano | **corrigé** | Dates 11/09, 19/09, 30/09 confirmées homepage Sorano; doublons titre court/long fusionnés. |
| L048 La Comédie de Toulouse | **suspect** | Dates sept des spectacles nommés (E370–E377) cohérentes avec URLs; nombreux doublons scrapes où titre=date (E066/E074/…) — pas d'off-by-one détecté sur échantillon. Nettoyage massif hors scope audit dates. |
| L049 Théâtre le Fil à Plomb | **corrigé** | Échantillon sept: dates Présentation/One Man Band/Amir/Stella cohérentes; doublons fusionnés. |
| L050 Théâtre Garonne | **OK** | Celui qui voit 12/09 15:30 — échantillon OK (cache agenda). |
| L042 Cave Poésie René-Gouzenne | **corrigé** | Dates titre↔jour OK (E391=2026-09-12, E392=2026-09-15, E393=2026-09-18, E394=2026-09-19, E396=2026-09-26, E397=2026-09-29); Tentative multi-dates complétée. Chez René aussi 20/09 non ajouté (mineur). |
| L041 ThéâtredelaCité (CDN) | **corrigé** | Qui som 23/09–03/10, Complicité 26/09 14h, Qui garde 26/09 17h30, JEP 19/09 — OK; doublon Qui garde fusionné. |
| L076 Le Rex | **OK** | Déjà corrigé (47 events) — non modifié par cet audit. |

## Analyse interne CSV (avant corrections)

- **Doublons lieu+date titres différents** : nombreux sur L048 (titre=date vs titre spectacle), L044/L062/L049/L041 (double scrape).
- **Dates non croissantes vs ordre CSV** : aucun backtrack détecté.
- **Heures 00:00** : aucun. **23:55** : Rex (techno, intentionnel) + Bikini club (UTC Sanity 21:55Z → 23:55 Paris) — pas un bug.
- **Programme hors [date_debut, date_fin]** : 3 lignes P1496–P1498 (event_id E380 erroné → Pont Neuf E060).

## Corrections appliquées

1. **[corrigé]** L046/L048 — P1496: event_id E380→E060 (programme Pont Neuf mal lié à MARA MORENO E380)
2. **[corrigé]** L046/L048 — P1497: event_id E380→E060 (programme Pont Neuf mal lié à MARA MORENO E380)
3. **[corrigé]** L046/L048 — P1498: event_id E380→E060 (programme Pont Neuf mal lié à MARA MORENO E380)
4. **[corrigé]** L083 — E022: titre/heure/URL — After Officiel MODESTEP (23:55), plus Rampage Poney Club
5. **[corrigé]** L083 — E052 Modestep supprimé (doublon de l'after E022 du 28/08)
6. **[corrigé]** L083 — E054 Unfaced: heure 23:55 (UTC Sanity 21:55Z), genre electro, titre lineup
7. **[corrigé]** L083 — E055 The Young Gods: heure 19:30 (UTC 17:30Z), URL officielle
8. **[OK]** L083 — E027 Convention du disque 20/09 10:00 — date/heure OK (Sanity 08:00Z)
9. **[corrigé]** L083 — E442 ajouté: FAT FREDDY'S DROP 2026-09-28 19:30 (manquant)
10. **[corrigé]** L082 — E443 ajouté: Labess + Tiwiza 2026-09-24
11. **[corrigé]** L082 — E444 ajouté: Zinée + Etane 2026-09-25
12. **[corrigé]** L082 — E445 ajouté: Paloma Colombe + La Louuve + Shahzen(xxx) 2026-09-26
13. **[OK]** L082 — E017 Juliette Magnevasoa 04/09 — date OK
14. **[corrigé]** L081 — E446 ajouté: Jérémy Rollando 2026-09-25 20:30 (lieu était vide)
15. **[OK]** L078 — Despechadas Night 29/08 OK; Soirées 9–10/09 OK (titres non détaillés sur site)
16. **[corrigé]** L075 — E447 ajouté: Bernard Sellam And The Boyz From The Hood 2026-09-24 21:00
17. **[corrigé]** L075 — E448 ajouté: Gabriel Delmas invite Jakob Manz + JAM 2026-09-25 21:00
18. **[corrigé]** L079 — E449 ajouté: LA DAME DE PIERRE 2026-09-23 (ouvert)
19. **[corrigé]** L079 — E450 ajouté: Star Wars par L'Orchestre National Capitole Toulouse 2026-09-24 (ouvert)
20. **[corrigé]** L079 — E451 ajouté: Hexagone MMA 2026-09-25 (ouvert)
21. **[corrigé]** L079 — E452 ajouté: NEJ 2026-09-26 (annulé)
22. **[bloqué]** L070 — Page lieu ONCT sans calendrier daté; pas d'événements sept trouvés via WebFetch. Bikini liste des événements @ Halle hors Bikini — non importés ici.
23. **[corrigé]** L062 — Doublon E187 fusionné dans E335 (même date 2026-09-24)
24. **[corrigé]** L062 — Doublon E188 fusionné dans E336 (même date 2026-09-26)
25. **[OK]** L040 — Rusalka 22/09,25/09,27/09,30/09,04/10 + conférence 18/09 18h — match exact page officielle.
26. **[corrigé]** L044 — Doublon E056→E320 (2026-09-11 Nous sommes des filles sans histoire — C) — dates OK 11/19/30 sept
27. **[corrigé]** L044 — Doublon E057→E321 (2026-09-19 Tu viens voir mon patrimoine ? — Cie Hyp) — dates OK 11/19/30 sept
28. **[corrigé]** L044 — Doublon E058→E322 (2026-09-30 Portrait de Rita — Laurène Marx / Cie Ha) — dates OK 11/19/30 sept
29. **[suspect]** L048 — Dates sept des spectacles nommés (E370–E377) cohérentes avec URLs; nombreux doublons scrapes où titre=date (E066/E074/…) — pas d'off-by-one détecté sur échantillon. Nettoyage massif hors scope audit dates.
30. **[corrigé]** L049 — Doublon E151→E399 (2026-09-17)
31. **[corrigé]** L049 — Doublon E150→E400 (2026-09-17)
32. **[OK]** L050 — Celui qui voit 12/09 15:30 — échantillon OK (cache agenda).
33. **[corrigé]** L042 — E395 Tentative: date_fin→30/09 + programme 24/25/27/30 (dates confirmées agenda live)
34. **[corrigé]** L041 — Doublon E043→E313 Qui garde les enfants 26/09 17:30
35. **[OK]** L041 — Qui som? 23/09–03/10 confirmé cite-prog
36. **[OK]** L076 — Intact — aucune modification.

## Méthode rescrape

- Bikini : Sanity JSON embarqué (`lebikini.com/programmation`) — dates ISO UTC converties Europe/Paris.
- Metronum / Nougaro / Zénith / Odyssud / Capitole Rusalka : WebFetch / curl pages officielles.
- Taquin : revalidation `wcs_tdata_2` depuis `/workspace/sources/lieux/taquin-concerts-a-venir-live.html`.
- Cave Poésie : agenda live curl 24/08.
- Sorano / Cité / Comédie / Fil / Garonne : pages live ou caches scrape du jour.

## Fichiers republies

- `/workspace/bdd-evenements-toulouse/` (csv + xlsx + ce rapport)
- `/workspace/bdd-evenements-toulouse.xlsx`
- `/workspace/CultureConnect/data/`
- `/home/box/agent-data/bdd-evenements-toulouse.xlsx`
- agent-data sand `.../bdd-evenements-toulouse/`

_Généré 2026-08-24T12:23:24Z_