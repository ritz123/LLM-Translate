import type { DocumentMeta } from "./types";

/** Accepts legacy `{ targetLang }` or partial saves. */
export type DocumentMetaInput = Partial<DocumentMeta> & {
  targetLang?: string;
};

/** Coerce persisted or partial meta to a valid multi-target shape. */
export function normalizeDocumentMeta(m: DocumentMetaInput): DocumentMeta {
  const title = m.title ?? "Draft";
  const sourceLang = m.sourceLang ?? "en";
  let targetLangs = (m.targetLangs ?? []).filter(Boolean);
  if (targetLangs.length === 0 && m.targetLang) targetLangs = [m.targetLang];
  if (targetLangs.length === 0) targetLangs = ["hi"];
  targetLangs = [...new Set(targetLangs)];
  let activeTargetLang = m.activeTargetLang ?? m.targetLang ?? targetLangs[0]!;
  if (!targetLangs.includes(activeTargetLang)) activeTargetLang = targetLangs[0]!;
  return { title, sourceLang, targetLangs, activeTargetLang };
}
