import type { Block, InlineNode } from "./types";

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

/** Hindi surface for hashing / display (Section 4.1). */
export function canonicalTargetPlainText(block: Block): string {
  if (block.targetInline?.length) {
    return canonicalPlainTextFromInline(block.targetInline);
  }
  return block.translationMeta.targetText ?? "";
}
