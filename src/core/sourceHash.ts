import type { Block, DocumentMeta } from "./types";
import { PROMPT_VERSION } from "./types";
import { canonicalPlainText } from "./canonical";

export function structuralPolicyKey(block: Block): string {
  if (block.type === "heading") {
    return JSON.stringify({ level: (block.structural as { level?: number }).level ?? 1 });
  }
  if (block.type === "list_item") {
    return JSON.stringify({
      kind: (block.structural as { kind?: string }).kind,
      indent: (block.structural as { indent?: number }).indent,
    });
  }
  return "";
}

/**
 * Byte-identical input string for client and server before SHA-256.
 * Section 3.7 — direction via sourceLang/targetLang. Model changes are handled by bumping PROMPT_VERSION.
 */
export function translationHashPayload(
  canonicalText: string,
  sourceLang: string,
  targetLang: string,
  block: Block,
): string {
  return [
    canonicalText,
    sourceLang,
    targetLang,
    PROMPT_VERSION,
    block.type,
    structuralPolicyKey(block),
  ].join("\u001f");
}

/** Forward EN→target fingerprint for a block (per target locale). */
export function sourceHashInput(block: Block, meta: DocumentMeta, targetLang?: string): string {
  const tl = targetLang ?? meta.activeTargetLang;
  return translationHashPayload(
    canonicalPlainText(block),
    meta.sourceLang,
    tl,
    block,
  );
}

export async function sha256Hex(utf8String: string): Promise<string> {
  const bytes = new TextEncoder().encode(utf8String);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSourceHash(
  block: Block,
  meta: DocumentMeta,
  targetLang?: string,
): Promise<string> {
  return sha256Hex(sourceHashInput(block, meta, targetLang));
}

/** Reverse target→EN fingerprint (Section 4.1). */
export function reverseHashInput(
  block: Block,
  meta: DocumentMeta,
  targetPlain: string,
  targetLang?: string,
): string {
  const tl = targetLang ?? meta.activeTargetLang;
  return translationHashPayload(targetPlain, tl, meta.sourceLang, block);
}

export async function computeReverseHash(
  block: Block,
  meta: DocumentMeta,
  targetPlain: string,
  targetLang?: string,
): Promise<string> {
  return sha256Hex(reverseHashInput(block, meta, targetPlain, targetLang));
}
