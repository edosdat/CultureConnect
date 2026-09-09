# Proposer un événement — empty 0-hit search (MVP)

**Trigger:** search **applied** with **0 results** only. Not boot, not Ambiances examples (#48), not date/category empty (« Rien ce week-end »).

## A — Empty invitation

- Title: **Pas encore sur CultureConnect**
- Body: **Un bar, un concert, une date — propose-la, on vérifie.**
- CTA connected: **Proposer cet événement** (+ icon) — filled terracotta
- Guest: **Connexion pour proposer** (outline terracotta) — **0 form**, no anonymous POST
- Under CTA: **Tu aides les salles qu’on rate encore.**
- Colors: cream `#F7F1E8` / terracotta `#C45C3E` / ink `#2C241B`
- Reuse live header/search chrome. Do **not** invent a bottom nav.

**A connected v2** — calendar+ at left of title; ink title; filled CTA.  
**A guest** — query pill (applied search); terracotta title; outline CTA; heart + helper. No logo/nav on the card.

## B — Sheet form

- Title: **Proposer un événement**
- Titre * — prefills from the applied search query (editable)
- Lieu * + helper: **Nouveau lieu OK — bars et salles petites bienvenus.**
- Date * (±heure optional)
- Lien de la prog (optionnel)
- **Envoyer** + **Annuler**
- Sticky Envoyer; validate empty required fields

## C — Match confirm (only if `matched_candidate`)

- **On a trouvé ça — c’est bien ?**
- Preview: titre / lieu / date / vignette
- **Oui, c’est ça** · **Non, continuer la vérif**
- No separate « Vérifier » tab

## D — Pending

- **Merci.** / **On vérifie avant de l’ajouter à l’agenda.**
- Badge: **Proposition reçue**
- Never « publié »

## API / Neon (Connexion)

- `POST /api/propose-event` — session required → INSERT `event_proposals` **pending** (catalogue never written from the client)
- `POST /api/propose-event/:id/confirm` — owner only
- `GET /api/propose-event/mine` — owner list
- Account key = Google email lowercase (same as `account_tastes`)
- Rate: max 5 / email / 24h (Paris clock) → 429
- Dedupe: same `dedupe_key` + email + active status → 409 or existing
- Propose ≠ taste signal (0 bump `account_tastes`)
- Match auto is owned by Recherche. MVP stub → stay `pending` / `needs_review` + UI D. Conservative unique catalogue hit may set `matched_candidate` (read-only).
- Confirm + official HTML `url_prog_candidate` (not FB/IG) may enqueue fill-empty ingest **stub** (no live CSV write). Else `needs_review`.
