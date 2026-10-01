# Relance — digeste reco (2 fenêtres)

Payload pour l’e-mail Relance. Même score que la feuille **Mes recos de la semaine** (`recommendForProfile`, plafond 3, `scope=semaine`). Ce n’est pas l’ordre du catalogue, ni le Top 3 invité (`scope=tous`).

La feuille UI et le Top 3 d’accueil ne changent pas : toujours 3 cartes maximum.

## Appel

`POST /api/agenda?reco=1`

`digest=relance` dans la query **ou** dans le JSON (les deux ensemble, c’est le même appel). Sans `reco=1`, réponse 400. Un `GET` avec `digest` répond 400.

```bash
curl -s -X POST 'https://<host>/api/agenda?reco=1&digest=relance' \
  -H 'content-type: application/json' \
  -d '{
    "digest": "relance",
    "commune": "Toulouse",
    "profile": {
      "moods": { "intimiste": { "weight": 40, "pct": 80 } },
      "genres": { "jazz": { "weight": 20, "pct": 40 } },
      "themes": {}
    },
    "excludeWorkIds": []
  }'
```

`profile` est le même objet que le POST reco de l’app : `moods`, `genres`, `themes` (`weight` + `pct`). Pas d’e-mail, pas de signaux bruts. `excludeWorkIds` reprend les œuvres « pas pour moi » (`f:` / `e:` / `p:` ou id d’œuvre). `commune` filtre comme l’agenda (`null` ou absent = métropole).

Pas de paramètre enfants. Le score lit le même profil que Mes recos (`moods`, `genres`, `themes`). Le chip Enfants du catalogue ne filtre pas cet appel. Relance ne force pas « kids = non » ici : si le profil n’a pas ces goûts, c’est le profil qui le dit.

`scope` est ignoré quand `digest=relance`. `scope=sam_dim` ou `scope=lun_ven` **sans** `digest=relance` répond 400. Ne pas utiliser `scope=weekend` : ce chip inclut le vendredi quand on est vendredi.

## Fenêtres (Europe/Paris)

Semaine civile du lundi au dimanche, la même que la clé `YYYY-Www` de Mes recos.

| Slice | Jours | Id |
|---|---|---|
| 1 | samedi et dimanche | `sam_dim` |
| 2 | lundi à vendredi | `lun_ven` |

Les séances déjà passées (jour Paris strictement avant aujourd’hui, ou créneau déjà commencé) sont retirées, comme pour Mes recos. Un appel le dimanche renvoie donc un `lun_ven` vide et un `sam_dim` égal au top semaine (il ne reste que le dimanche). `date_from` / `date_to` restent les bornes civiles de la fenêtre, même si une partie est passée.

Quand aujourd’hui tombe dans la fenêtre, les œuvres déjà retenues pour « aujourd’hui » sont écartées, comme sur `scope=semaine`.

## Réponse

```json
{
  "digest": "relance",
  "score": "mes-recos-semaine",
  "timezone": "Europe/Paris",
  "weekKey": "2026-W40",
  "parisIso": "2026-10-01",
  "weekday": 4,
  "commune": "Toulouse",
  "slices": [
    {
      "id": "sam_dim",
      "date_from": "2026-10-03",
      "date_to": "2026-10-04",
      "total": 3,
      "items": []
    },
    {
      "id": "lun_ven",
      "date_from": "2026-09-28",
      "date_to": "2026-10-02",
      "total": 3,
      "items": []
    }
  ]
}
```

`items` a la même forme que `POST /api/agenda?reco=1` (cartes allégées). `total` vaut `items.length`, au plus 3. L’ordre des slices est fixe : `sam_dim`, puis `lun_ven`.

`weekday` suit le calendrier Paris : 0 = dimanche, 1 = lundi, …, 6 = samedi.
