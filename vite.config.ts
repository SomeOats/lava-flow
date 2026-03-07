import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Helper to recursively copy a directory (used to copy src/templates → dist/templates).
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  // public/ is copied verbatim to dist/ — this is where module.json lives.
  publicDir: "public",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,

    rollupOptions: {
      // Entry point is src/ts/module.ts
      input: resolve(__dirname, "src/ts/module.ts"),
      output: {
        // Path matches "esmodules" in module.json
        entryFileNames: "scripts/lava-flow.js",
        format: "es",
        inlineDynamicImports: true,
      },
    },
  },

  plugins: [
    {
      // Copy src/templates → dist/templates after each build.
      // Vite's publicDir only watches the public/ folder, so we handle
      // src/templates with this small plugin.
      name: "copy-templates",
      closeBundle() {
        copyDir(
          resolve(__dirname, "src/templates"),
          resolve(__dirname, "dist/templates"),
        );
        console.log("lava-flow | templates copied to dist/templates");
      },
    },
  ],
});
