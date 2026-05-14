import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rune: {
          ink: "var(--color-ink)",
          parchment: "var(--color-parchment)",
          vellum: "var(--color-vellum)",
          sepia: "var(--color-sepia)",
          gold: "var(--color-gold)",
          "gold-dim": "var(--color-gold-dim)",
          crimson: "var(--color-crimson)",
          sage: "var(--color-sage)",
          mist: "var(--color-mist)",
          border: "var(--color-border)",
          "border-strong": "var(--color-border-strong)",
        },
      },
      fontFamily: {
        "rune-serif": ["Georgia", "Times New Roman", "Times", "serif"],
        "rune-sans": [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
