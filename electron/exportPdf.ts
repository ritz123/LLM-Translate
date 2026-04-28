import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { PdfExportPayload, PdfExportResult } from "../src/core/pdfExport.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPdfHtml(payload: PdfExportPayload): string {
  const { title, variant, sourceLangLabel, targetLangLabel, blocks } = payload;
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
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 18mm 16mm; }
    body {
      font-family: system-ui, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari",
        "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Gujarati",
        "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gurmukhi", sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #0f172a;
    }
    h1 { font-size: 15pt; font-weight: 650; margin: 0 0 0.35em; }
    .meta { font-size: 9.5pt; color: #475569; margin: 0 0 1.25em; }
    .block { margin-bottom: 1.1em; page-break-inside: avoid; }
    .label { font-size: 8pt; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.2em; }
    .pre { white-space: pre-wrap; word-wrap: break-word; }
    .bilingual .src { margin-bottom: 0.5em; }
    .bilingual .tgt { padding-left: 0.75em; border-left: 3px solid #cbd5e1; margin-bottom: 0.25em; }
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

/**
 * Render HTML in a hidden window and write printToPDF output after a save dialog.
 */
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

  const { canceled, filePath: chosen } = await dialog.showSaveDialog(parent ?? undefined, {
    title: "Export as PDF",
    defaultPath: `${safeDefaultBasename(payload.title)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !chosen) return { cancelled: true };

  let outPath = chosen;
  if (!outPath.toLowerCase().endsWith(".pdf")) outPath += ".pdf";

  const html = buildPdfHtml(payload);
  const tmpHtml = path.join(os.tmpdir(), `translator-pdf-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, "utf8");

  const win = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(tmpHtml);
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
