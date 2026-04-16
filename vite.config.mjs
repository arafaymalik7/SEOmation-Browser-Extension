import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyManifest() {
  return {
    name: "copy-manifest",
    closeBundle() {
      const src = path.resolve(__dirname, "manifest.json");
      const dest = path.resolve(__dirname, "dist", "manifest.json");
      fs.copyFileSync(src, dest);

      const iconsSrc = path.resolve(__dirname, "icons");
      const iconsDest = path.resolve(__dirname, "dist", "icons");
      if (fs.existsSync(iconsSrc)) {
        fs.mkdirSync(iconsDest, { recursive: true });
        for (const entry of fs.readdirSync(iconsSrc)) {
          fs.copyFileSync(path.join(iconsSrc, entry), path.join(iconsDest, entry));
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "popup.html"),
        background: path.resolve(__dirname, "src/background/index.ts"),
        content: path.resolve(__dirname, "src/content/index.ts")
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          if (chunkInfo.name === "content") {
            return "content.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
