import type { Block } from "./types";
import { canonicalPlainText } from "./canonical";

export type GateDecision = "translate" | "wait";

/** Jaccard on word sets — cheap stand-in for “still polishing” (Section 6 Stage B). */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const x of ta) {
    if (tb.has(x)) inter++;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Section 6 Stage A — local heuristics. */
export function completenessGateStageA(block: Block): GateDecision {
  const text = canonicalPlainText(block).trim();
  if (text.length === 0) return "wait";

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return "wait";

  const last = text.slice(-1);
  const terminal = /^[.!?।|]$/u.test(last);
  const isHeading = block.type === "heading";
  const isListItem = block.type === "list_item";
  if (!terminal && !isHeading && !isListItem) return "wait";

  const openConnective = /(\b(and|but|or)\s*,?\s*)$|[,:;\-–—]\s*$/i;
  if (openConnective.test(text)) return "wait";

  let depth = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (depth < 0) return "wait";
  }
  if (depth !== 0) return "wait";

  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 !== 0) return "wait";

  return "translate";
}

/**
 * Stage B — when Stage A passes, delay if text barely changed vs previous (embedding-like heuristic).
 * Section 6: high similarity ⇒ still polishing ⇒ wait.
 */
export function completenessGateStageB(current: Block, previous: Block | null): GateDecision {
  if (!previous) return "translate";
  const cur = canonicalPlainText(current).trim();
  const prev = canonicalPlainText(previous).trim();
  if (prev.length === 0) return "translate";
  const sim = tokenJaccardSimilarity(cur, prev);
  if (sim >= 0.88) return "wait";
  return "translate";
}

export interface CompletenessGate {
  shouldTranslate(current: Block, previous: Block | null): GateDecision;
}

export function createDefaultCompletenessGate(): CompletenessGate {
  return {
    shouldTranslate(current, previous) {
      const a = completenessGateStageA(current);
      if (a === "wait") return "wait";
      return completenessGateStageB(current, previous);
    },
  };
}
