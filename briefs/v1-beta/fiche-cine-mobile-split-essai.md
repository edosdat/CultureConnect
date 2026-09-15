# Essai — fiche ciné mobile split (380)

Eloi GO ship 15/09 (malgré prop Design KEEP stack)  
Web split (#129) = KEEP · **ciné only** sur mobile

## Layout cible B
~32% cadre affiche | ~68% texte + Prop A (Réserver + share + ⋯)

## Critères QA 380 (LOCK Eloi)
| # | Règle | Verdict |
|---|---|---|
| 1 | Affiche **lisible** (pas crop illisible) | PASS/FAIL |
| 2 | Slot image = cadre **max largeur + max hauteur** (pas une énorme photo) | PASS/FAIL |
| 3 | Affiche **contain** dans le cadre | PASS/FAIL |
| 4 | Hauteur bloc image **calée sur le texte** — pas plus haute que le contenu texte utile | PASS/FAIL |
| 5 | **Ciné only** ; théâtre/musique/etc. restent **stack** | PASS/FAIL |

## Prop Design (historique)
KEEP stack — override Eloi pour essai.

## Mock
`/workspace/briefs/v1-beta/mocks/fiche-cine-mobile-split-essai-380.html` (+ `.png`)
