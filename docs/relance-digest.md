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

## Destinataires — fenêtre test jusqu’au 1er décembre 2026

Exception produit (GO Eloi), assumée jusqu’au **1er décembre 2026 à 00:00** (Europe/Paris). Pendant cette fenêtre, Relance écrit à **tous les e-mails Google enregistrés**. La case `mail_consent.opted_in` n’est pas un filtre. Site n’envoie aucun mail.

Il n’y a pas de table NextAuth `users` (session JWT). Les e-mails viennent de :

- `account_tastes.user_key`
- `google_accounts.email` (écrit à chaque login Google à partir de ce déploiement)
- `mail_consent.user_key` (session Google)

Un login antérieur sans ligne `account_tastes` et sans ligne `mail_consent` n’est pas dans la liste tant que la personne ne se reconnecte pas.

Exclus uniquement si `mail_consent.unsubscribed_at` est renseigné (lien 1 clic). L’absence de ligne, ou une case non cochée, **n’exclut pas** avant le 1er décembre 2026.

À partir de cette heure, le même endpoint ne garde que `opted_in = true` et non désabonnés. Ne pas prolonger l’exception sans un nouveau GO.

### Liste

`GET /api/mail-digest/recipients`

`Authorization: Bearer` = `RELANCE_DIGEST_SECRET`, ou `CRON_SECRET` si le premier n’est pas posé. Les deux sont acceptés quand les deux sont posés. Secret absent ou faux : **401**. Base illisible : **503** — ne pas envoyer sur une liste vide inventée.

```bash
curl -sS 'https://<host>/api/mail-digest/recipients' \
  -H "Authorization: Bearer $RELANCE_DIGEST_SECRET"
```

```json
{
  "count": 1,
  "users": [
    { "userId": "ada@example.com", "email": "ada@example.com" }
  ]
}
```

`userId` est l’e-mail normalisé : c’est la seule clé de compte durable (`token.sub` n’est pas stocké).

Cet endpoint de liste ne score pas. Le corps du mail part de `GET /api/mail-digest/profiles`, puis `POST /api/agenda?reco=1&digest=relance`.

### Profils

`GET /api/mail-digest/profiles`

Même `Authorization: Bearer` que la liste (`RELANCE_DIGEST_SECRET`, ou `CRON_SECRET` si le premier n’est pas posé). Les deux sont acceptés quand les deux sont posés. Secret absent ou faux : **401**. Base illisible : **503** — ne pas envoyer sur des profils inventés.

Même destinataires que `/api/mail-digest/recipients` (même fenêtre, désabonnés exclus). Pour chaque e-mail, jointure `account_tastes` sur `user_key` (trim + minuscules). Pas de ligne, ou un `state` illisible : `profile` vide et `excludeWorkIds` vide. Le compte reste dans la liste.

`profile` est le corps du POST digeste : `moods`, `genres`, `themes` (`weight` + `pct`), lus comme le compte dans l’app. Pas d’e-mail dans `profile`, pas de signaux bruts, pas de texte libre. `excludeWorkIds` reprend les œuvres « pas pour moi » encore dans les 40 derniers signaux (`f:` / `e:` / `p:`). `commune` est `null` : la ville choisie dans l’agenda n’est pas stockée sur le compte. `null` = métropole. Cet endpoint ne score pas.

```bash
curl -sS 'https://<host>/api/mail-digest/profiles' \
  -H "Authorization: Bearer $RELANCE_DIGEST_SECRET"
```

```json
{
  "count": 1,
  "users": [
    {
      "userId": "ada@example.com",
      "email": "ada@example.com",
      "profile": { "moods": {}, "genres": {}, "themes": {} },
      "excludeWorkIds": [],
      "commune": null
    }
  ]
}
```

### Désabonnement 1 clic

Chaque mail porte :

`https://<host>/mail/unsub?t=<token>`

Le clic n’exige pas de login Google. La page répond « Tu ne recevras plus le digeste. » et lie vers [Confidentialité](/confidentialite), où la case « Envoie-moi 3 idées par mail » réabonne (`unsubscribed_at` effacé).

Jeton (HMAC-SHA256) :

1. `email` = trim + minuscules.
2. JSON canonique, clés dans cet ordre, sans espace : `{"v":1,"e":"<email>","p":"digest-unsub"}`.
3. `payload` = base64url(UTF-8 de ce JSON), sans `=`.
4. `sig` = base64url(HMAC-SHA256(secret, `payload`)), sans `=`. Le HMAC signe la chaîne `payload`, pas le JSON brut.
5. `token` = `payload` + `.` + `sig`.

Secret de signature : `RELANCE_DIGEST_SECRET` s’il est défini, sinon `CRON_SECRET`. Site vérifie les deux. Le lien n’expire pas : un ancien mail désabonne à nouveau après une réinscription.

Exemple, secret `test-secret`, e-mail `ada@example.com` :

```text
/mail/unsub?t=eyJ2IjoxLCJlIjoiYWRhQGV4YW1wbGUuY29tIiwicCI6ImRpZ2VzdC11bnN1YiJ9.q3XFSvSW_TgJDNogC3o9ku75_GbEzqxa_jSfiXxpF0I
```
