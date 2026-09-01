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

### Mise à jour hebdomadaire

1. Remplacez les trois fichiers dans `data/` **en gardant les mêmes noms**.
2. Respectez les colonnes existantes (voir schéma ci-dessous).
3. Relancez le serveur de dev (ou rebuild) : les données sont lues depuis le disque côté serveur.

Schéma attendu :

- **lieux** : `lieu_id`, `nom`, `type`, `adresse`, `commune`, `lat`, `lng`, `dist_km_capitole`, `site_web`, `notes`
- **evenements** : `event_id`, `lieu_id`, `titre`, `categorie`, `date_debut`, `date_fin`, `heure_debut`, `heure_fin`, `prix`, `gratuit`, `url_source`, `description_courte`, `statut`
- **programme** : `programme_id`, `event_id`, `lieu_id`, `nom_item`, `type_item`, `date`, `heure_debut`, `heure_fin`, `scene_salle`, `prix_item`, `url`, `notes`

Notes :

- `gratuit` vaut `oui` / `non`
- Les champs CSV peuvent contenir des virgules (parsing via Papa Parse)
- Les évènements multi-jours apparaissent sur chaque jour entre `date_debut` et `date_fin` (inclus)

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Données CSV locales (pas de base de données)

## Fenêtre affichée

Données ciblées environ du **24 août 2026** au **23 septembre 2026**. Le calendrier s'ouvre par défaut sur **août 2026**.
