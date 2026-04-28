import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import WordExtractor from "word-extractor";

export type ImportDocumentResult =
  | { cancelled: true }
  | { ok: true; filePath: string; title: string; plainText: string }
  | { ok: false; error: string };

function titleFromPath(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  return ext.length > 0 ? base.slice(0, -ext.length) : base;
}

function extension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

async function extractPlainText(filePath: string, ext: string): Promise<string> {
  const buf = fs.readFileSync(filePath);

  if (ext === ".txt" || ext === ".md" || ext === ".csv" || ext === ".log" || ext === ".json") {
    return buf.toString("utf8");
  }

  if (ext === ".pdf") {
    const parser = new PDFParse({ data: buf });
    try {
      const { text } = await parser.getText();
      return (text ?? "").replace(/\r\n/g, "\n").trim();
    } finally {
      await parser.destroy();
    }
  }

  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value ?? "").replace(/\r\n/g, "\n").trim();
  }

  if (ext === ".doc") {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filePath);
    const body = doc.getBody();
    return (body ?? "").replace(/\r\n/g, "\n").trim();
  }

  throw new Error(`Unsupported file type: ${ext || "(none)"}`);
}

/**
 * Open a file picker and return extracted plain text for supported document types.
 */
export async function importDocumentViaDialog(parent?: BrowserWindow | null): Promise<ImportDocumentResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent ?? undefined, {
    title: "Import document for translation",
    properties: ["openFile"],
    filters: [
      {
        name: "Translatable documents",
        extensions: ["txt", "md", "csv", "log", "json", "doc", "docx", "pdf"],
      },
      { name: "Plain text", extensions: ["txt", "md", "csv", "log", "json"] },
      { name: "Microsoft Word", extensions: ["doc", "docx"] },
      { name: "PDF", extensions: ["pdf"] },
      { name: "All files", extensions: ["*"] },
    ],
  });

  if (canceled || !filePaths[0]) {
    return { cancelled: true };
  }

  const filePath = filePaths[0];
  const ext = extension(filePath);

  try {
    const plainText = await extractPlainText(filePath, ext);
    return {
      ok: true,
      filePath,
      title: titleFromPath(filePath),
      plainText,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
