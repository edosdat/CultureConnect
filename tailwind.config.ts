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
          cream: "#FBF6F0",
          sand: "#F3E8DA",
          terracotta: "#C45C3E",
          clay: "#A8452F",
          ink: "#2C241B",
          muted: "#6B5E52",
          sage: "#6B8F71",
          gold: "#D4A017",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
