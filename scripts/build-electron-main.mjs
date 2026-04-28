import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "electron", "main.ts");
const outdir = path.join(root, "dist-electron");
const outfile = path.join(outdir, "main.mjs");
const watch = process.argv.includes("--watch");

fs.mkdirSync(outdir, { recursive: true });

const opts = {
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  outfile,
  format: "esm",
  target: "node20",
  // mammoth/word-extractor/pdf-parse are CommonJS and use `require("fs")` etc.
  // Bundling them into ESM makes esbuild's `require` shim throw "Dynamic require of fs is not supported".
  external: ["electron", "mammoth", "word-extractor", "pdf-parse"],
  sourcemap: true,
  logLevel: "warning",
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.error("[esbuild] watching electron main → dist-electron/main.mjs");
  } else {
    await esbuild.build(opts);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
