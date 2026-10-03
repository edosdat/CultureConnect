# Croix de l'astuce sociale : zone de toucher de 44 px

| | |
|---|---|
| Auteur | Claude Code (design) |
| Date | 2026-10-03 |
| Type | Design, correctif d'accessibilité |
| Source | Relecture design du 03/10 sur la PR #241 |

## Pourquoi
Sous Envie / J'y vais, la ligne « Un Plan C, c'est pas pour être tout seul. » se ferme avec un bouton « × » de **20 px environ** (`px-1 text-xs`, pas de hauteur minimale). Au doigt, on rate la croix ou on touche la ligne d'à côté. Le minimum est **44 × 44 px**.

## Quoi faire
1. Dans `src/components/ShareSocial.tsx`, composant `SocialTipLine`, bouton `social-tip-b1-dismiss` : donner une **zone de toucher** de 44 × 44 px **sans changer le dessin visible** de la croix.
   - Par exemple : `inline-flex min-h-11 min-w-11 items-center justify-center`, plus une marge négative (`-my-3 -mr-2` ou équivalent) pour que la ligne ne grandisse pas.
2. Garder `aria-label="Fermer"`, et le rendre explicite : `aria-label="Fermer l'astuce"`.
3. Ajouter au test existant (`socialTipBeat1.test.ts` ou test du composant) une vérification que le bouton porte bien les classes de taille minimale.

## LOCK
- Le texte « Un Plan C, c'est pas pour être tout seul. » : **LOCK**, inchangé.
- Le dessin de la croix (taille du « × », couleur `culture-muted`, soulignement au survol) : inchangé.
- La logique d'affichage (une fois, après la première Envie ou le premier Partager connecté, drapeau `cc_social_tip_b1_seen`) : inchangée.
- La hauteur de la ligne : inchangée, à 2 px près.

## HOLD
- HOLD merge : Soft Design sur la preview (`?apercu=social`), puis GO.

## Soft Design → GO
Sur la preview `?apercu=social`, sur téléphone :
- la croix se ferme du premier coup en touchant légèrement à côté du « × » ;
- la ligne a exactement la même allure qu'avant (capture avant / après côte à côte).

## Critères d'acceptation
- [ ] Zone cliquable du bouton ≥ 44 × 44 px (mesure dans l'inspecteur, capture jointe).
- [ ] Rendu visible identique (captures avant / après).
- [ ] `npm test` et `tsc` sans nouvelle erreur.
