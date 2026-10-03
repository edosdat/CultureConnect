# Thème nuit Plan C : passer l'appli sur la palette sombre des maquettes

| | |
|---|---|
| Auteur | Claude Code (design) |
| Date | 2026-10-03 |
| Type | Design, changement de thème. **Décision du propriétaire du 03/10 : thème sombre, plus punchy, au plus près des maquettes.** |
| Source | Maquettes Plan C (PR « brief seulement » #251, `briefs/maquettes-plan-c/`) ; tokens de `docs/ton-plan-c.md` (section palette) |
| Remplace | PR #246 (contraste terracotta), devenue sans objet |

## Pourquoi
L'appli est aujourd'hui crème et terracotta. Plan C doit ressembler à ses maquettes : fond nuit, accents rose et aubergine, couleurs vives par ambiance. Le changement doit rester **lisible partout** : c'est le seul vrai risque d'un thème sombre.

## Ne pas partir de la branche `feat/palette-plan-c`
Elle a été poussée sans brief. Elle remappe les couleurs, mais laisse **53 `bg-white`** (cartes blanches, et texte devenu clair dessus, donc illisible) et du **texte blanc sur le rose** (3,53:1). Repartir de `main`.

## Quoi faire, en 3 PR successives

### PR 1 · Couleurs de base + lisibilité (le gros du travail)
1. `tailwind.config.ts` : ajouter le namespace `planc` tel que défini dans `docs/ton-plan-c.md` (nuit, velours, sable, ligne, creme, muted, rose, peche, aubergine, cerise, citron, menthe), plus `rose-hover: #FF6FA5`.
2. Toujours dans `tailwind.config.ts`, **remapper les valeurs** de `culture.*` pour que les ~950 classes existantes basculent d'un coup, sans renommage :

   | Token existant | Nouvelle valeur | Rôle |
   |---|---|---|
   | `cream` | `#1A0B1E` (nuit) | fond de page |
   | `surface` | `#2A1231` (velours) | cartes, feuilles, barres |
   | `sand` | `#3A1840` (sable) | fonds secondaires, pistes |
   | `line` | `#4A2350` (ligne) | séparateurs |
   | `ink` | `#FFF1F4` (crème) | texte principal |
   | `muted` | `#D3B3CE` | texte secondaire |
   | `terracotta` | `#FF2E7E` (rose) | action, liens, accent |
   | `clay` | `#FF6FA5` | survol de l'action (plus clair sur fond sombre) |
   | `soft` | `#4A1838` | fond teinté rose |
   | `sage` | `#5EEAD4` (menthe) | |
   | `gold` | `#FFD23F` (citron) | |

   Faire la même chose dans les variables `--cc-*` de `src/app/globals.css`. Ajouter un commentaire « alias temporaire, à renommer en `planc.*` » au-dessus de `culture`.
3. **Texte sur le rose : toujours foncé.** Partout où `bg-culture-terracotta` (ou `planc-rose`) porte `text-white`, remplacer par `text-planc-nuit` (5,35:1). **Jamais de blanc sur le rose** (3,53:1).
4. **Blancs codés en dur** :
   - les 53 `bg-white` (et `hover:bg-white`) → `bg-culture-surface` ;
   - les 35 `text-white` : sur le rose → `text-planc-nuit` ; sur une photo ou un voile sombre → `text-planc-creme` ;
   - ombres `rgba(28,25,23,…)` → `rgba(0,0,0,…)` plus marquées (le noir léger ne se voit pas sur fond nuit).
5. **Champs de saisie et bordures qui délimitent un contrôle** (champ de recherche, boutons en contour Envie / J'y vais) : contraste de la bordure d'au moins 3:1 sur leur fond. `ligne` (#4A2350) ne suffit pas (1,34:1 sur velours) : utiliser `muted` à 60 % ou une couleur plus claire, à mesurer.
6. **Test automatique de contraste** (nouveau fichier de test, sans dépendance) : calcul WCAG des paires suivantes, qui doit échouer sous le seuil :
   - texte : creme et muted sur nuit, velours, sable ≥ 4,5 ;
   - texte : rose sur nuit et velours ≥ 4,5 (**pas de petit texte rose sur sable** : 4,29) ;
   - nuit sur rose et sur rose-hover ≥ 4,5 ;
   - bordures de contrôle sur leur fond ≥ 3.

### PR 2 · Couleurs de catégories, images de partage, appli installée
1. Couleurs de catégories (`culture.cat.*`), lisibles sur fond sombre :

   | Catégorie | Avant | Après |
   |---|---|---|
   | cine / cinema | #E85D3B | `#FF9E6D` (pêche) |
   | musique | #6B3FA0 | `#B98CFF` (aubergine) |
   | theatre | #0D7377 | `#5EEAD4` (menthe) |
   | festival | #BE185D | `#FF4D6D` (cerise) |
   | expo | #334155 | `#9FB3C8` |
   | enfants / famille | #CA8A04 | `#FFD23F` (citron) |

   Ces couleurs servent en texte, bordure ou pastille. Si une pastille pleine porte du texte : **texte nuit**. Ajouter ces paires au test de contraste (≥ 4,5 sur nuit et velours ; toutes passent).
2. Les ~100 couleurs hexadécimales en dur dans `src/` : remplacer celles du thème clair par les tokens. Ne pas toucher aux couleurs de données (affiches, cartes).
3. `pwaManifest.ts` : `theme_color` et `background_color` = `#1A0B1E`. Images Open Graph (`src/app/api/og`, `opengraph-image.tsx`) : fond nuit, texte crème, accent rose.

### PR 3 · Écran de démarrage (après réponse à la question ci-dessous)
- Fond du splash et du `#cc-boot-shell` : nuit au lieu de crème ; régénérer les PNG `public/splash/` avec `scripts/gen-apple-splash.py`.

## LOCK
- Textes, mises en page, tailles, comportements : **inchangés**. Seules les couleurs changent.
- Le **C violet (LOCK v3)** reste tel quel, dans sa forme et sa couleur, tant que la question ci-dessous n'est pas tranchée.
- Pas de renommage des classes `culture-*` dans ces PR (alias seulement). Le renommage en `planc-*` viendra dans un brief séparé.

## HOLD
- Chaque PR : HOLD merge, Soft Design sur la preview, puis GO. Ne pas enchaîner la PR 2 avant le GO de la PR 1.

## Soft Design → GO (à vérifier sur la preview, sur téléphone)
- Accueil invité et accueil connecté (Mes crushs, Top 3, carrousel ciné).
- Fiche spectacle : Envie / J'y vais (états normal et sélectionné), Réserver, prix.
- Recherche avec et sans résultat, filtres.
- Connexion rapide (feuille), bandeau « Télécharger l'appli », Mes partages.
- Rien de blanc qui « flashe », aucun texte qu'on doit plisser les yeux pour lire.

## Critères d'acceptation (PR 1)
- [ ] Plus aucun `bg-white` dans `src/` (hors cas justifié dans la PR).
- [ ] Plus aucun `text-white` sur un fond rose.
- [ ] Test de contraste vert.
- [ ] `npm test` et `tsc` sans nouvelle erreur.
- [ ] Captures avant / après des 4 écrans de la liste Soft Design.

## Question ouverte
- Le **C violet** du logo sur fond nuit : on le garde violet (il ressort bien), ou on passe au **C rose** des maquettes ? Tant que ce n'est pas tranché : violet, LOCK.
