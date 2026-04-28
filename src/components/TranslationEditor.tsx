import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildDocumentFromImportedText,
  createInitialDocument,
  getBlock,
  normalizeDocumentRoot,
  setBlockMachineTranslation,
  setBlockPlainText,
  setBlockTranslationMeta,
} from "@core/documentModel";
import type { DocumentRoot } from "@core/types";
import { canonicalPlainText, canonicalTargetPlainText, getLocaleSlice } from "@core/canonical";
import { computeSourceHash } from "@core/sourceHash";
import { LruTranslationCache } from "@core/translationCache";
import { translateOne } from "@core/translationFetch";
import { logTranslation } from "@core/observability";
import { normalizeDocumentMeta } from "@core/documentMeta";
import { INDIAN_TARGET_LANGUAGE_OPTIONS, labelForTargetLang } from "@core/indianLanguages";
import { targetScriptClassForLang } from "@core/targetLangFonts";
import LlmConfigModal from "./LlmConfigModal";

const BASE = "";
const DEBOUNCE_MS = 2000;

const fwdAbortKey = (blockId: string, lang: string) => `${blockId}::${lang}`;

function abortAllForwardForBlock(map: Map<string, AbortController>, blockId: string): void {
  const prefix = `${blockId}::`;
  for (const key of [...map.keys()]) {
    if (key.startsWith(prefix)) {
      map.get(key)?.abort();
      map.delete(key);
    }
  }
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
  const [offline, setOffline] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const cacheRef = useRef(new LruTranslationCache(256));
  const debounceFwd = useRef(new Map<string, number>());
  const abortFwd = useRef(new Map<string, AbortController>());
  const srcScrollRef = useRef<HTMLDivElement>(null);
  const tgtScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const forwardSentPlainRef = useRef(new Map<string, string>());

  const cancelForwardDebounce = useCallback((blockId: string) => {
    const t = debounceFwd.current.get(blockId);
    if (t !== undefined) clearTimeout(t);
    debounceFwd.current.delete(blockId);
  }, []);

  const runForward = useCallback(
    async (blockId: string) => {
      const d = docRef.current;
      const block = getBlock(d, blockId);
      if (!block) return;
      const plain = canonicalPlainText(block).trim();
      if (!plain) return;
      cancelForwardDebounce(blockId);
      abortAllForwardForBlock(abortFwd.current, blockId);
      logTranslation("info", {
        event: "forward_run",
        blockId,
        direction: "forward",
        gate: "timer",
      });

      const langs = d.meta.targetLangs;
      const cachedApply: { lang: string; hash: string; text: string }[] = [];
      const todo: { lang: string; hash: string }[] = [];
      for (const lang of langs) {
        const hash = await computeSourceHash(block, d.meta, lang);
        const cached = cacheRef.current.get(hash);
        if (cached !== null) {
          cachedApply.push({ lang, hash, text: cached });
        } else {
          todo.push({ lang, hash });
        }
      }
      if (cachedApply.length > 0) {
        setDoc((x) => {
          let n = x;
          for (const row of cachedApply) {
            n = setBlockMachineTranslation(n, blockId, row.text, row.hash, row.lang);
          }
          return n;
        });
        for (const row of cachedApply) {
          logTranslation("info", {
            event: "cache_hit_client",
            blockId,
            sourceHash: row.hash,
            cacheHit: true,
            direction: "forward",
            gate: row.lang,
          });
        }
      }
      if (todo.length === 0) return;

      setDoc((x) => {
        let n = x;
        for (const { lang } of todo) {
          n = setBlockTranslationMeta(n, blockId, { state: "translating", lastError: undefined }, lang);
        }
        return n;
      });
      const sentPlain = canonicalPlainText(block).trim();
      forwardSentPlainRef.current.set(blockId, sentPlain);
      const idx = d.children.findIndex((b) => b.id === blockId);
      const prevText =
        idx > 0 ? canonicalPlainText(d.children[idx - 1]!) : undefined;
      const nextText =
        idx >= 0 && idx < d.children.length - 1
          ? canonicalPlainText(d.children[idx + 1]!)
          : undefined;

      try {
        await Promise.all(
          todo.map(async ({ lang, hash }) => {
            const ac = new AbortController();
            abortFwd.current.set(fwdAbortKey(blockId, lang), ac);
            try {
              const res = await translateOne(
                BASE,
                {
                  blockId,
                  sourceLang: d.meta.sourceLang,
                  targetLang: lang,
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
              const curHash = await computeSourceHash(b2, d2.meta, lang);
              const nowPlain = canonicalPlainText(b2).trim();
              const textUnchanged = forwardSentPlainRef.current.get(blockId) === nowPlain;
              const hashOk = curHash === res.sourceHash;
              if (!hashOk && !textUnchanged) {
                logTranslation("warn", {
                  event: "stale_drop_forward",
                  blockId,
                  sourceHash: res.sourceHash,
                  direction: "forward",
                  gate: lang,
                });
                setDoc((x) => setBlockTranslationMeta(x, blockId, { state: "stale" }, lang));
                return;
              }
              if (!hashOk && textUnchanged) {
                logTranslation("warn", {
                  event: "forward_apply_despite_hash_mismatch",
                  blockId,
                  curSourceHash: curHash,
                  resSourceHash: res.sourceHash,
                  direction: "forward",
                  gate: lang,
                });
              }
              cacheRef.current.set(curHash, res.translation);
              setDoc((x) => setBlockMachineTranslation(x, blockId, res.translation, curHash, lang));
            } catch (e) {
              if (ac.signal.aborted) return;
              if (e instanceof DOMException && e.name === "AbortError") return;
              setOffline(true);
              setDoc((x) =>
                setBlockTranslationMeta(
                  x,
                  blockId,
                  {
                    state: "error",
                    lastError: e instanceof Error ? e.message : String(e),
                  },
                  lang,
                ),
              );
            } finally {
              abortFwd.current.delete(fwdAbortKey(blockId, lang));
            }
          }),
        );
      } finally {
        forwardSentPlainRef.current.delete(blockId);
      }
    },
    [cancelForwardDebounce],
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

  const onSourceChange = (blockId: string, text: string) => {
    setOffline(false);
    setDoc((d) => setBlockPlainText(d, blockId, text));
    scheduleForward(blockId);
  };

  const scheduleAllBlocks = useCallback(() => {
    const d = docRef.current;
    setOffline(false);
    for (const b of d.children) {
      cancelForwardDebounce(b.id);
      if (!canonicalPlainText(b).trim()) continue;
      scheduleForward(b.id);
    }
  }, [cancelForwardDebounce, scheduleForward]);

  const flushForwardSchedulers = useCallback(() => {
    for (const t of debounceFwd.current.values()) clearTimeout(t);
    debounceFwd.current.clear();
    for (const ac of abortFwd.current.values()) ac.abort();
    abortFwd.current.clear();
    forwardSentPlainRef.current.clear();
  }, []);

  const onImportDocument = useCallback(async () => {
    const api = window.translatorDesktop?.importDocument;
    if (!api) {
      window.alert("Import is only available in the desktop app.");
      return;
    }
    const res = await api();
    if ("cancelled" in res && res.cancelled) return;
    if ("ok" in res && res.ok === false) {
      window.alert(res.error);
      return;
    }
    if (!("ok" in res) || res.ok !== true) {
      window.alert("Import failed.");
      return;
    }
    flushForwardSchedulers();
    cacheRef.current = new LruTranslationCache(256);
    setOffline(false);
    const snap = docRef.current;
    const nextDoc = buildDocumentFromImportedText(res.plainText, res.title, {
      sourceLang: snap.meta.sourceLang,
      targetLangs: snap.meta.targetLangs,
      activeTargetLang: snap.meta.activeTargetLang,
    });
    flushSync(() => {
      setDoc(nextDoc);
    });
    for (const b of nextDoc.children) {
      if (!canonicalPlainText(b).trim()) continue;
      cancelForwardDebounce(b.id);
      void runForward(b.id);
    }
  }, [flushForwardSchedulers, cancelForwardDebounce, runForward]);

  const setTargetLanguageDropdown = useCallback(
    (code: string) => {
      const snap = docRef.current;
      const meta = normalizeDocumentMeta(snap.meta);
      if (meta.targetLangs.length === 1 && meta.targetLangs[0] === code && meta.activeTargetLang === code) {
        return;
      }
      setDoc((d) => {
        const m = normalizeDocumentMeta(d.meta);
        return normalizeDocumentRoot({
          ...d,
          meta: { ...m, targetLangs: [code], activeTargetLang: code },
        });
      });
      window.setTimeout(() => {
        const d = docRef.current;
        if (d.meta.activeTargetLang !== code || d.meta.targetLangs[0] !== code) return;
        scheduleAllBlocks();
      }, 0);
    },
    [scheduleAllBlocks],
  );

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

  const targetFontClass = targetScriptClassForLang(doc.meta.activeTargetLang);
  const targetTextDir = doc.meta.activeTargetLang === "ur" ? "rtl" : "ltr";

  return (
    <div className="translation-editor translation-editor-v2">
      <header className="app-header">
        <h1 className="app-title">Translator</h1>
        <div className="app-header-actions">
          <button type="button" className="btn-config" onClick={() => void onImportDocument()}>
            Import document…
          </button>
          <button type="button" className="btn-config" onClick={() => setConfigOpen(true)}>
            Configuration
          </button>
          <fieldset className="lang-targets-inline">
            <label htmlFor="target-lang-select" className="sr-only">
              Target language
            </label>
            <select
              id="target-lang-select"
              className={`target-lang-font ${targetFontClass}`}
              aria-label="Target language"
              dir={targetTextDir}
              value={doc.meta.activeTargetLang}
              onChange={(e) => setTargetLanguageDropdown(e.target.value)}
            >
              {!INDIAN_TARGET_LANGUAGE_OPTIONS.some((o) => o.code === doc.meta.activeTargetLang) && (
                <option value={doc.meta.activeTargetLang}>
                  {labelForTargetLang(doc.meta.activeTargetLang)} ({doc.meta.activeTargetLang})
                </option>
              )}
              {INDIAN_TARGET_LANGUAGE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} ({o.code})
                </option>
              ))}
            </select>
          </fieldset>
        </div>
      </header>

      <p className="app-subline">
        Source updates as you type. Translation runs automatically <strong>{DEBOUNCE_MS / 1000}s</strong> after you stop
        editing a paragraph (non-empty text only).
      </p>

      {offline && (
        <div className="offline-banner" role="status">
          Translation failed — use <strong>Configuration</strong> to set the LLM provider and keys, then edit again to
          retry after {DEBOUNCE_MS / 1000}s, or change a character to re-schedule.
        </div>
      )}

      <div className="panes panes-v2">
        <section className="pane pane-source doc-prose" aria-label="Source text">
          <div className="pane-label">Source</div>
          <div ref={srcScrollRef} className="pane-scroll pane-scroll-source" onScroll={onSrcScroll}>
            {doc.children.map((b, i) => (
              <article key={b.id} className="doc-block" data-block-id={b.id}>
                <textarea
                  className="source-doc-input"
                  aria-label={`Source paragraph ${i + 1}`}
                  value={canonicalPlainText(b)}
                  onChange={(e) => onSourceChange(b.id, e.target.value)}
                  spellCheck
                />
              </article>
            ))}
          </div>
        </section>
        <section
          className={`pane pane-target doc-prose pane-target-pane ${targetFontClass}`}
          aria-label="Translation"
          lang={doc.meta.activeTargetLang}
        >
          <div className="pane-label">{labelForTargetLang(doc.meta.activeTargetLang)}</div>
          <div
            ref={tgtScrollRef}
            className="pane-scroll pane-scroll-target"
            dir={targetTextDir}
            onScroll={onTgtScroll}
          >
            {doc.children.map((b, i) => {
              const activeLang = doc.meta.activeTargetLang;
              const en = canonicalPlainText(b);
              const display = canonicalTargetPlainText(b, activeLang);
              const meta = getLocaleSlice(b, activeLang).translationMeta;
              const placeholder = display.length === 0 && en.length > 0;
              const mirrorDim = meta.state === "stale" || meta.state === "error";
              return (
                <article key={b.id} className="doc-block" data-block-id={b.id}>
                  <div
                    className={`target-readonly doc-translation ${placeholder || mirrorDim ? "dim" : ""}`}
                    aria-label={`Translation paragraph ${i + 1}`}
                  >
                    {meta.state === "translating" && <span className="pending">Translating… </span>}
                    {placeholder ? <span className="mirror-faint">{en}</span> : display}
                  </div>
                  {meta.state === "error" && meta.lastError && (
                    <p className="translation-error" role="alert">
                      {meta.lastError}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <LlmConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
