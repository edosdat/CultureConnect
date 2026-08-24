# Schéma enrichi (IA) — CultureConnect Toulouse

À partir du 2026-08-24 : pour tout **nouvel** événement scrapé, remplir le maximum de champs ci-dessous (page officielle only).

## evenements.csv (cadre)
Champs historiques + :
- description_longue — synopsis / pitch complet
- tags — mots-clés libres séparés par `|`
- public_cible — tout_public | jeune_public | ado | adulte | pro …
- age_min — entier si indiqué
- duree_min — durée en minutes
- langue — fr, vo, vostfr…
- casting — distribution / lineup texte
- image_url — affiche / visuel
- billetterie_url — lien achat si ≠ url_source
- accessibilite — PMR, malentendant… si mentionné
- organisateur — producteur / festival
- scraped_at — ISO datetime du scrape
- source_extrait — court extrait brut utile à l’IA (≤500 car.)

## programme.csv (grain unitaire)
+ description_item, image_url, billetterie_url, duree_min, public_cible, scraped_at

## artistes.csv
+ bio_courte, url_site, url_reseaux, scraped_at

## Règle merge
- Nouveaux : remplir tout ce qui est disponible sur la page.
- Existants : enrichir uniquement les champs **vides** (jamais écraser une valeur déjà remplie).
