# Contraste des boutons pleins terracotta

| | |
|---|---|
| Auteur | Claude Code (design) |
| Date | 2026-10-03 |
| Type | Design, correctif d'accessibilité |
| Source | Relecture design du 03/10 (défaut existant, aucune PR récente ne l'a introduit) |

## Pourquoi
Le texte blanc sur `culture-terracotta` (#E85D3B) n'a qu'un contraste de **3,47:1**. Le minimum pour du texte normal est **4,5:1** (WCAG AA). Ça touche les boutons les plus importants : Envie / J'y vais sélectionnés, connexion, réserver, installer l'appli. Ils sont difficiles à lire en plein soleil ou pour une vue fatiguée.

## Quoi faire
1. Dans `tailwind.config.ts`, ajouter deux couleurs à `culture` :
   - `action: "#C44A2F"` (même valeur que `clay`, contraste avec le blanc **4,81:1**) ;
   - `action-hover: "#A63F27"` (contraste **6,25:1**).
2. Partout où un **fond plein terracotta porte du texte blanc**, remplacer :
   - `bg-culture-terracotta` → `bg-culture-action` ;
   - le survol de ces mêmes éléments (`hover:bg-culture-clay` ou équivalent) → `hover:bg-culture-action-hover` ;
   - la bordure assortie (`border-culture-terracotta` sur le même élément) → `border-culture-action`.
3. Fichiers concernés au 03/10 (à revérifier par une recherche, la liste peut avoir bougé) : `AuthButtons`, `GuestTeaserBell`, `SiteNav`, `ActivityInbox`, `DigestTestIntro`, `AuthActionGate`, `TimeScopeBar`, `AdminDataTables`, `NearMeChip`, `PwaInstall`, `CultureConnectApp`, `MonthCalendar`, `AdminAnalyticsView`, `EventCtaRow`, `ArtisteFavoriControl`, `EventDetail`, `ShareSocial`, `LoginNudge` (dans `src/components/`).
4. Ajouter un test qui calcule le contraste de `culture.action` et `culture.action-hover` contre `#FFFFFF` et échoue sous 4,5:1. La formule de luminance relative WCAG tient en dix lignes ; pas de nouvelle dépendance.

## LOCK
- `culture-terracotta` **reste** la couleur de marque : bordures, icônes, liens, pastilles, textes en gros caractères, fonds sans texte. Ne pas la supprimer ni changer sa valeur.
- C violet, fond crème, couleurs des catégories (`cine`, `musique`…) : inchangés.
- Aucun texte, aucune taille, aucun espacement ne change. Seule la couleur de fond des boutons pleins avec texte blanc fonce un peu.

## HOLD
- HOLD merge : Soft Design sur la preview, puis GO.

## Soft Design → GO
Sur la preview, vérifier :
- Envie et J'y vais sélectionnés, bouton de connexion, « Réserver », bandeau d'installation de l'appli : plus foncés, blanc lisible ;
- au survol (desktop) : encore un peu plus foncé, jamais plus clair ;
- les liens et bordures terracotta ailleurs : **inchangés**.

## Critères d'acceptation
- [ ] Aucune occurrence restante de `bg-culture-terracotta` avec `text-white` sur le même élément (recherche dans `src/`).
- [ ] Test de contraste vert (≥ 4,5:1 pour `action` et `action-hover`).
- [ ] `npm test` et `tsc` sans nouvelle erreur.
- [ ] Captures avant / après d'au moins trois boutons dans la PR.
