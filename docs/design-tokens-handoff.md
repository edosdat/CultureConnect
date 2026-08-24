# Handoff tokens Tailwind — CultureConnect

**Statut** : prêt à brancher après validation Eloi (go P0).  
**Compat** : Tailwind `3.4.x`, Next 15 App Router.  
**Principe** : étendre `culture.*` existant (pas de casse des classes actuelles) + ajouter `culture.cat.*` et CSS variables.

Fichiers cibles :
- `tailwind.config.ts`
- `src/app/globals.css`

---

## 1. Remplacer `theme.extend` dans `tailwind.config.ts`

Garder `content` et `fontFamily` tels quels. Remplacer le bloc `colors.culture` par :

```ts
colors: {
  culture: {
    cream: "#F7F0E8",      // fond page (était #FBF6F0)
    surface: "#FFFCF8",    // cartes
    sand: "#F3E8DA",
    terracotta: "#E85D3B", // accent saturé (était #C45C3E)
    clay: "#C44A2F",       // hover / pressed
    ink: "#1C1917",        // texte (était #2C241B)
    muted: "#57534E",
    line: "#E7E0D8",
    sage: "#5F7A5A",
    gold: "#D97706",
    soft: "#F6D5C8",       // fond chip actif léger
    cat: {
      musique: "#E85D3B",
      theatre: "#7C3A6E",
      festival: "#D97706",
      cinema: "#3730A3",
      expo: "#5F7A5A",
      famille: "#0F766E",
    },
  },
},
borderRadius: {
  card: "1rem",      // 16px
  "card-lg": "1.25rem", // 20px
},
boxShadow: {
  card: "0 8px 24px rgba(28, 25, 23, 0.06)",
},
```

Classes utiles ensuite :
- `bg-culture-cream` / `bg-culture-surface`
- `text-culture-ink` / `text-culture-muted`
- `bg-culture-terracotta` / `text-culture-terracotta`
- `bg-culture-cat-musique` … `bg-culture-cat-famille`
- `rounded-card` / `shadow-card`

### Mapping catégorie CSV → token

| Label UI | Token Tailwind |
|----------|----------------|
| Musique | `culture-cat-musique` |
| Théâtre & danse | `culture-cat-theatre` |
| Festival | `culture-cat-festival` |
| Cinéma | `culture-cat-cinema` |
| Expo & patrimoine | `culture-cat-expo` |
| Enfants / familles | `culture-cat-famille` |

Helper suggéré (`src/lib/categoryColor.ts`) :

```ts
const CAT: Record<string, string> = {
  Musique: "bg-culture-cat-musique",
  "Théâtre & danse": "bg-culture-cat-theatre",
  Festival: "bg-culture-cat-festival",
  Cinéma: "bg-culture-cat-cinema",
  "Expo & patrimoine": "bg-culture-cat-expo",
  "Enfants / familles": "bg-culture-cat-famille",
};
export function catBg(label: string) {
  return CAT[label] ?? "bg-culture-muted";
}
```

---

## 2. Mettre à jour `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  --cc-cream: #f7f0e8;
  --cc-surface: #fffcf8;
  --cc-terracotta: #e85d3b;
  --cc-clay: #c44a2f;
  --cc-ink: #1c1917;
  --cc-muted: #57534e;
  --cc-line: #e7e0d8;
  --cc-soft: #f6d5c8;
}

html {
  scroll-behavior: smooth;
}

body {
  min-height: 100vh;
  background:
    radial-gradient(ellipse at top left, rgba(232, 93, 59, 0.10), transparent 45%),
    radial-gradient(ellipse at bottom right, rgba(95, 122, 90, 0.10), transparent 40%),
    var(--cc-cream);
  color: var(--cc-ink);
}

::selection {
  background: rgba(232, 93, 59, 0.28);
}

/* Focus visible confiance / a11y */
:focus-visible {
  outline: 2px solid var(--cc-terracotta);
  outline-offset: 2px;
}
```

---

## 3. Fichier config complet proposé

Voir aussi `docs/snippets/tailwind.config.proposed.ts` (copie drop-in du fichier entier).

---

## 4. Ordre d’intégration recommandé (P0 visuel)
1. Merge tokens (ce handoff) — low risk, classes existantes `culture-terracotta` etc. changent juste de teinte.
2. Appliquer `bg-culture-surface` + `shadow-card` + `rounded-card` sur les cartes séance.
3. Pastilles catégorie → `catBg(...)`.
4. Ensuite structure UX (TimeScopeBar, grille) selon `docs/design-brief.md`.

**Ne pas** committer l’implémentation UX P0 sans go Eloi — tokens + brief docs OK pour référence durable.
