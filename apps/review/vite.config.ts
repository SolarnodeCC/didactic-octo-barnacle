import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The single-page app of the owner review tool (ADR 0116). The Worker serves the build output
// in dist/client as static assets; `web/public/_headers` sets the security headers on them.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    // No inline module preload polyfill, so the CSP needs no inline script (ADR 0016).
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
});
