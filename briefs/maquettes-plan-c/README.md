# Maquettes Plan C : écrans et recommandations design

| | |
|---|---|
| Auteur | Claude Code (design) |
| Date | 2026-10-03 |
| Type | Brief seulement : référence design. **Zéro changement de produit.** |
| Source | Canevas Plan C (claude.ai, version 24), exporté tel quel dans `ecrans/` |

## Quoi faire

Rien à coder directement. Ce dossier sert de **référence** aux agents de code (Cursor, ou un autre modèle) et à l'équipe. Chaque fonctionnalité tirée d'ici aura son propre brief, sur sa propre PR « brief seulement », avec ses LOCK et HOLD.

## Comment lire `ecrans/`

- Un fichier `.dc.html` = un écran de téléphone (390 × 844) ou une planche explicative (880 de large).
- Le HTML et les styles en ligne donnent les **tailles, espacements, textes et couleurs exacts**. Le bloc `<script type="text/x-dc">` donne le **comportement** (états, ce qui se passe au tap). Les `{{…}}` sont des valeurs calculées par ce script.
- Ils ne s'ouvrent pas seuls dans un navigateur : ils ont besoin du moteur du canevas (`support.js`, non fourni). Lisez-les comme des spécifications.
- `canvas.json` donne l'ordre des écrans, leurs titres et les notes de décision (clés `s1` à `s6`).
- Les affiches (`/_blob/…`) sont des **visuels d'illustration** générés pour la maquette. Dans l'appli, utiliser la vraie affiche du catalogue (`image_url`).

## Les parcours

| # | Parcours | Écrans | Ce qu'il faut retenir |
|---|---|---|---|
| 1 | Première connexion | `W1_Bienvenue` → `W1_Duels` (le « + » ouvre `W1_Fiche`) → `ProfilType` | **3 duels**, celui du haut ou celui du bas. « Aucun des deux » et « Les deux » toujours possibles. Le « + » ouvre la fiche plein écran sans perdre le duel. À la fin, « C'est quoi ton type ? » avec un retour pour refaire les duels. |
| 2 | Connexion classique | `W2_Swipe` → `W2_Semaine` / `Recherche` / `Filtres` → `W2_Fiche` | **5 plans** de la semaine à swiper. Droite = ça me tente, gauche = pas mon genre, **vers le haut ou bouton horloge = plus tard** (neutre, n'apprend rien). Recherche toujours en haut, la semaine par défaut, ce soir en premier. |
| 3 | Calibrage | `W3_Logique` → `W3_Calibrage` | Un duel glissé dans les 5 plans **seulement si le profil hésite**. Au plus 1 par série, 3 par semaine, toujours deux vrais spectacles réservables. Seuils à mesurer sur le banc avant de coder. |
| 4 | Inviter à un plan C | `W4_Partage` → `W4_LienRecu` → `W4_MaBande` | Message tout prêt (3 choix), WhatsApp en un tap. Le lien s'ouvre **sans l'appli**. Envie / J'y vais : **connexion Google en un tap ; sans compte Google, juste un prénom**. Le prénom de celui qui invite s'affiche (« Julie t'invite à un plan C »). |
| 5 | Mood du moment | `M1_Mix` (+ variante `M2_Carte`, explication `M3_Logique`) | **Table de mixage** : 5 curseurs (Rire, Frisson, Émotion, Fête, Cérébral) réglés au départ sur le type, mix tout prêts, crossfader « Mon type ↔ Ce soir » (70 % par défaut), 10 plans qui bougent en direct. **En attente** de la nouvelle grille de tags (voir PR #243). |
| — | Charte | `Charte` | Lexique Plan C : swipe à droite = « Ça me tente », à gauche = « Pas mon genre », partager = « Inviter à un plan C », mes partages = « Mes plans ». |

## Recommandations design (par priorité)

1. **Couleurs : thème nuit, décidé le 03/10.** L'appli passe sur la palette sombre des maquettes (nuit #1A0B1E, velours, rose #FF2E7E, aubergine, couleurs vives par ambiance). Le chantier est décrit dans son propre brief : `briefs/2026-10-03-theme-nuit-plan-c.md`. Ne pas recolorer à partir de ce dossier.
2. **Lisibilité, quel que soit le thème.**
   - Texte normal : contraste d'au moins 4,5:1.
   - **Jamais de texte blanc sur le rose #FF2E7E** (3,5:1) ni sur la terracotta #E85D3B (3,47:1). Sur ces couleurs, texte foncé ; pour un bouton plein avec texte blanc, une couleur plus foncée (voir PR #246).
3. **Cibles tactiles d'au moins 44 × 44 px** pour tout ce qui se touche (voir PR #247). Vrais `<button>`, `aria-label` sur les boutons qui n'ont qu'une icône.
4. **Textes : suivre `docs/ton-plan-c.md`.** Complice, jamais vulgaire. Jamais de remarque sur l'âge, l'argent ou le milieu : le badge s'appelle **« Chasseur de bons plans »**, pas « Malin du gratuit ».
5. **Pas de récompense pour remplir le profil** : ni points, ni badge de complétion, ni série de jours. L'écran « C'est quoi ton type ? » est un retour d'information avec un moyen de corriger, et c'est ce qui le rend utile.
6. **Les données réelles d'abord** : vrais spectacles, vraies salles, vrais prix, « Prix non communiqué » quand il manque. Jamais de valeur inventée.

## LOCK
- Ce dossier ne se merge pas et ne modifie aucun fichier du produit.
- Les décisions listées dans « Les parcours » sont prises. Pour en changer une, poser la question dans un commentaire de cette PR, sans l'appliquer de soi-même.

## HOLD
- Rien à merger. Les fonctionnalités se coderont à partir de briefs dédiés, chacun avec Soft Design puis GO.

## Questions ouvertes (décision de l'équipe)
- C du logo : violet (LOCK v3) ou rose des maquettes, sur fond nuit ?
- Où accéder au mix : bouton à côté de la recherche, ou 4e onglet ?
- Un mix réglé change-t-il le profil, ou seulement la soirée ?
- Quelqu'un qui arrive par un lien vers un film : il atterrit où ?
