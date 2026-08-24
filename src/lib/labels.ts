export const CATEGORIE_LABELS: Record<string, string> = {
  atelier: "Atelier",
  autre: "Autre",
  cirque: "Cirque",
  cinema: "Cinéma",
  cinematheque: "Cinémathèque",
  cinema_plein_air: "Cinéma plein air",
  concert: "Concert",
  conference: "Conférence",
  danse: "Danse",
  enfants_famille: "Enfants / familles",
  expo_patrimoine: "Expo & patrimoine",
  expo_spectacle: "Expo / spectacle",
  exposition: "Exposition",
  lecture: "Lecture",
  festival: "Festival",
  festival_cinema: "Festival cinéma",
  festival_estival: "Festival estival",
  festival_multi: "Festival multi",
  festival_musique: "Festival musique",
  festival_theatre: "Festival théâtre",
  humour: "Humour",
  guinguette: "Guinguette",
  opera: "Opéra",
  salon: "Salon",
  "soirée": "Soirée",
  theatre: "Théâtre",
  visite: "Visite",
};

export function labelCategorie(categorie: string): string {
  return CATEGORIE_LABELS[categorie] ?? categorie;
}

export const MONTH_NAMES_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export const WEEKDAY_NAMES_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function formatDateFr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function formatHeure(h: string): string {
  if (!h) return "";
  return h.slice(0, 5);
}

export function formatPrix(event: { prix: string; gratuit: string }): string {
  if (event.gratuit?.toLowerCase() === "oui") return "Gratuit";
  if (event.prix) return event.prix;
  return "Tarif non indiqué";
}

/** Prefer item price; fall back to parent event price/gratuit. */
export function formatItemPrix(
  prixItem: string | undefined,
  event?: { prix: string; gratuit: string } | null,
): string {
  if (prixItem) {
    if (prixItem.toLowerCase() === "gratuit") return "Gratuit";
    return prixItem;
  }
  if (event) return formatPrix(event);
  return "Tarif non indiqué";
}

export function formatDateRange(debut: string, fin: string): string {
  if (!debut) return "";
  if (!fin || fin === debut) return formatDateFr(debut);
  return `${formatDateFr(debut)} → ${formatDateFr(fin)}`;
}

export function labelTypeItem(type: string): string {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
