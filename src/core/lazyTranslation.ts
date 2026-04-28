/** When block count ≥ this, only translate on demand (visible / near-viewport) instead of all paragraphs at once. */
export const LAZY_TRANSLATION_BLOCK_THRESHOLD = 35;

export function isLazyTranslationDocument(blockCount: number): boolean {
  return blockCount >= LAZY_TRANSLATION_BLOCK_THRESHOLD;
}

/**
 * Block ids whose `[data-block-id]` element intersects the scroll root’s viewport
 * (with a small inset so “visible” matches what the user sees).
 */
export function collectVisibleBlockIds(scrollRoot: HTMLElement): string[] {
  const rootRect = scrollRoot.getBoundingClientRect();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of scrollRoot.querySelectorAll<HTMLElement>("[data-block-id]")) {
    const id = el.dataset.blockId;
    if (!id || seen.has(id)) continue;
    const r = el.getBoundingClientRect();
    const intersects = r.bottom > rootRect.top + 2 && r.top < rootRect.bottom - 2;
    if (intersects) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
