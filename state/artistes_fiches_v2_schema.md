# Artistes fiches V2 — dates passé + futur (+ tournée)

Agenda public CultureConnect = **Toulouse + dates ≥ aujourd’hui** (grille).
Fiche artiste = **toutes** les dates stockées : passé TLS + futur TLS + tournée hors TLS.

## Fichiers
- `state/artistes_dates_v1.csv` — 1 ligne = 1 date
- `state/catalogue_artistes_v1.csv` — fiche (entity_id, nom, kind, urls)

## Colonnes dates
entity_id, kind (live|film), date, ville, lieu_nom, lieu_id, source_url, scope (toulouse|tournee)

## Règles
- source_url = page prog **officielle** déjà en CSV (salle). 0 agrégateur seul.
- scope=toulouse : dates programme CultureConnect (passé+futur).
- scope=tournee : uniquement si page **artiste officielle** (pas Songkick/Shotgun). V1 tournée = fill-empty.
- 0 Vercel depuis recherche events. Add-only Git.

## Exemple A0220 Master Boot Record
- Passé TLS : 2025-10-02 Toulouse Le Bikini — `https://mbrserver.com/TOUR/` (page officielle)
- Futur TLS (agenda) : 2026-11-08 Toulouse Le Rex — page prog Rex + même page officielle
- Tournée hors TLS : 2026-11-05 Lyon Ô Totem Live — `https://mbrserver.com/TOUR/` (`scope=tournee`)

Dump dates : `state/artistes_dates_v1.csv` (4474+ lignes TLS depuis programme, tournée fill-empty sauf cet exemple).
