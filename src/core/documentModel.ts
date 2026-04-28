import type { Block, DocumentRoot, InlineTextNode, TranslationMeta } from "./types";
import { canonicalPlainTextFromInline } from "./canonical";

function emptyMeta(): TranslationMeta {
  return { state: "idle", sourceHash: null, targetText: null };
}

/** Concatenate two inline sequences with a space seam when both sides plain (Section 3.9.2). */
function concatInline(a: InlineTextNode[], b: InlineTextNode[]): InlineTextNode[] {
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  const la = a[a.length - 1]!;
  const fb = b[0]!;
  const sameStyles =
    JSON.stringify(la.styles ?? []) === JSON.stringify(fb.styles ?? []);
  if (la.kind === "text" && fb.kind === "text" && sameStyles) {
    const merged: InlineTextNode = {
      kind: "text",
      text: `${la.text}${la.text.endsWith(" ") || fb.text.startsWith(" ") ? "" : " "}${fb.text}`,
      styles: la.styles,
    };
    return [...a.slice(0, -1), merged, ...b.slice(1)];
  }
  const spacer: InlineTextNode = { kind: "text", text: " ", styles: [] };
  return [...a, spacer, ...b];
}

export function createInitialDocument(): DocumentRoot {
  const id = crypto.randomUUID();
  const block: Block = {
    id,
    type: "paragraph",
    structural: {},
    inline: [{ kind: "text", text: "", styles: [] }],
    translationMeta: emptyMeta(),
    lastEditedSide: null,
    contentEpoch: 0,
  };
  return {
    type: "document",
    schemaVersion: 1,
    meta: { title: "Draft", sourceLang: "en", targetLang: "hi" },
    children: [block],
  };
}

export function createParagraphBlock(text = ""): Block {
  return {
    id: crypto.randomUUID(),
    type: "paragraph",
    structural: {},
    inline: [{ kind: "text", text, styles: [] }],
    translationMeta: emptyMeta(),
    lastEditedSide: null,
    contentEpoch: 0,
  };
}

export function getBlock(doc: DocumentRoot, id: string): Block | undefined {
  return doc.children.find((b) => b.id === id);
}

/** Replace first text run body (vertical-slice simplification). */
export function setBlockPlainText(doc: DocumentRoot, blockId: string, text: string): DocumentRoot {
  return {
    ...doc,
    children: doc.children.map((b) => {
      if (b.id !== blockId) return b;
      const inline: InlineTextNode[] =
        b.inline.length > 0 && b.inline[0]!.kind === "text"
          ? [{ kind: "text", text, styles: b.inline[0].styles }]
          : [{ kind: "text", text, styles: [] }];
      return { ...b, inline, lastEditedSide: "source" };
    }),
  };
}

/** Section 4.1 — Hindi plain text as single run; marks provenance. */
export function setBlockTargetPlainText(doc: DocumentRoot, blockId: string, text: string): DocumentRoot {
  return {
    ...doc,
    children: doc.children.map((b) => {
      if (b.id !== blockId) return b;
      const targetInline: InlineTextNode[] = [{ kind: "text", text, styles: [] }];
      return {
        ...b,
        targetInline,
        translationMeta: {
          ...b.translationMeta,
          targetText: text,
        },
        lastEditedSide: "target",
        targetProvenance: "user",
      };
    }),
  };
}

/**
 * Section 4.1 MVP — replace English with reverse translation as one plain run (styles cleared).
 */
export function applyReverseEnglishToBlock(doc: DocumentRoot, blockId: string, english: string): DocumentRoot {
  return {
    ...doc,
    children: doc.children.map((b) => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        inline: [{ kind: "text", text: english, styles: [] }],
        lastEditedSide: "target",
      };
    }),
  };
}

export function addParagraphAfter(doc: DocumentRoot, afterId: string | null): DocumentRoot {
  const nb = createParagraphBlock("");
  if (afterId === null) {
    return { ...doc, children: [...doc.children, nb] };
  }
  const i = doc.children.findIndex((b) => b.id === afterId);
  if (i < 0) return { ...doc, children: [...doc.children, nb] };
  const next = [...doc.children.slice(0, i + 1), nb, ...doc.children.slice(i + 1)];
  return { ...doc, children: next };
}

export function removeBlock(doc: DocumentRoot, blockId: string): DocumentRoot {
  if (doc.children.length <= 1) return doc;
  return { ...doc, children: doc.children.filter((b) => b.id !== blockId) };
}

export function setBlockTranslationMeta(
  doc: DocumentRoot,
  blockId: string,
  patch: Partial<TranslationMeta>,
): DocumentRoot {
  return {
    ...doc,
    children: doc.children.map((b) =>
      b.id !== blockId ? b : { ...b, translationMeta: { ...b.translationMeta, ...patch } },
    ),
  };
}

/** Apply machine translation to target surface. */
export function setBlockMachineTranslation(
  doc: DocumentRoot,
  blockId: string,
  translation: string,
  sourceHash: string,
): DocumentRoot {
  return {
    ...doc,
    children: doc.children.map((b) => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        targetInline: [{ kind: "text", text: translation, styles: [] }],
        translationMeta: {
          ...b.translationMeta,
          state: "done",
          sourceHash,
          targetText: translation,
          lastError: undefined,
        },
        targetProvenance: "machine",
      };
    }),
  };
}

/**
 * Section 3.9.2 — merge block with previous sibling; new id; reset translation meta.
 * Returns removed ids for pipeline cancellation.
 */
export function mergeBlockWithPrevious(
  doc: DocumentRoot,
  blockId: string,
): { doc: DocumentRoot; removedIds: string[]; newBlockId: string } | null {
  const i = doc.children.findIndex((b) => b.id === blockId);
  if (i <= 0) return null;
  const prev = doc.children[i - 1]!;
  const cur = doc.children[i]!;
  const prevText = prev.inline.filter((n): n is InlineTextNode => n.kind === "text");
  const curText = cur.inline.filter((n): n is InlineTextNode => n.kind === "text");
  const mergedInline = concatInline(prevText, curText);
  const newId = crypto.randomUUID();
  const merged: Block = {
    id: newId,
    type: "paragraph",
    structural: {},
    inline: mergedInline.length ? mergedInline : [{ kind: "text", text: "", styles: [] }],
    translationMeta: emptyMeta(),
    lastEditedSide: "source",
    contentEpoch: 0,
  };
  const nextChildren = [...doc.children.slice(0, i - 1), merged, ...doc.children.slice(i + 1)];
  return {
    doc: { ...doc, children: nextChildren },
    removedIds: [prev.id, cur.id],
    newBlockId: newId,
  };
}

/**
 * Section 3.9.3 — split one paragraph block at UTF-16 index into two new blocks.
 */
export function splitBlockAt(
  doc: DocumentRoot,
  blockId: string,
  splitIndex: number,
): { doc: DocumentRoot; removedId: string; newIds: [string, string] } | null {
  const i = doc.children.findIndex((b) => b.id === blockId);
  if (i < 0) return null;
  const block = doc.children[i]!;
  const full = canonicalPlainTextFromInline(block.inline);
  if (splitIndex <= 0 || splitIndex >= full.length) return null;
  const left = full.slice(0, splitIndex).trimEnd();
  const right = full.slice(splitIndex).trimStart();
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  const b1: Block = {
    id: id1,
    type: block.type,
    structural: { ...block.structural },
    inline: [{ kind: "text", text: left, styles: [] }],
    translationMeta: emptyMeta(),
    contentEpoch: 0,
    lastEditedSide: "source",
  };
  const b2: Block = {
    id: id2,
    type: block.type,
    structural: { ...block.structural },
    inline: [{ kind: "text", text: right, styles: [] }],
    translationMeta: emptyMeta(),
    contentEpoch: 0,
    lastEditedSide: "source",
  };
  const nextChildren = [...doc.children.slice(0, i), b1, b2, ...doc.children.slice(i + 1)];
  return { doc: { ...doc, children: nextChildren }, removedId: block.id, newIds: [id1, id2] };
}
