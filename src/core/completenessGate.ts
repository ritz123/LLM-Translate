import type { Block } from "./types";
import { canonicalPlainText } from "./canonical";

export type GateDecision = "translate" | "wait";

/** Jaccard on word sets — optional Stage B signal. */
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

/**
 * Section 6 Stage A — tuned for desktop UX so translation actually fires.
 * - At least 2 words
 * - Looks “finished”: terminal punctuation, OR long enough line (wrapped paragraph), or heading/list
 */
export function completenessGateStageA(block: Block): GateDecision {
  const text = canonicalPlainText(block).trim();
  if (text.length === 0) return "wait";

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return "wait";

  const last = text.slice(-1);
  const terminal = /^[.!?।|]$/u.test(last);
  const isHeading = block.type === "heading";
  const isListItem = block.type === "list_item";
  const longLine = text.length >= 28;
  if (!terminal && !isHeading && !isListItem && !longLine) return "wait";

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
 * Stage B — disabled in default gate: it blocked re-translation after small edits
 * (high Jaccard vs last gated snapshot). Re-enable when embedding-based ambiguity is wired.
 */
export function completenessGateStageB(current: Block, previous: Block | null): GateDecision {
  void current;
  void previous;
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
