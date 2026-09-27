# CultureConnect

Agenda culturel autour de Toulouse — calendrier mensuel des évènements (expositions, concerts, théâtre, festivals…).

Interface en français uniquement. Aucune authentification.

## Prérequis

- Node.js 18+ (recommandé 20+)
- npm

## Démarrage

```bash
cd CultureConnect
npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

### Autres commandes

```bash
npm run build    # build de production
npm run start    # servir le build
npm run lint     # ESLint
```

## Données

Les fichiers CSV sont dans `data/` :

| Fichier | Contenu |
|---------|---------|
| `lieux.csv` | Lieux culturels |
| `evenements.csv` | Évènements |
| `programme.csv` | Items de programme liés aux évènements |
| `films.csv` | Une ligne par film. Tags d'œuvre durables (`moods`, `genres_mood`, `themes`) |

### Mise à jour hebdomadaire

1. Remplacez les trois fichiers dans `data/` **en gardant les mêmes noms**.
2. Respectez les colonnes existantes (voir schéma ci-dessous).
3. Relancez le serveur de dev (ou rebuild) : les données sont lues depuis le disque côté serveur.

Schéma attendu :

- **lieux** : `lieu_id`, `nom`, `type`, `adresse`, `commune`, `lat`, `lng`, `dist_km_capitole`, `site_web`, `notes`
- **evenements** : `event_id`, `lieu_id`, `titre`, `categorie`, `date_debut`, `date_fin`, `heure_debut`, `heure_fin`, `prix`, `gratuit`, `url_source`, `description_courte`, `statut`
- **programme** : `programme_id`, `event_id`, `lieu_id`, `nom_item`, `type_item`, `date`, `heure_debut`, `heure_fin`, `scene_salle`, `prix_item`, `url`, `notes`
- **films** : `film_id`, `titre`, `titre_normalise`, `genre_principal`, `nb_seances`, `nb_salles`, `lieux_ids`, `image_url`, `notes`, `moods`, `genres_mood`, `themes`

### Taggage des films

Après chaque sync ciné, le taggage se fait dans `films.csv`, jamais dans `programme.csv`. Le sync réécrit les séances ; un tag posé sur une ligne de `programme.csv` disparaît au sync suivant.

Au chargement, une séance sans tag reçoit le jeu de `films.csv` pour son `film_id`. Si cette ligne n'a aucun tag, le chargement reprend la meilleure ligne sœur déjà taggée dans `programme.csv` (hors `mood_source=parent`). Sinon la séance reste sans tag.

`scripts/backfillFilmTags.ts` est un script **one-shot**. Il copie dans `films.csv` le jeu de tags déjà résolu par cette règle sœur. Il n'écrase jamais une valeur déjà présente, et il ne crée pas de ligne pour un `film_id` absent de `films.csv`. Il ne fait pas partie de `npm run build` ni de `npm test` — ne pas le brancher sur le build.

```bash
npx tsx scripts/backfillFilmTags.ts
```

`data/films-a-tagger.csv` (`film_id`, `titre`, `nb_seances`) liste les films ciné à venir (date ≥ 2026-09-27, `form=cine`) qui n'ont toujours aucun tag, triés par `nb_seances` décroissant. `nb_seances` est la colonne déjà agrégée de `films.csv`. Ce fichier est une liste de travail : le site ne le lit pas, et les tags ne s'y saisissent pas. Le régénérer sans modifier `films.csv` :

```bash
npx tsx scripts/backfillFilmTags.ts --list
```

Notes :

- `gratuit` vaut `oui` / `non`
- Les champs CSV peuvent contenir des virgules (parsing via Papa Parse)
- Les évènements multi-jours apparaissent sur chaque jour entre `date_debut` et `date_fin` (inclus)

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Données CSV locales (pas de base de données)

## Fenêtre affichée

Données ciblées environ du **24 août 2026** au **23 septembre 2026**. Le calendrier s'ouvre par défaut sur **août 2026**.
