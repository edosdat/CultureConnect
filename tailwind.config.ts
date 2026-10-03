import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        planc: {
          nuit: "#1A0B1E",
          velours: "#2A1231",
          sable: "#3A1840",
          ligne: "#4A2350",
          creme: "#FFF1F4",
          muted: "#D3B3CE",
          rose: "#FF2E7E",
          "rose-hover": "#FF6FA5",
          peche: "#FF9E6D",
          aubergine: "#B98CFF",
          cerise: "#FF4D6D",
          citron: "#FFD23F",
          menthe: "#5EEAD4",
          /* muted #D3B3CE à 60 % sur velours #2A1231 — bordure de contrôle, ≥ 3:1 */
          controle: "#8F738F",
        },
        /* alias temporaire, à renommer en planc.* */
        culture: {
          cream: "#1A0B1E",
          surface: "#2A1231",
          sand: "#3A1840",
          terracotta: "#FF2E7E",
          clay: "#FF6FA5",
          ink: "#FFF1F4",
          muted: "#D3B3CE",
          line: "#4A2350",
          sage: "#5EEAD4",
          gold: "#FFD23F",
          soft: "#4A1838",
          cat: {
            cine: "#E85D3B",
            musique: "#6B3FA0",
            theatre: "#0D7377",
            festival: "#BE185D",
            expo: "#334155",
            enfants: "#CA8A04",
            cinema: "#E85D3B",
            famille: "#CA8A04",
          },
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1rem",
        "card-lg": "1.25rem",
      },
      boxShadow: {
        card: "0 8px 24px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
