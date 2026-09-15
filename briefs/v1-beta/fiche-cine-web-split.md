# Fiche ciné — web split + action compacte

**GO Eloi 2026-09-15** · réf shot L’Odyssée live  
Mobile Prop A KEEP · Site draft après lock Design

## Before / after (desktop ≥ ~900 / 1280)

| | Live baseline (`fiche-cine-live-ref.png`) | Target (`fiche-cine-web-split-1280`) |
|---|---|---|
| Layout | Full-bleed hero **above** the text (stack) | **~1/4 image \| ~3/4 texte** on the same row |
| Réserver | Full-width bar next to horaire | Compact, `shrink-0` — never `w-full` / `flex-1` |
| Fold | Description pushed under the hero | Description in the 3/4 column, above the fold |
| Status | **FAIL** — do not ship this on web | **GO** |

Mocks: `briefs/v1-beta/mocks/fiche-cine-live-ref.png` (before) · `fiche-cine-web-split-1280.html` (after).

## Mobile (~380)
Stack actuel : image top → texte.  
Rangée : `Réserver` + share 3 nœuds + `⋯` (Prop A). Do not regress.

## Rangée action — 1 ligne (web + mobile alignés)
```
[salle · horaire · VOSTFR]  [Réserver compact]  [share 3 nœuds]  [⋯]
```
- Share **près séance** (= cette séance), pas collé au titre
- **Réserver full-width = FAIL** (live ref)
- Agenda / favori / .ics → `⋯`

## Hors scope
S8b contour · S1 header · Matching A
