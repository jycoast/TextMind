import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@wails": fileURLToPath(new URL("./wailsjs", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ["monaco-editor"],
        },
      },
    },
  },
  server: {
    port: 34115,
    strictPort: true,
  },
});
