# Avis — widget et lecture admin

Bouton rond Plan C en bas à droite (nom accessible « Un avis ? »). Le panneau envoie un texte court. Une réponse automatique peut suivre. Le fil se lit sur `/admin/feedback`.

Le widget est masqué sur `/admin`. Il se place au-dessus du bandeau cookies (`data-consent-banner`) et se cache tant que la feuille d’installation PWA est ouverte.

## Lire les fils

1. Se connecter avec un compte listé dans `ADMIN_EMAILS` (`src/lib/homeEventsCounter.ts`).
2. Ouvrir `/admin/feedback`.
3. Toute autre session : la page répond 404 (`notFound`), l’API `GET /api/admin/feedback` aussi.

Chaque ligne, la plus récente en tête, jusqu’à 80 (`FEEDBACK_ADMIN_CAP`) :

| Champ | Contenu |
|---|---|
| kind | `avis`, `idee` (affiché « idée »), `bug` ou `autre` |
| date | Europe/Paris |
| acteur | Compte, Visiteur ou Anonyme |
| ref | empreinte 16 hex du compte, ou `cc_vid`, ou rien |
| texte | message rédigé (e-mail et téléphone FR déjà masqués) |
| réponse | phrase courte, ou la formule de repli |

Pas d’e-mail en clair. Jamais l’empreinte et `cc_vid` sur la même ligne. L’adresse IP n’est pas une colonne.

`GET /api/admin/feedback` renvoie le même lot en JSON `{ notes }`, même garde admin.

## Neon

Dès que `POSTGRES_URL` (ou `POSTGRES_URL_NON_POOLING`) est posé, les lignes vont dans Neon, table `feedback_notes` (région Paris, comme le reste du compte).

Colonnes : `id`, `kind`, `body`, `user_key`, `cc_vid`, `reply`, `created_at`. Contrainte : `user_key` ou `cc_vid`, pas les deux.

La table et les index se créent au premier accès (`CREATE TABLE IF NOT EXISTS`). Pas de migration séparée pour le kind `bug` : `kind` est du texte.

Sans URL Postgres, ou avec `FEEDBACK_STORE=file`, repli fichier local (tests et machine de dev). `FEEDBACK_STORE_DIR` choisit le dossier. Ce repli n’est pas la prod.

## Kinds

`avis` · `idee` · `bug` · `autre` (`FEEDBACK_KINDS`).

| Saisie | `kind` stocké |
|---|---|
| Chip **Suggestion** | `idee` |
| Chip **Bug** | `bug` |
| Pas de chip | classification du modèle, sinon `autre` |

Le chip gagne sur le modèle. Un `kind` inconnu (`suggestion`, vide, autre mot) est ignoré : on retombe sur le modèle, puis `autre`.

`POST /api/feedback` accepte `{ "text": "…", "kind": "bug" }` ou un formulaire `multipart` (`text`, `kind`, `image`). `kind` est optionnel. Le texte : 2 à 400 caractères, ou vide si une image est jointe. Le modèle ne reçoit que le texte rédigé, pas l’empreinte, pas `cc_vid`, pas l’e-mail, pas l’image.

## Capture

Un trombone dans la barre du champ (« Joindre une capture », 40 px) ouvre le sélecteur du système (`input type=file`, `accept="image/*"`). Pas de seconde pastille, pas de `getDisplayMedia`, pas de caméra maison. Une image par message, 5 Mo maximum sur le fichier choisi. Le navigateur ré-encode en JPEG (bord long 1920 px) avant l’envoi, ce qui retire les métadonnées (GPS, EXIF). Le serveur ne garde qu’un JPEG, et retire à nouveau ces métadonnées.

L’aperçu (vignette, libellé « Capture », retrait) est dans le compositeur. Après l’envoi, la vignette reste dans la bulle de la personne, dans le fil de la session. L’admin la voit sur la note (`GET /api/admin/feedback/:id/image`, même garde, `Cache-Control: private`). La liste admin n’embarque pas les octets.

Stockage : colonnes `image_mime` et `image_bytes` sur `feedback_notes` (Neon, Paris). Pas de fichier public, pas d’URL externe. Même purge 90 jours, même effacement de compte. Le repli fichier local range l’image à côté de la note (tests seulement).

Hors de cette version : vidéo, OCR, notification push, PDF, plusieurs fichiers.

## Limites

Fenêtre glissante d’une heure.

| Clé | Plafond | Où ça vit |
|---|---|---|
| Acteur (empreinte de compte, sinon `cc_vid`, sinon seau anonyme lié à l’IP) | **10** / h (`FEEDBACK_RATE_PER_HOUR`) | mémoire du process **et**, pour un compte ou un `cc_vid`, compteur en base |
| IP | **20** / h (`FEEDBACK_IP_RATE_PER_HOUR`) | mémoire du process seulement |

Quatre ou cinq messages d’affilée restent sous le plafond acteur. Le plafond IP laisse passer plusieurs comptes derrière la même adresse.

Au-delà : HTTP 429, « Trop de messages d’un coup. Réessaie plus tard. » Le modèle n’est pas appelé.

La mémoire repart à zéro si l’instance redémarre. Le compteur en base, lui, tient : un compte qui a déjà envoyé 10 notes dans l’heure reste bloqué après un redémarrage. L’IP, non : elle n’est pas stockée.

## Rétention 90 jours

`FEEDBACK_RETENTION_DAYS = 90`. Une ligne plus vieille que ce délai sort de la lecture admin et est supprimable.

Effacement d’un compte (« Supprimer mon compte ») retire les notes de cette empreinte, sans attendre les 90 jours. Un visiteur sans compte n’a pas ce bouton : l’effacement avant terme passe par le contact indiqué sur `/confidentialite`.

## Purge

Cron Vercel, tous les jours à 04:00 UTC (`vercel.json`, `0 4 * * *`) :

`GET /api/feedback/purge` avec `Authorization: Bearer $CRON_SECRET`.

Secret absent ou faux : 401. Succès : `{ "ok": true, "deleted": N }`.

Filet : un envoi et l’ouverture de `/admin/feedback` purgent aussi. Si le cron manque et que personne n’écrit ni n’ouvre l’admin, une ligne périmée peut rester jusqu’au prochain passage. La lecture admin la cache quand même (filtre sur la date).
