import { canonicalPlainText, canonicalTargetPlainText } from "./canonical";
import { labelForTargetLang } from "./indianLanguages";
import type { DocumentRoot } from "./types";

export type PdfExportVariant = "source" | "target" | "bilingual";

export type PdfExportBlockRow = { source: string; target: string };

export type PdfExportPayload = {
  title: string;
  variant: PdfExportVariant;
  sourceLangLabel: string;
  targetLangLabel: string;
  blocks: PdfExportBlockRow[];
};

export type PdfExportResult =
  | { cancelled: true }
  | { ok: true; filePath: string }
  | { ok: false; error: string };

export function buildPdfExportPayload(doc: DocumentRoot, variant: PdfExportVariant): PdfExportPayload {
  const activeLang = doc.meta.activeTargetLang;
  const title = (doc.meta.title ?? "").trim() || "Translation";
  return {
    title,
    variant,
    sourceLangLabel: doc.meta.sourceLang,
    targetLangLabel: labelForTargetLang(activeLang),
    blocks: doc.children.map((b) => ({
      source: canonicalPlainText(b),
      target: canonicalTargetPlainText(b, activeLang),
    })),
  };
}
