import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST || "0.0.0.0";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host,
    port: 1420,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host,
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    host,
    port: 4173,
  },
});
