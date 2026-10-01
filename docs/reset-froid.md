# Reset froid (admin)

Bouton **Reset froid / comme 1ʳᵉ visite** dans le chrome `/admin`. Il s’affiche seulement si l’e-mail de session est dans `ADMIN_EMAILS` (même gate que le menu Analytics / Admin). Une confirmation précède l’effacement.

Le froid est **côté client seulement**. L’historique KV `cc:vs:*` (et le reste du KV) n’est pas purgé. Zéro écriture Neon. Zéro mutation de `account_tastes`. Le compte Google n’est pas supprimé : seule la session Plan C sur cet appareil se ferme.

## Ordre

`cc_vid` est HttpOnly. La route `POST /api/admin/cold-reset` l’expire pendant que la session admin est encore valide (sinon 404), puis le client appelle `signOut` et ouvre `/`.

1. Deux `Set-Cookie` séparés : `cc_vid`, puis `cc_signals_v1`. Jamais un JSON de profil qui joindrait l’identifiant visiteur au compte.
2. Autres cookies Plan C, chacun à part : `cc_cohort`, `cc_signals_consent`, cache HttpOnly `cc_account_taste` (pas la ligne Neon), `cc_mail_ideas`.
3. `signOut` : cookie de session Google sur cet appareil. Le hook existant expire aussi `cc_account_taste` sans `DELETE` en base.
4. Stockage local dont la clé commence par `cc_`, `cc.`, `planc_` ou `culture-connect`, plus le marqueur mémoire `__plancInstallPrompt`.

## Clés couvertes par les préfixes

Profil de session `cc_account_profile_v1`, miroir `cc_signals_v1`, drapeau `cc_vid_posed`, notice `cc_taste_cookie_notice`, `cc_login_nudge_dismissed`, `cc_auth_hint`, visites `cc_share_visit:*`, `cc_share_activity_last_seen`, `cc_share_created_tokens`, `cc_digest_test_intro`, `cc_digest_intro_synced`, `cc_mes_recos_week_v1`, `cc.favorites.v1`, `cc.profileReco.v1`, A2HS `planc_a2hs_*` (dont `planc_a2hs_day`).

## Nouveau visiteur

Aucun mint dans ce reset. Le premier signal invité passe par `POST /api/signals` → `commitGuestSignals`, qui pose un `cc_vid` neuf : `v_` + 8–12 caractères, TTL 14 jours, `SameSite=Lax`, `Secure`, `HttpOnly`.

Le cookie `cc_cohort` est effacé. Si le déploiement définit `CC_BETA_COHORT`, ce libellé d’environnement reste la cohorte des signaux suivants (comportement déjà en place, pas un nouveau chemin).
