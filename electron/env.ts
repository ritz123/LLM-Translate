import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load project-root `.env` without the `dotenv` package (avoids CJS `require('fs')`
 * inside an esbuild ESM bundle, which breaks under Electron).
 *
 * Resolution: bundled `dist-electron/main.mjs` → parent directory = repo root
 * (same as `package.json`). `.env` must live next to `package.json`.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env");

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Apply a value from `.env`. Fills missing vars and replaces empty strings so a stray `export FOO=` in the shell does not block the file. */
function applyFromDotenv(key: string, val: string): void {
  const existing = process.env[key];
  if (existing === undefined || existing === "") {
    process.env[key] = val;
  }
}

let parsedVarCount = 0;

if (fs.existsSync(envPath)) {
  const text = stripBom(fs.readFileSync(envPath, "utf8"));
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
      if (!line || line.startsWith("#")) continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      const hashComment = val.search(/\s+#/);
      if (hashComment >= 0) {
        val = val.slice(0, hashComment).trim();
      }
    }
    applyFromDotenv(key, val);
    parsedVarCount += 1;
  }
}

if (process.env.ELECTRON_DEV === "1") {
  if (fs.existsSync(envPath)) {
    console.info(`[TranslatorLLM] Loaded .env (${parsedVarCount} entries) from ${envPath}`);
  } else {
    console.info(
      `[TranslatorLLM] No .env at ${envPath} — optional. Use the app Configuration dialog for LLM keys and provider.`,
    );
  }
}
