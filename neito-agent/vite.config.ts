import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";
const root = process.cwd();

function copyLocalUiFiles(): Plugin {
  return {
    name: "copy-local-ui-files",
    closeBundle() {
      const source = path.resolve(root, "ui");
      const output = path.resolve(root, "dist");
      if (!fs.existsSync(source)) return;
      fs.cpSync(source, output, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyLocalUiFiles()],
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
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: { host, port: 4173 },
});
