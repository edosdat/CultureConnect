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
6. **Pièges trouvés en faisant tourner l'appli avec ce thème (aperçu du 03/10)** : sans ces points, des zones restent claires avec du texte clair dessus.
   - **Fond de page** : il est posé en dur par `PWA_BACKGROUND_COLOR` (`src/lib/pwaManifest.ts`), repris dans `src/app/layout.tsx` (style du `<html>` et du `<body>`) et par l'écran de démarrage. Le passer à `#1A0B1E` **dès la PR 1** (et `PWA_THEME_COLOR` aussi), sinon le haut de l'accueil reste crème.
   - **Couleurs claires en dur dans `globals.css`** : `#e8e0d6` (6 fois), `#f5f0ea`, `#fff8f0`, `#f0c4b4`, `#b8d4d5`, et les `rgba(232, 93, 59, …)` / `rgba(95, 122, 90, …)` des dégradés de fond. Les remplacer par sable, velours ou rose / aubergine translucides.
   - `bg-[#fff8f4]` dans `ActivityInbox.tsx` → `bg-culture-surface`.
   - **`bg-culture-ink` (19 fois)** sert de voile sombre sur les images (dates, « VO », « VOSTFR » sur les vignettes ciné). Comme `ink` devient crème, ces pastilles deviennent claires avec du texte blanc : remplacer par `bg-planc-nuit` (avec la même opacité). Même chose pour `text-culture-cream` / `text-culture-surface` (4 fois) → `text-planc-creme`.
7. **Test automatique de contraste** (nouveau fichier de test, sans dépendance) : calcul WCAG des paires suivantes, qui doit échouer sous le seuil :
   - texte : creme et muted sur nuit, velours, sable ≥ 4,5 ;
   - texte : rose sur nuit et velours ≥ 4,5 (**pas de petit texte rose sur sable** : 4,29) ;
   - nuit sur rose et sur rose-hover ≥ 4,5 ;
   - bordures de contrôle sur leur fond ≥ 3.

### PR 2 · Couleurs de catégories, images de partage, appli installée
1. Couleurs de catégories, **dans `tailwind.config.ts` (`culture.cat.*`) ET dans `globals.css` (`--cat-*`)**. Attention : `globals.css` marque cette palette « LOCK — do not change » ; **ce brief lève ce LOCK** (décision du propriétaire du 03/10 pour le thème nuit). Valeurs, lisibles sur fond sombre :

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
3. Images Open Graph (`src/app/api/og`, `opengraph-image.tsx`) : fond nuit, texte crème, accent rose.

### PR 3 · Logo C rose et écran de démarrage
**Décision du propriétaire (03/10) : le C passe en rose #FF2E7E** (variante B). Il remplace le C violet LOCK v3. La forme du C ne change pas, seulement sa couleur.
1. Écran de démarrage (`src/lib/bootShellMarkup.ts`) : fond nuit au lieu de crème ; trait du C `#AF7DDE` → `#FF2E7E` ; texte « On prépare ton agenda… » en `muted` ; pistes animées en `sable` / `ligne`.
2. Régénérer les PNG `public/splash/` avec `scripts/gen-apple-splash.py` : fond nuit, C rose centré.
3. Icônes d'appli : `icon-192.png`, `icon-512.png`, leurs versions `maskable`, `apple-touch-icon.png`, `favicon.ico`. Fond nuit, C rose. Garder les mêmes tailles, noms et zones de sécurité (maskable).
4. Partout ailleurs où le C violet apparaît (rechercher `#AF7DDE` et `plan-c-icon-LOCK-v3-violet` dans `src/` et `public/`, dont `feedback-welcome-c-wink.svg` et le bouton du compositeur de retours) : C rose. Ajouter la nouvelle image sous le nom `plan-c-icon-LOCK-v4-rose`, sans supprimer l'ancienne.
5. Sur une pastille pleine rose, le C passe en nuit (jamais blanc).

### PR 4 · Nom « Plan C » et typographie plus percutante
**Décisions du propriétaire (03/10) :** le nom affiché devient **Plan C**, et les titres doivent être plus percutants, comme dans les maquettes. Mêmes polices qu'aujourd'hui (Fraunces pour les titres, DM Sans pour le texte), seul l'usage change. Peut se faire en parallèle de la PR 2, après le GO de la PR 1.
1. **Nom en haut de page** (`src/components/SiteNav.tsx`) : « CultureConnect » → `Plan <span class="italic">C</span>`.
   - Fraunces 800, 22 px sur mobile (24 px à partir de `sm`), lettres serrées (`tracking-tight`), texte crème ;
   - le **C en italique et en rose** ;
   - `aria-label="Plan C, accueil"` sur le lien.
2. **Nom partout ailleurs** : titre et métadonnées de `src/app/layout.tsx`, images de partage (`opengraph-image.tsx`, `api/og`). Ne pas toucher aux identifiants techniques, au nom du repo ni aux URL.
3. **Fraunces** (`layout.tsx`) : charger aussi le poids 800 et l'italique (`weight: ['500','600','700','800']`, `style: ['normal','italic']`).
4. **Titres** (`.font-display`), dans `globals.css` ou en classes :
   - graisse **700** par défaut (aujourd'hui ils tombent sur 500) ;
   - lettres légèrement serrées (`-0.015em`), interligne 1,1 ;
   - **un cran plus gros** sur mobile : `text-lg` 20 px, `text-xl` 24 px, `text-2xl` 28 px, `text-3xl` 34 px, `text-4xl` 40 px et graisse 800.
5. Vérifier que rien ne déborde ni ne passe sur trois lignes à 360 px de large (titres de fiche, Top 3, Mes crushs, Ciné). Sinon, garder la taille actuelle pour ce titre-là et le noter dans la PR.

**Soft Design** : comparer l'en-tête, l'accueil et une fiche avant / après sur téléphone. Référence visuelle : l'aperçu du 03/10 joint au fil de discussion du propriétaire (nom « Plan *C* », titres gras).

### PR 5 · Hiérarchie et simplicité (« un seul rose »)
Proposition design validée par le propriétaire le 03/10 (« vas-y, propose »). Images de référence dans `briefs/2026-10-03-theme-nuit-ref/` :
- `typo-apres-1.png` : état après PR 1 à 4 ;
- `propo-1-accueil.png` : les règles ci-dessous appliquées à l'accueil actuel ;
- `ideal-accueil-fiche.png` : cible à terme (accueil et fiche).

Les polices de cette dernière image sont des polices de remplacement (rendu hors ligne) ; la référence reste Fraunces + DM Sans.

**Règles**
1. **Couleur 60 / 30 / 10** : nuit et velours pour les fonds, crème pour le texte, rose rare.
2. **Un seul bouton rose plein par écran** : l'action principale (Connecte-toi sur l'accueil invité, Réserver sur la fiche). Ensuite :
   - action secondaire = contour crème 1,5 px à 50 % (ex. « Télécharger l'appli », Envie, J'y vais) ;
   - action tertiaire = texte rose (« voir tout ») ;
   - le reste sans couleur.
3. **Onglet actif** (« Agenda ») : texte crème + trait rose de 2 px dessous. Plus de pastille pleine.
4. **Filtre sélectionné** (`cc-axes__chip` actif, ex. « Toulouse », « Ce soir ») : fond crème, texte nuit, sans bordure. Non sélectionné : contour `ligne`.
5. **Catégories en touches** : pastille de 8 px ou filet, jamais d'aplat plein ni de cadre épais. Le cadre de 2 px coloré de la section Ciné devient un filet de 1 px `ligne` ; la pastille « THÉÂTRE & DANSE » pleine devient un contour avec point de couleur.
6. **Titres de section sans soulignement** (`span.border-b-2` sous Mes crushs, Le top 3, Ciné : à retirer). L'accent possible : **un mot en italique rose** (« Mes *crushs* »), avec parcimonie : au plus un par écran.
7. **Échelle de texte** : 40 (titre de page), 28 (sections), 20 (titres de cartes), 16 (texte), 13 (légendes). Rien d'autre.
8. **Espacement en multiples de 8 px** (8, 16, 24, 32 entre sections) plutôt que des traits ; cartes velours aux coins de 20 px, sans contour.

**Fiche spectacle (cible `ideal-accueil-fiche.png`, à faire dans une PR à part si c'est trop gros)**
- Le titre n'apparaît **qu'une fois**, sous l'affiche (aujourd'hui il est à la fois sur l'image et dessous).
- La barre du bas reste visible au défilement : prix à gauche, **Réserver** (rose plein) à droite.
- La ligne « qui vient » (Envie / J'y vais des amis) remonte juste sous le titre.

**Soft Design** : comparer avec `propo-1-accueil.png` ; un seul rose plein visible par écran au premier coup d'œil.

## LOCK
- PR 1 à 3 : textes, mises en page, tailles, comportements **inchangés** ; seules les couleurs changent. La PR 4 change seulement le nom affiché et la typographie des titres.
- La **forme** du C reste celle du LOCK v3 ; seule sa couleur change (rose, PR 3). PR 1 et PR 2 ne touchent pas au logo.
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

## Décidé
- Hiérarchie « un seul rose plein par écran » et simplification (PR 5), proposée et validée le 03/10.
- Nom affiché : **Plan C**, C en italique rose (03/10).
- Titres : mêmes polices, plus gras et un cran plus gros (03/10).
- C du logo : **rose #FF2E7E** (variante B, choisie le 03/10 sur comparaison visuelle). Contraste sur nuit 5,35:1.
