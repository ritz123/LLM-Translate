import type { Block, BlockTargetLocaleSlice, InlineNode, TranslationMeta } from "./types";

/** Section 3.7: concatenate text nodes in order. */
export function canonicalPlainTextFromInline(inline: InlineNode[]): string {
  return inline
    .filter((n): n is InlineNode & { kind: "text" } => n.kind === "text")
    .map((n) => n.text)
    .join("");
}

export function canonicalPlainText(block: Block): string {
  return canonicalPlainTextFromInline(block.inline);
}

function emptyTranslationMeta(): TranslationMeta {
  return { state: "idle", sourceHash: null, targetText: null };
}

/** Effective slice for a locale (prefers `targetsByLang`; falls back to legacy root only for single-locale docs). */
export function getLocaleSlice(block: Block, lang: string): BlockTargetLocaleSlice {
  const loc = block.targetsByLang?.[lang];
  if (loc) {
    return {
      targetInline: loc.targetInline?.map((n) => ({ ...n })),
      translationMeta: { ...loc.translationMeta },
      targetProvenance: loc.targetProvenance,
    };
  }
  if (block.targetsByLang && Object.keys(block.targetsByLang).length > 0) {
    return { translationMeta: emptyTranslationMeta() };
  }
  return {
    targetInline: block.targetInline?.map((n) => ({ ...n })),
    translationMeta: { ...block.translationMeta },
    targetProvenance: block.targetProvenance,
  };
}

/** Target plain text for a given locale (Section 4.1). */
export function canonicalTargetPlainText(block: Block, lang: string): string {
  const slice = getLocaleSlice(block, lang);
  if (slice.targetInline?.length) {
    return canonicalPlainTextFromInline(slice.targetInline);
  }
  return slice.translationMeta.targetText ?? "";
}
