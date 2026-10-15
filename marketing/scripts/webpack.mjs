// The one webpack override, shared by the CLI (remotion.config.ts) and the
// scripts: `@/` → the repository's src/, and React, ReactDOM and lucide
// pinned to the application's single copies in the repository root.

import path from "node:path";

// Resolved from the working directory: the CLI compiles remotion.config.ts
// to CommonJS, where import.meta is unavailable. Run from marketing/.
const REPO = path.resolve(process.cwd(), "..");

export const webpackOverride = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      "@": path.join(REPO, "src"),
      react: path.join(REPO, "node_modules/react"),
      "react-dom": path.join(REPO, "node_modules/react-dom"),
      "lucide-react": path.join(REPO, "node_modules/lucide-react"),
    },
  },
});
