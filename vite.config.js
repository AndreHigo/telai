import { defineConfig } from "vite";
import packageMetadata from "./package.json" with { type: "json" };
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const webVersion = process.env.TELAI_WEB_VERSION || "2026-09-22";

export default defineConfig({
  root: "frontend",
  base: "/svelte/",
  define: {
    __MIRANTE_VERSION__: JSON.stringify(packageMetadata.version),
    __MIRANTE_WEB_VERSION__: JSON.stringify(webVersion),
  },
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: "../public/svelte",
    emptyOutDir: true,
    sourcemap: false,
    // O shell atual permanece abaixo de 503 kB mesmo com o suporte de threads;
    // a conversa e o processamento de eventos continuam em chunks sob demanda.
    chunkSizeWarningLimit: 503,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
