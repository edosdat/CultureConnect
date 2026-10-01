# OAuth Google — erreur Configuration (ops)

Runbook interne. Aucune valeur secrète ici : noms de variables et URL publiques seulement.

## Symptôme

Un **nouveau** compte Gmail arrive sur la page Auth.js :

> There is a problem with the server configuration.

URL typique : `/api/auth/error?error=Configuration`.

Les comptes déjà autorisés sur l’écran de consentement peuvent encore se connecter. Ce n’est pas un texte à changer dans l’app.

## Ce que veut dire Configuration

Auth.js stoppe le flux : la config serveur est incomplète, ou Google refuse le compte avant d’émettre un jeton. Vérifier dans cet ordre.

1. Écran de consentement Google Cloud encore en **Testing**, et ce Gmail n’est pas un utilisateur test.
2. Vercel **Production** : `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` absents ou vides.
3. `AUTH_URL` qui n’est pas l’origine canonique (sans chemin).
4. URI de redirection absente ou différente du client OAuth.

Si **tous** les comptes échouent (y compris un ancien qui marchait), commencer par les variables Vercel. Si seuls les Gmail jamais ajoutés échouent, c’est le consentement.

## Consentement : Testing ou Production

Google Cloud Console → APIs & Services → OAuth consent screen.

| État | Qui peut se connecter |
|---|---|
| **Testing** | Uniquement les adresses listées dans Test users. Un Gmail nouveau est refusé ; Auth.js affiche Configuration. |
| **Production** | N’importe quel compte Google. Tant que l’app n’est pas vérifiée par Google, l’écran « non vérifié » et le quota associé s’appliquent. |

Action pour le FAIL des nouveaux Gmail : passer l’écran en **Production**.

Tant que l’écran reste en Testing : OAuth consent screen → Test users → Add users, avec l’adresse Gmail exacte, puis réessayer la connexion.

## URI de redirection

Client OAuth 2.0 → Authorized redirect URIs. Identiques à `.env.example`, sans slash de trop :

- `http://localhost:3000/api/auth/callback/google`
- `https://culture-connect-2q8c-three.vercel.app/api/auth/callback/google`

## Variables Vercel (Production)

Noms seulement. Ne pas coller les valeurs dans ce fichier, un ticket, un chat ou des logs.

| Nom | Rôle |
|---|---|
| `AUTH_SECRET` | Secret Auth.js. Obligatoire. |
| `AUTH_GOOGLE_ID` | Client ID. Alias lus par le code : `GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_ID`. |
| `AUTH_GOOGLE_SECRET` | Client secret. Alias : `GOOGLE_CLIENT_SECRET`, `AUTH_GOOGLE_CLIENT_SECRET`. |
| `AUTH_URL` | Origine canonique, ex. `https://culture-connect-2q8c-three.vercel.app` |

Préférer les noms `AUTH_*`. Après un changement d’environnement, redéployer Production : le serveur les lit au démarrage.

## Vérifier que Google est annoncé

```bash
curl -sS https://culture-connect-2q8c-three.vercel.app/api/auth/providers
```

Attendu : un JSON avec une clé `google`. L’app s’en sert de la même façon (`data.google`). Pas de clé `google` : identifiants vides au runtime, le provider n’est pas utilisable.

La réponse ne contient pas le secret. Ne pas afficher ni copier `AUTH_SECRET` ou `AUTH_GOOGLE_SECRET`.
