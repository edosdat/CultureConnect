import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        culture: {
          cream: "#F7F0E8",
          surface: "#FFFCF8",
          sand: "#F3E8DA",
          terracotta: "#E85D3B",
          clay: "#C44A2F",
          ink: "#1C1917",
          muted: "#57534E",
          line: "#E7E0D8",
          sage: "#5F7A5A",
          gold: "#D97706",
          soft: "#F6D5C8",
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
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1rem",
        "card-lg": "1.25rem",
      },
      boxShadow: {
        card: "0 8px 24px rgba(28, 25, 23, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
