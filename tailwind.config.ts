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
        // 1. Map 'sans' to Inter (for the UI/Sidebars)
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        // 2. Map 'serif' to Newsreader (for the Prose/Editor)
        serif: ["var(--font-newsreader)", "ui-serif", "Georgia", "serif"],
        
        // KEEP these as aliases if you've already used them in your components
        "rune-serif": ["var(--font-newsreader)", "serif"],
        "rune-sans": ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;