import { defineConfig, PluginOption } from "vite";
import { resolve, join } from "path";
import { readFileSync, copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

// Helper to recursively copy a directory (used to copy src/templates → dist/templates).
function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return; // if src doesn't exist, nothing to do
  mkdirSync(dest, { recursive: true }); // create directory structure
  for (const entry of readdirSync(src)) { // loop through all contents in src
    const srcPath = join(src, entry); // path to source file
    const destPath = join(dest, entry); // path to target destination file
    statSync(srcPath).isDirectory() ? copyDir(srcPath, destPath) : copyFileSync(srcPath, destPath);
    // if it's a directory, recurse. otherwise copy the file
  }
}

/** Copy a single file into destDir if the file exists at the project root. */
function copyIfExists(filename: string, destDir: string) {
  if (existsSync(filename)) {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(filename, join(destDir, filename));
  }
}

/**
 * Copies all static assets to outDir after each build:
 *   module.json  →  dist/
 *   templates/   →  dist/templates/
 *   lang/        →  dist/lang/
 *   css/         →  dist/css/
 *   LICENSE, README.md, CHANGELOG.md  →  dist/
 */
function copyAssetsPlugin(outDir: string): PluginOption {
  return {
    name: "lava-flow-copy-assets",
    closeBundle() {
      copyIfExists("module.json", outDir);
      copyDir("templates", join(outDir, "templates"));
      copyDir("lang",      join(outDir, "lang"));
      copyDir("css",       join(outDir, "css"));
      for (const f of ["LICENSE", "README.md", "CHANGELOG.md"]) {
        copyIfExists(f, outDir);
      }
      console.log(`lava-flow | assets copied to ${outDir}`);
    },
  };
}

const outDir  = "dist";
const isWatch = process.env.WATCH === "1";

export default defineConfig({
  // No publicDir — module.json lives at the project root and is copied by
  // copyAssetsPlugin, keeping the same layout as the old gulpfile.
  publicDir: false,

  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    watch: isWatch ? {} : null,

    rollupOptions: {
      input: resolve(__dirname, "src/index.ts"),
      output: {
        // Mirrors dist/src/ output from the old gulp pipeline.
        entryFileNames: "src/[name].js",
        chunkFileNames: "src/[name].js",
        format: "es",
        inlineDynamicImports: true,
      },
    },
  },

  plugins: [copyAssetsPlugin(outDir)],
});