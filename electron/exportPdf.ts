import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import type { PdfExportPayload, PdfExportResult } from "../src/core/pdfExport.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAppRootFromMainBundle(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Same ranges as @fontsource/noto-sans/unicode.json — inlined so packaging never drops ranges.
 */
const NOTO_UNICODE_RANGES: Record<string, string> = {
  "cyrillic-ext":
    "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  devanagari:
    "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09",
  "greek-ext": "U+1F00-1FFF",
  greek: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
  vietnamese:
    "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};

/** Weights used in PDF CSS (body / labels / headings). */
const PDF_NOTO_WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Extra Noto families for every target script used in `indianLanguages` (+ Urdu Arabic).
 * Parsed from each package’s `400.css` (all non-Latin slices); Latin comes from `@fontsource/noto-sans`.
 */
const SUPPLEMENTAL_NOTO_PACKAGES = [
  "noto-sans-bengali",
  "noto-sans-oriya",
  "noto-sans-telugu",
  "noto-sans-tamil",
  "noto-sans-gujarati",
  "noto-sans-kannada",
  "noto-sans-malayalam",
  "noto-sans-gurmukhi",
  "noto-sans-arabic",
] as const;

type ParsedWoff2Face = { family: string; unicodeRange: string; file400: string };

type PdfFontBundle = { css: string; faceCount: number; bodyFontFamily: string };

const embeddedPdfFontCache = new Map<string, PdfFontBundle>();

function notoPackageRoots(): string[] {
  const out: string[] = [];
  const push = (p: string) => {
    const n = path.normalize(p);
    if (!out.includes(n)) out.push(n);
  };
  try {
    if (app.isPackaged) push(app.getAppPath());
  } catch {
    /* app not ready */
  }
  push(getAppRootFromMainBundle());
  try {
    if (process.cwd()) push(process.cwd());
  } catch {
    /* ignore */
  }
  return out;
}

function resolveNotoSansFilesDir(): string | null {
  for (const root of notoPackageRoots()) {
    const filesDir = path.join(root, "node_modules", "@fontsource", "noto-sans", "files");
    const probe = path.join(filesDir, "noto-sans-latin-400-normal.woff2");
    if (fs.existsSync(probe)) return filesDir;
  }
  return null;
}

function resolveFontsourcePackageDir(pkgFolder: string): string | null {
  for (const root of notoPackageRoots()) {
    const pkgDir = path.join(root, "node_modules", "@fontsource", pkgFolder);
    const css = path.join(pkgDir, "400.css");
    if (fs.existsSync(css)) return pkgDir;
  }
  return null;
}

function mergeUnicodeRanges(): Record<string, string> {
  const merged: Record<string, string> = { ...NOTO_UNICODE_RANGES };
  const filesDir = resolveNotoSansFilesDir();
  if (!filesDir) return merged;
  const pkgDir = path.dirname(filesDir);
  const unicodePath = path.join(pkgDir, "unicode.json");
  try {
    if (fs.existsSync(unicodePath)) {
      const extra = JSON.parse(fs.readFileSync(unicodePath, "utf8")) as Record<string, string>;
      Object.assign(merged, extra);
    }
  } catch {
    /* keep inlined ranges only */
  }
  return merged;
}

function buildNotoSansLatinFaces(filesDir: string, unicodeRanges: Record<string, string>): string[] {
  const parts: string[] = [];
  for (const weight of PDF_NOTO_WEIGHTS) {
    for (const [scriptKey, unicodeRange] of Object.entries(unicodeRanges)) {
      const file = `noto-sans-${scriptKey}-${weight}-normal.woff2`;
      const full = path.join(filesDir, file);
      if (!fs.existsSync(full)) continue;
      const b64 = fs.readFileSync(full).toString("base64");
      parts.push(
        `@font-face{font-family:'Noto Sans';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${unicodeRange};}`,
      );
    }
  }
  return parts;
}

/**
 * Read Fontsource `400.css`: every @font-face whose woff2 is not Latin/Latin-ext (those come from core Noto Sans).
 * Only faces whose filename contains `-400-` are used as templates for other weights.
 */
function parseNonLatinWoff2FacesFrom400Css(pkgDir: string): ParsedWoff2Face[] {
  const cssPath = path.join(pkgDir, "400.css");
  if (!fs.existsSync(cssPath)) return [];
  const css = fs.readFileSync(cssPath, "utf8");
  const out: ParsedWoff2Face[] = [];
  const faceRe = /@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = faceRe.exec(css)) !== null) {
    const block = m[1];
    const fm = /font-family:\s*['"]([^'"]+)['"]/.exec(block);
    const ur = /unicode-range:\s*([^;]+);/.exec(block);
    const srcm = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block);
    if (!fm || !ur || !srcm) continue;
    const file = srcm[1];
    if (file.includes("-latin-") || file.includes("-latin-ext-")) continue;
    if (!file.includes("-400-")) continue;
    out.push({ family: fm[1], unicodeRange: ur[1].trim(), file400: file });
  }
  return out;
}

function embedParsedFacesForWeights(filesDir: string, faces: ParsedWoff2Face[]): string[] {
  const parts: string[] = [];
  for (const { family, unicodeRange, file400 } of faces) {
    const safeFamily = family.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    for (const weight of PDF_NOTO_WEIGHTS) {
      const file = file400.replace("-400-", `-${weight}-`);
      const full = path.join(filesDir, file);
      if (!fs.existsSync(full)) continue;
      const b64 = fs.readFileSync(full).toString("base64");
      parts.push(
        `@font-face{font-family:'${safeFamily}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${unicodeRange};}`,
      );
    }
  }
  return parts;
}

function buildBodyFontFamilyCss(supplementalFamiliesInOrder: string[]): string {
  const quoted = (name: string) => `"${name.replace(/"/g, "")}"`;
  const bits: string[] = [quoted("Noto Sans")];
  for (const f of supplementalFamiliesInOrder) bits.push(quoted(f));
  bits.push(quoted("DejaVu Sans"), quoted("Liberation Sans"), "Arial", "Helvetica", "sans-serif");
  return bits.join(", ");
}

function cacheKeyForPdfFonts(): string {
  const parts: string[] = [resolveNotoSansFilesDir() ?? ""];
  for (const pkg of SUPPLEMENTAL_NOTO_PACKAGES) {
    parts.push(resolveFontsourcePackageDir(pkg) ?? "");
  }
  return parts.join("|");
}

function buildEmbeddedPdfFontBundle(): PdfFontBundle {
  const key = cacheKeyForPdfFonts();
  const cached = embeddedPdfFontCache.get(key);
  if (cached !== undefined) return cached;

  const coreDir = resolveNotoSansFilesDir();
  if (!coreDir) {
    const empty: PdfFontBundle = { css: "", faceCount: 0, bodyFontFamily: buildBodyFontFamilyCss([]) };
    embeddedPdfFontCache.set(key, empty);
    return empty;
  }

  const unicodeRanges = mergeUnicodeRanges();
  const parts = buildNotoSansLatinFaces(coreDir, unicodeRanges);

  const supplementalFamiliesOrdered: string[] = [];
  const seenFamily = new Set<string>();

  for (const pkg of SUPPLEMENTAL_NOTO_PACKAGES) {
    const pkgDir = resolveFontsourcePackageDir(pkg);
    if (!pkgDir) continue;
    const filesDir = path.join(pkgDir, "files");
    const faces = parseNonLatinWoff2FacesFrom400Css(pkgDir);
    parts.push(...embedParsedFacesForWeights(filesDir, faces));
    for (const f of faces) {
      if (!seenFamily.has(f.family)) {
        seenFamily.add(f.family);
        supplementalFamiliesOrdered.push(f.family);
      }
    }
  }

  const bundle: PdfFontBundle = {
    css: parts.join("\n"),
    faceCount: parts.length,
    bodyFontFamily: buildBodyFontFamilyCss(supplementalFamiliesOrdered),
  };
  embeddedPdfFontCache.set(key, bundle);
  return bundle;
}

function buildPdfHtml(payload: PdfExportPayload, bundle: PdfFontBundle): string {
  const { title, variant, sourceLangLabel, targetLangLabel, blocks } = payload;
  const { css: embeddedFontCss, bodyFontFamily } = bundle;
  const blocksHtml = blocks
    .map((row) => {
      const src = escapeHtml(row.source);
      const tgt = escapeHtml(row.target);
      if (variant === "source") {
        return `<section class="block"><div class="body pre">${src}</div></section>`;
      }
      if (variant === "target") {
        return `<section class="block"><div class="body pre">${tgt}</div></section>`;
      }
      return `<section class="block bilingual">
  <div class="label">Source (${escapeHtml(sourceLangLabel)})</div>
  <div class="src pre">${src}</div>
  <div class="label">Translation (${escapeHtml(targetLangLabel)})</div>
  <div class="tgt pre">${tgt}</div>
</section>`;
    })
    .join("\n");

  const subtitle =
    variant === "source"
      ? `Source — ${escapeHtml(sourceLangLabel)}`
      : variant === "target"
        ? `Translation — ${escapeHtml(targetLangLabel)}`
        : `Source (${escapeHtml(sourceLangLabel)}) · Translation (${escapeHtml(targetLangLabel)})`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'unsafe-eval';" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${embeddedFontCss}
    @page { margin: 18mm 16mm; }
    html, body {
      background: #ffffff;
      color: #111111;
    }
    body {
      font-family: ${bodyFontFamily};
      font-size: 11pt;
      line-height: 1.45;
      color: #111111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { font-size: 15pt; font-weight: 700; margin: 0 0 0.35em; color: #111111; }
    .meta { font-size: 9.5pt; font-weight: 400; color: #333333; margin: 0 0 1.25em; }
    .block { margin-bottom: 1.1em; page-break-inside: avoid; }
    .label { font-size: 8pt; font-weight: 600; color: #444444; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.2em; }
    .pre { white-space: pre-wrap; word-wrap: break-word; }
    .bilingual .src { margin-bottom: 0.5em; }
    .bilingual .tgt { padding-left: 0.75em; border-left: 3px solid #cccccc; margin-bottom: 0.25em; }
    .body { margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${subtitle}</p>
  ${blocksHtml}
</body>
</html>`;
}

function validatePayload(body: unknown): PdfExportPayload {
  if (!body || typeof body !== "object") throw new Error("Invalid export payload.");
  const o = body as Record<string, unknown>;
  if (typeof o.title !== "string") throw new Error("title is required.");
  const v = o.variant;
  if (v !== "source" && v !== "target" && v !== "bilingual") throw new Error("variant must be source, target, or bilingual.");
  if (typeof o.sourceLangLabel !== "string" || typeof o.targetLangLabel !== "string") {
    throw new Error("sourceLangLabel and targetLangLabel are required.");
  }
  if (!Array.isArray(o.blocks)) throw new Error("blocks array is required.");
  const blocks: { source: string; target: string }[] = [];
  for (const row of o.blocks) {
    if (!row || typeof row !== "object") throw new Error("Each block must be an object.");
    const r = row as Record<string, unknown>;
    if (typeof r.source !== "string" || typeof r.target !== "string") {
      throw new Error("Each block needs source and target strings.");
    }
    if (r.source.length > 500_000 || r.target.length > 500_000) throw new Error("Block text is too long.");
    blocks.push({ source: r.source, target: r.target });
  }
  if (blocks.length > 10_000) throw new Error("Too many blocks for one PDF.");
  return {
    title: o.title,
    variant: v,
    sourceLangLabel: o.sourceLangLabel,
    targetLangLabel: o.targetLangLabel,
    blocks,
  };
}

function safeDefaultBasename(title: string): string {
  const t = title
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return t.length > 0 ? t : "translation";
}

const WAIT_FONTS_JS = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.fonts && document.fonts.ready) {
    await Promise.race([document.fonts.ready, sleep(12000)]);
  }
  await sleep(350);
})()
`;

export async function exportPdfViaDialog(
  parent: BrowserWindow | null | undefined,
  body: unknown,
): Promise<PdfExportResult> {
  let payload: PdfExportPayload;
  try {
    payload = validatePayload(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const bundle = buildEmbeddedPdfFontBundle();
  if (bundle.faceCount === 0) {
    return {
      ok: false,
      error:
        "Bundled Noto Sans fonts were not found under node_modules/@fontsource/noto-sans/files. Reinstall dependencies or rebuild the app so PDFs can embed real outlines.",
    };
  }

  const { canceled, filePath: chosen } = await dialog.showSaveDialog(parent ?? undefined, {
    title: "Export as PDF",
    defaultPath: `${safeDefaultBasename(payload.title)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !chosen) return { cancelled: true };

  let outPath = chosen;
  if (!outPath.toLowerCase().endsWith(".pdf")) outPath += ".pdf";

  const html = buildPdfHtml(payload, bundle);
  const tmpHtml = path.join(os.tmpdir(), `translator-pdf-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, "utf8");

  const win = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(tmpHtml);
    await win.webContents.executeJavaScript(WAIT_FONTS_JS);
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "default" },
    });
    fs.writeFileSync(outPath, data);
    return { ok: true, filePath: outPath };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    try {
      fs.unlinkSync(tmpHtml);
    } catch {
      /* ignore */
    }
    if (!win.isDestroyed()) win.destroy();
  }
}
