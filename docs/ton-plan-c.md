# Plan C — charte de ton et d'identité

Le produit s'appelle désormais **Plan C** (le dépôt garde son nom `CultureConnect`). Ce document fait référence pour toute copie produit, toute couleur et toute nouvelle page. Maquettes : https://claude.ai/artifact/VNovLmaDjewsNqWy91RVq3 (artboard « Charte Plan C »).

## 1. L'idée

Plan C, c'est le **plan culture**… et le clin d'œil que tout le monde comprend. Accroche de référence :

> **Plan C. Parce que le plan A, c'était le canapé, et le plan B, Netflix.**

Le produit emprunte les codes des applis de rencontre (swipe, crush, « ton type ») pour parler de sorties culturelles. Le double sens est un **clin d'œil**, jamais le sujet.

## 2. Règles d'écriture (non négociables)

1. **Chaque phrase marche au premier degré.** Lue « culture », elle est juste et utile. Lue autrement, elle fait sourire.
2. **On suggère, on ne nomme jamais.** Aucun vocabulaire sexuel explicite, aucune partie du corps, jamais l'expression d'origine écrite en toutes lettres.
3. **Jamais sur une personne** : ni les artistes, ni les autres utilisateurs, ni le contenu d'un spectacle réel.
4. **Ton neutre obligatoire** dans : la section jeune public / famille et la famille de profil « Tribu du mercredi » ; les pages légales et `/confidentialite` ; les messages d'erreur liés au compte ou aux données ; toute communication avec les salles, institutions et partenaires.
5. **Pas de pression ni de culpabilité** : « Pas mon genre » oui ; reprocher à quelqu'un de ne pas sortir, non.
6. **Toujours valables** : pas d'humour sur l'âge, l'argent, le milieu social, le genre, l'origine, le physique ou la santé ; tutoiement ; neutre en genre (point médian si inévitable : « partant·e », « gourmand·e ») ; un seul trait d'esprit par écran.

Liste de mots interdits dans la copie (à tester dans le code, comme les familles §B6 du brief tags v2) : le terme d'origine en toutes lettres, et tout vocabulaire sexuel ou anatomique explicite. La liste exacte vit dans `src/lib/copyGuard.ts` (à créer) avec un test.

## 3. Lexique

| Élément | Libellé Plan C |
|---|---|
| Nom affiché | **Plan C** (logo : « Plan » droit + « C » italique rose) |
| Swipe à droite / tampon | **Ça me tente** / `ÇA ME TENTE` |
| Swipe à gauche / tampon | **Pas mon genre** / `PAS MON GENRE` |
| Liste « À voir » | **Mes crushs** |
| Toast après un like | « Nouveau **crush** » + bouton **Proposer un plan** |
| Partager | **Proposer un plan** |
| Message WhatsApp | « J'ai un plan pour {jour}. {Titre}, {Lieu}. » + lien |
| Écran « Mes partages » | **Mes plans** — sous-titre « Qui est partant pour tes plans » |
| Lien reçu (bandeau) | « Quelqu'un a un plan pour toi » |
| Question sur le lien reçu | « Alors, tu en es ? » |
| Réponses | **Envie** / **J'y vais** (inchangées : c'est le contrat de `shareRsvp.ts`) |
| Pas de réponse | « Pas encore de réponse… laisse-leur le temps » |
| Duel (titre) | « Lequel te fait le plus d'effet ? » |
| Duel (boutons) | « Aucun des deux » / « Les deux, gourmand·e » |
| Écran profil | « C'est quoi ton type ? » |
| Onboarding | « Ce soir, t'as un plan ? » + accroche du §1 |
| Liste vide | « T'as fait le tour. Ça arrive à tout le monde. » |
| Badge fin de série | « Plus que deux soirs pour conclure » |
| Gratuit | « Gratuit, sans engagement » |
| Notification | « Un spectacle te fait de l'œil ce soir. » |
| Compteur de cartes | « {n} spectacles te font de l'œil · à droite si ça te tente » |

### Familles et badges renommés

Complète §B2/§B3 de `briefs/tags-v2-evenements-et-profils.md` (les autres noms ne changent pas) :

| id | Ancien nom | Nom Plan C |
|---|---|---|
| `page_blanche` | Page blanche | **Premier rendez-vous** |
| `couteau_suisse` | Couteau suisse | **Cœur d'artichaut** |
| `radar_a_pepites` | Radar à pépites | **Toujours sur le coup avant les autres** |
| badge `noctambule` | Noctambule | **Oiseau de nuit** |
| badge `derniere_minute` | Dernière minute | **Plan de dernière minute** |
| badge `toujours_en_bande` | Toujours en bande | **Jamais sans ma bande** |

`tribu_du_mercredi` garde un ton neutre (règle 4).

## 4. Couleurs

Thème **nuit** par défaut, couleurs vives en accent. Tokens à ajouter dans `tailwind.config.ts` (namespace `planc`) sans supprimer les tokens `culture` tant que le site n'est pas migré.

| Token | Hex | Usage |
|---|---|---|
| `planc.nuit` | `#1A0B1E` | fond de page |
| `planc.velours` | `#2A1231` | cartes, barres, feuilles |
| `planc.sable` | `#3A1840` | pistes de segments, bulles |
| `planc.ligne` | `#4A2350` | bordures |
| `planc.creme` | `#FFF1F4` | texte principal |
| `planc.muted` | `#D3B3CE` | texte secondaire |
| `planc.rose` | `#FF2E7E` | action principale, liens, logo (hover `#FF6FA5`) |
| `planc.peche` | `#FF9E6D` | humour, comédie |
| `planc.aubergine` | `#B98CFF` | concerts |
| `planc.cerise` | `#FF4D6D` | intense, metal |
| `planc.citron` | `#FFD23F` | « Pour toi », badges |
| `planc.menthe` | `#5EEAD4` | jazz, intimiste |

(Oui, pêche et aubergine sont un clin d'œil. Elles restent des noms de couleur, jamais des emojis dans l'UI.)

**Contraste** : texte `nuit` (#1A0B1E) sur toutes les couleurs vives ; texte `creme` sur `nuit` / `velours`. **Jamais de texte blanc ou crème sur le rose** (contraste insuffisant). Focus visible : anneau `rose` 2 px.

Typo inchangée : Fraunces (titres, logo en italique pour le « C ») + DM Sans.

## 5. Avant le lancement public

- **Marque** : vérifier la disponibilité de « Plan C » à l'INPI (classes 9, 41, 42) et le référencement ; le nom est déjà utilisé, notamment par une campagne américaine de santé des femmes.
- **Partenaires** : prévoir une présentation au premier degré (« Plan C, le plan culture »).
- **Stores** : le vocabulaire suggestif peut relever la classification d'âge ; rester dans le clin d'œil.
- **Migration** : `metadata`, balises Open Graph, `opengraph-image.tsx`, e-mails (`src/app/mail`), favicon et `README.md` passent à « Plan C » dans une PR dédiée, avec capture avant/après.
