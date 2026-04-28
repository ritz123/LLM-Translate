import { useCallback, useRef, useState } from "react";
import {
  addParagraphAfter,
  applyReverseEnglishToBlock,
  createInitialDocument,
  getBlock,
  mergeBlockWithPrevious,
  removeBlock,
  setBlockMachineTranslation,
  setBlockPlainText,
  setBlockTargetPlainText,
  setBlockTranslationMeta,
} from "@core/documentModel";
import type { Block, DocumentRoot, TranslateRequest } from "@core/types";
import { canonicalPlainText, canonicalTargetPlainText } from "@core/canonical";
import { computeReverseHash, computeSourceHash } from "@core/sourceHash";
import { createDefaultCompletenessGate } from "@core/completenessGate";
import { LruTranslationCache } from "@core/translationCache";
import { translateBatch, translateOne } from "@core/translationFetch";
import { logTranslation } from "@core/observability";

const BASE = "";
const DEBOUNCE_MS = 2000;

function pseudoBlockForHindiGate(block: Block, hindiPlain: string): Block {
  return {
    ...block,
    type: "paragraph",
    inline: [{ kind: "text", text: hindiPlain, styles: [] }],
  };
}

function anchorBlockId(container: HTMLElement, scrollTop: number): string | null {
  const nodes = container.querySelectorAll<HTMLElement>("[data-block-id]");
  for (const el of nodes) {
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (bottom > scrollTop + 2) {
      return el.dataset.blockId ?? null;
    }
  }
  return null;
}

function scrollPaneToBlock(container: HTMLElement, blockId: string): void {
  const el = container.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (el) container.scrollTop = el.offsetTop;
}

export default function TranslationEditor() {
  const [doc, setDoc] = useState<DocumentRoot>(() => createInitialDocument());
  const [editableHindi, setEditableHindi] = useState(false);
  const [offline, setOffline] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const cacheRef = useRef(new LruTranslationCache(256));
  const gateRef = useRef(createDefaultCompletenessGate());
  const prevSourceRef = useRef(new Map<string, Block>());
  const prevTargetRef = useRef(new Map<string, Block>());
  const debounceFwd = useRef(new Map<string, number>());
  const debounceRev = useRef(new Map<string, number>());
  const abortFwd = useRef(new Map<string, AbortController>());
  const abortRev = useRef(new Map<string, AbortController>());
  const srcScrollRef = useRef<HTMLDivElement>(null);
  const tgtScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const cancelForwardDebounce = useCallback((blockId: string) => {
    const t = debounceFwd.current.get(blockId);
    if (t !== undefined) clearTimeout(t);
    debounceFwd.current.delete(blockId);
  }, []);

  const cancelReverseDebounce = useCallback((blockId: string) => {
    const t = debounceRev.current.get(blockId);
    if (t !== undefined) clearTimeout(t);
    debounceRev.current.delete(blockId);
  }, []);

  const cancelAllForRemoved = useCallback((ids: string[]) => {
    for (const id of ids) {
      cancelForwardDebounce(id);
      cancelReverseDebounce(id);
      abortFwd.current.get(id)?.abort();
      abortFwd.current.delete(id);
      abortRev.current.get(id)?.abort();
      abortRev.current.delete(id);
      prevSourceRef.current.delete(id);
      prevTargetRef.current.delete(id);
    }
  }, [cancelForwardDebounce, cancelReverseDebounce]);

  const runForward = useCallback(
    async (blockId: string) => {
      const d = docRef.current;
      const block = getBlock(d, blockId);
      if (!block) return;
      abortRev.current.get(blockId)?.abort();
      const prev = prevSourceRef.current.get(blockId) ?? null;
      const gate = gateRef.current.shouldTranslate(block, prev);
      logTranslation("info", {
        event: "gate_forward",
        blockId,
        gate,
        direction: "forward",
      });
      if (gate === "wait") return;
      prevSourceRef.current.set(blockId, { ...block, inline: block.inline.map((n) => ({ ...n })) });
      const hash = await computeSourceHash(block, d.meta);
      const cached = cacheRef.current.get(hash);
      if (cached !== null) {
        setDoc((x) => setBlockMachineTranslation(x, blockId, cached, hash));
        logTranslation("info", {
          event: "cache_hit_client",
          blockId,
          sourceHash: hash,
          cacheHit: true,
          direction: "forward",
        });
        return;
      }
      abortFwd.current.get(blockId)?.abort();
      const ac = new AbortController();
      abortFwd.current.set(blockId, ac);
      setDoc((x) => setBlockTranslationMeta(x, blockId, { state: "translating", lastError: undefined }));
      const idx = d.children.findIndex((b) => b.id === blockId);
      const prevText =
        idx > 0 ? canonicalPlainText(d.children[idx - 1]!) : undefined;
      const nextText =
        idx >= 0 && idx < d.children.length - 1
          ? canonicalPlainText(d.children[idx + 1]!)
          : undefined;
      try {
        const res = await translateOne(
          BASE,
          {
            blockId,
            sourceLang: d.meta.sourceLang,
            targetLang: d.meta.targetLang,
            text: canonicalPlainText(block),
            sourceHash: hash,
            blockType: block.type,
            context: { previousBlockText: prevText, nextBlockText: nextText },
          },
          ac.signal,
        );
        if (ac.signal.aborted) return;
        const d2 = docRef.current;
        const b2 = getBlock(d2, blockId);
        if (!b2) return;
        const curHash = await computeSourceHash(b2, d2.meta);
        if (curHash !== res.sourceHash) {
          logTranslation("warn", {
            event: "stale_drop_forward",
            blockId,
            sourceHash: res.sourceHash,
            direction: "forward",
          });
          setDoc((x) => setBlockTranslationMeta(x, blockId, { state: "stale" }));
          return;
        }
        cacheRef.current.set(hash, res.translation);
        setDoc((x) => setBlockMachineTranslation(x, blockId, res.translation, hash));
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setOffline(true);
        setDoc((x) =>
          setBlockTranslationMeta(x, blockId, {
            state: "error",
            lastError: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        abortFwd.current.delete(blockId);
      }
    },
    [],
  );

  const scheduleForward = useCallback(
    (blockId: string) => {
      cancelForwardDebounce(blockId);
      debounceFwd.current.set(
        blockId,
        window.setTimeout(() => {
          debounceFwd.current.delete(blockId);
          void runForward(blockId);
        }, DEBOUNCE_MS),
      );
    },
    [cancelForwardDebounce, runForward],
  );

  const runReverse = useCallback(async (blockId: string) => {
    const d = docRef.current;
    const block = getBlock(d, blockId);
    if (!block) return;
    abortFwd.current.get(blockId)?.abort();
    const hi = canonicalTargetPlainText(block).trim();
    if (!hi) return;
    const pseudo = pseudoBlockForHindiGate(block, hi);
    const prevHi = prevTargetRef.current.get(blockId) ?? null;
    const gate = gateRef.current.shouldTranslate(pseudo, prevHi);
    logTranslation("info", {
      event: "gate_reverse",
      blockId,
      gate,
      direction: "reverse",
    });
    if (gate === "wait") return;
    prevTargetRef.current.set(blockId, { ...pseudo, inline: pseudo.inline.map((n) => ({ ...n })) });
    const hash = await computeReverseHash(block, d.meta, hi);
    const cached = cacheRef.current.get(hash);
    if (cached !== null) {
      const synthetic: Block = {
        ...block,
        inline: [{ kind: "text", text: cached, styles: [] }],
      };
      const srcHash = await computeSourceHash(synthetic, d.meta);
      setDoc((x) => {
        const y = applyReverseEnglishToBlock(x, blockId, cached);
        return setBlockTranslationMeta(y, blockId, {
          state: "done",
          sourceHash: srcHash,
          targetText: hi,
          lastError: undefined,
        });
      });
      return;
    }
    abortRev.current.get(blockId)?.abort();
    const ac = new AbortController();
    abortRev.current.set(blockId, ac);
    setDoc((x) => setBlockTranslationMeta(x, blockId, { state: "translating", lastError: undefined }));
    try {
      const res = await translateOne(
        BASE,
        {
          blockId,
          sourceLang: d.meta.targetLang,
          targetLang: d.meta.sourceLang,
          text: hi,
          sourceHash: hash,
          blockType: block.type,
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      const d2 = docRef.current;
      const b2 = getBlock(d2, blockId);
      if (!b2) return;
      const curRev = await computeReverseHash(b2, d2.meta, canonicalTargetPlainText(b2));
      if (curRev !== res.sourceHash) {
        logTranslation("warn", {
          event: "stale_drop_reverse",
          blockId,
          sourceHash: res.sourceHash,
          direction: "reverse",
        });
        setDoc((x) => setBlockTranslationMeta(x, blockId, { state: "stale" }));
        return;
      }
      cacheRef.current.set(hash, res.translation);
      const synthetic: Block = {
        ...block,
        inline: [{ kind: "text", text: res.translation, styles: [] }],
      };
      const srcHash = await computeSourceHash(synthetic, d2.meta);
      setDoc((x) => {
        const y = applyReverseEnglishToBlock(x, blockId, res.translation);
        return setBlockTranslationMeta(y, blockId, {
          state: "done",
          sourceHash: srcHash,
          targetText: hi,
          lastError: undefined,
        });
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setOffline(true);
      setDoc((x) =>
        setBlockTranslationMeta(x, blockId, {
          state: "error",
          lastError: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      abortRev.current.delete(blockId);
    }
  }, []);

  const scheduleReverse = useCallback(
    (blockId: string) => {
      cancelReverseDebounce(blockId);
      debounceRev.current.set(
        blockId,
        window.setTimeout(() => {
          debounceRev.current.delete(blockId);
          void runReverse(blockId);
        }, DEBOUNCE_MS),
      );
    },
    [cancelReverseDebounce, runReverse],
  );

  const onSourceChange = (blockId: string, text: string) => {
    setOffline(false);
    setDoc((d) => setBlockPlainText(d, blockId, text));
    scheduleForward(blockId);
  };

  const onTargetChange = (blockId: string, text: string) => {
    setOffline(false);
    setDoc((d) => setBlockTargetPlainText(d, blockId, text));
    if (editableHindi) scheduleReverse(blockId);
  };

  const onMerge = (blockId: string) => {
    const m = mergeBlockWithPrevious(doc, blockId);
    if (!m) return;
    cancelAllForRemoved(m.removedIds);
    setDoc(m.doc);
    scheduleForward(m.newBlockId);
  };

  const onAddParagraph = (afterId: string | null) => {
    setDoc((d) => addParagraphAfter(d, afterId));
  };

  const onRemove = (blockId: string) => {
    cancelAllForRemoved([blockId]);
    setDoc((d) => removeBlock(d, blockId));
  };

  const onRetry = (blockId: string) => {
    setDoc((d) => setBlockTranslationMeta(d, blockId, { state: "idle", lastError: undefined }));
    void runForward(blockId);
  };

  const onTranslateAllIdle = async () => {
    const d = docRef.current;
    const reqs: TranslateRequest[] = [];
    for (const b of d.children) {
      const plain = canonicalPlainText(b).trim();
      if (!plain) continue;
      if (gateRef.current.shouldTranslate(b, prevSourceRef.current.get(b.id) ?? null) === "wait") continue;
      const hash = await computeSourceHash(b, d.meta);
      const hit = cacheRef.current.get(hash);
      if (hit !== null) {
        setDoc((x) => setBlockMachineTranslation(x, b.id, hit, hash));
        continue;
      }
      reqs.push({
        blockId: b.id,
        sourceLang: d.meta.sourceLang,
        targetLang: d.meta.targetLang,
        text: plain,
        sourceHash: hash,
        blockType: b.type,
      });
    }
    if (reqs.length === 0) return;
    try {
      const results = await translateBatch(BASE, reqs);
      for (const res of results) {
        const b = getBlock(docRef.current, res.blockId);
        if (!b) continue;
        const cur = await computeSourceHash(b, docRef.current.meta);
        if (cur !== res.sourceHash) continue;
        cacheRef.current.set(res.sourceHash, res.translation);
        setDoc((x) => setBlockMachineTranslation(x, res.blockId, res.translation, res.sourceHash));
      }
    } catch {
      setOffline(true);
    }
  };

  const onSrcScroll = () => {
    const src = srcScrollRef.current;
    const tgt = tgtScrollRef.current;
    if (!src || !tgt || syncingScroll.current) return;
    const id = anchorBlockId(src, src.scrollTop);
    if (!id) return;
    syncingScroll.current = true;
    scrollPaneToBlock(tgt, id);
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  const onTgtScroll = () => {
    const src = srcScrollRef.current;
    const tgt = tgtScrollRef.current;
    if (!src || !tgt || syncingScroll.current) return;
    const id = anchorBlockId(tgt, tgt.scrollTop);
    if (!id) return;
    syncingScroll.current = true;
    scrollPaneToBlock(src, id);
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  return (
    <div className="translation-editor">
      <h1>Translation editor</h1>
      <p className="note">
        English on the left updates instantly. After <strong>{DEBOUNCE_MS / 1000}s</strong> quiet time per block, a
        completeness gate runs; then translation fills the Hindi column (Section 5–7). Toggle editable Hindi for
        reverse sync (Section 4.1 MVP).
      </p>
      {offline && (
        <div className="offline-banner" role="status">
          Network or server error — source editing still works. Last Hindi is shown where available.
        </div>
      )}
      <div className="toolbar">
        <label className="toggle">
          <input
            type="checkbox"
            checked={editableHindi}
            onChange={(e) => setEditableHindi(e.target.checked)}
          />
          Editable Hindi (reverse EN sync)
        </label>
        <button type="button" onClick={() => void onTranslateAllIdle()}>
          Batch translate ready blocks
        </button>
        <button type="button" onClick={() => onAddParagraph(doc.children[doc.children.length - 1]?.id ?? null)}>
          Add paragraph
        </button>
      </div>
      <div className="panes">
        <div className="pane">
          <div className="grid-head">English</div>
          <div ref={srcScrollRef} className="pane-scroll" onScroll={onSrcScroll}>
            {doc.children.map((b, i) => (
              <div key={b.id} className="block-wrap" data-block-id={b.id}>
                <textarea
                  aria-label={`English block ${i + 1}`}
                  value={canonicalPlainText(b)}
                  onChange={(e) => onSourceChange(b.id, e.target.value)}
                />
                <div className="row-actions">
                  {i > 0 && (
                    <button type="button" onClick={() => onMerge(b.id)}>
                      Merge with previous
                    </button>
                  )}
                  <button type="button" onClick={() => onAddParagraph(b.id)}>
                    Add after
                  </button>
                  {doc.children.length > 1 && (
                    <button type="button" onClick={() => onRemove(b.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="pane">
          <div className="grid-head">Hindi</div>
          <div ref={tgtScrollRef} className="pane-scroll" onScroll={onTgtScroll}>
            {doc.children.map((b, i) => {
              const en = canonicalPlainText(b);
              const display = canonicalTargetPlainText(b);
              const meta = b.translationMeta;
              const placeholder = !editableHindi && display.length === 0 && en.length > 0;
              const mirrorDim = meta.state === "stale" || meta.state === "error";
              return (
                <div key={b.id} className="block-wrap" data-block-id={b.id}>
                  {editableHindi ? (
                    <textarea
                      className={`target ${mirrorDim ? "dim" : ""}`}
                      aria-label={`Hindi block ${i + 1}`}
                      value={display}
                      onChange={(e) => onTargetChange(b.id, e.target.value)}
                    />
                  ) : (
                    <div
                      className={`target ${placeholder || mirrorDim ? "dim" : ""}`}
                      aria-label={`Hindi block ${i + 1}`}
                    >
                      {meta.state === "translating" && <span className="pending">Translating… </span>}
                      {placeholder ? en : display}
                    </div>
                  )}
                  <div className="meta">
                    state: {meta.state}
                    {meta.lastError && <span className="error"> — {meta.lastError}</span>}
                    {meta.state === "error" && (
                      <button type="button" className="retry" onClick={() => onRetry(b.id)}>
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
