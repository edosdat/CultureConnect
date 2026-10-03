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
        culture: {
          cream: "#FAF6FA",
          surface: "#FFFDFF",
          sand: "#F0E7F0",
          terracotta: "#FF2E7E",
          clay: "#C9145C",
          ink: "#1A0B1E",
          muted: "#6B5A68",
          line: "#E8DEE8",
          sage: "#7A5A8E",
          gold: "#D97706",
          soft: "#FFD9E7",
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
        card: "0 8px 24px rgba(26, 11, 30, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
