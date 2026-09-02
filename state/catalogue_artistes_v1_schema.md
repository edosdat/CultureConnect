# Catalogue artistes / films V1 — schéma

Dump extract-only. 0 recode site. 0 invention.

`state/catalogue_artistes_v1.csv`

| champ | rôle |
|---|---|
| entity_id | Fxxxx / Axxxx / Txxxx |
| kind | film \| musique \| theatre \| autre |
| nom | libellé |
| source_table | films \| artistes \| programme |
| source_id | id source |
| url_officielle | page prog **salle** (pas agrégateur) |
| url_artiste_officielle | page artiste — V1 vide si absente du CSV |
| date_premiere_tls | 1re séance Toulouse (passé+futur) — **agenda** |
| date_derniere_tls | dernière séance Toulouse — **agenda** |
| n_seances_tls | nb séances Toulouse |
| lieux_ids | `\|` |
| dates_tournee | hors Toulouse, **fiche only** — V1 vide ; fill-empty si URL artiste officielle |

Agenda CultureConnect = `*_tls` seulement. Tournée autorisée sur la fiche.
