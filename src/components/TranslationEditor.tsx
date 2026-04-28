import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
  Alert,
  AppBar,
  Box,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Select,
  Toolbar,
  Tooltip,
  Typography,
  TextField,
} from "@mui/material";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
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
import { buildPdfExportPayload, type PdfExportVariant } from "@core/pdfExport";
import { collectVisibleBlockIds, isLazyTranslationDocument } from "@core/lazyTranslation";
import { targetScriptClassForLang } from "@core/targetLangFonts";
import { selectMenuProps } from "../ui/selectMenuProps";
import { TOOLBAR_CONTROL_HEIGHT_PX, toolbarIconButtonSx } from "../ui/toolbarChrome";
import DesktopTitleBar from "./DesktopTitleBar";
import LlmConfigModal from "./LlmConfigModal";

const BASE = "";
const DEBOUNCE_MS = 2000;

/** Same floor height for each source/target pair so both panes use matched “page” rows. */
const DOC_BLOCK_PAIR_MIN_HEIGHT = "clamp(11.5rem, 26vh, 22rem)";

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

/** Map scroll position from `leader` to `follower` by scrollable ratio (fallback when total heights still differ). */
function syncScrollProportionally(leader: HTMLElement, follower: HTMLElement): void {
  const leadMax = Math.max(0, leader.scrollHeight - leader.clientHeight);
  const followMax = Math.max(0, follower.scrollHeight - follower.clientHeight);
  const ratio = leadMax > 0 ? leader.scrollTop / leadMax : 0;
  follower.scrollTop = ratio * followMax;
}

/** Same scroll pixel when both columns have (nearly) the same scroll height — paired rows are equalized for this. */
function syncScrollInUnison(leader: HTMLElement, follower: HTMLElement): void {
  const leadMax = Math.max(0, leader.scrollHeight - leader.clientHeight);
  const followMax = Math.max(0, follower.scrollHeight - follower.clientHeight);
  if (leadMax === 0 && followMax === 0) return;
  const dh = Math.abs(leader.scrollHeight - follower.scrollHeight);
  if (dh <= 2) {
    follower.scrollTop = Math.min(followMax, Math.max(0, leader.scrollTop));
  } else {
    syncScrollProportionally(leader, follower);
  }
}

function clampScrollTop(el: HTMLElement): void {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (el.scrollTop > max) el.scrollTop = max;
}

function indexDocBlockArticles(root: HTMLElement): Map<string, HTMLElement> {
  const m = new Map<string, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>("article.doc-block")) {
    const id = el.getAttribute("data-block-id");
    if (id) m.set(id, el);
  }
  return m;
}

/** Set each source/target `article.doc-block` pair to the same height so both panes scroll in lockstep. */
function equalizePairedBlockHeights(
  srcRoot: HTMLElement | null,
  tgtRoot: HTMLElement | null,
  blockIds: readonly string[],
): void {
  if (!srcRoot || !tgtRoot) return;

  const srcMap = indexDocBlockArticles(srcRoot);
  const tgtMap = indexDocBlockArticles(tgtRoot);

  for (const id of blockIds) {
    const s = srcMap.get(id);
    const t = tgtMap.get(id);
    if (s) s.style.minHeight = "";
    if (t) t.style.minHeight = "";
  }

  void srcRoot.offsetHeight;

  for (const id of blockIds) {
    const s = srcMap.get(id);
    const t = tgtMap.get(id);
    if (!s || !t) continue;
    const h = Math.ceil(Math.max(s.offsetHeight, t.offsetHeight));
    s.style.minHeight = `${h}px`;
    t.style.minHeight = `${h}px`;
  }
}

export default function TranslationEditor() {
  const [doc, setDoc] = useState<DocumentRoot>(() => createInitialDocument());
  const [offline, setOffline] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const cacheRef = useRef(new LruTranslationCache(256));
  const debounceFwd = useRef(new Map<string, number>());
  const abortFwd = useRef(new Map<string, AbortController>());
  const srcScrollRef = useRef<HTMLDivElement>(null);
  const tgtScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const equalizeRafRef = useRef(0);
  const forwardSentPlainRef = useRef(new Map<string, string>());
  const scheduleForwardRef = useRef<(blockId: string) => void>(() => {});
  const childIdsKey = doc.children.map((b) => b.id).join(",");
  const isLazyDoc = isLazyTranslationDocument(doc.children.length);

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

  scheduleForwardRef.current = scheduleForward;

  useLayoutEffect(() => {
    if (!isLazyDoc) return;
    const root = srcScrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue;
          const el = ent.target as HTMLElement;
          const id = el.dataset.blockId;
          if (!id) continue;
          const b = getBlock(docRef.current, id);
          if (!b || !canonicalPlainText(b).trim()) continue;
          scheduleForwardRef.current(id);
        }
      },
      { root, rootMargin: "160px 0px 320px 0px", threshold: 0.01 },
    );
    for (const el of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
      io.observe(el);
    }
    return () => io.disconnect();
  }, [isLazyDoc, childIdsKey]);

  const onSourceChange = (blockId: string, text: string) => {
    setOffline(false);
    setDoc((d) => setBlockPlainText(d, blockId, text));
    scheduleForward(blockId);
  };

  const scheduleAllBlocks = useCallback(() => {
    const d = docRef.current;
    setOffline(false);
    if (isLazyTranslationDocument(d.children.length)) {
      const root = srcScrollRef.current;
      const visible = root ? collectVisibleBlockIds(root) : [];
      for (const id of visible) {
        cancelForwardDebounce(id);
        const b = getBlock(d, id);
        if (!b || !canonicalPlainText(b).trim()) continue;
        scheduleForward(id);
      }
      return;
    }
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
    if (isLazyTranslationDocument(nextDoc.children.length)) {
      requestAnimationFrame(() => {
        const root = srcScrollRef.current;
        if (!root) return;
        for (const id of collectVisibleBlockIds(root)) {
          const b = getBlock(docRef.current, id);
          if (!b || !canonicalPlainText(b).trim()) continue;
          cancelForwardDebounce(id);
          void runForward(id);
        }
      });
    } else {
      for (const b of nextDoc.children) {
        if (!canonicalPlainText(b).trim()) continue;
        cancelForwardDebounce(b.id);
        void runForward(b.id);
      }
    }
  }, [flushForwardSchedulers, cancelForwardDebounce, runForward]);

  const openExportPdfMenu = (e: MouseEvent<HTMLElement>) => setExportMenuAnchor(e.currentTarget);
  const closeExportPdfMenu = () => setExportMenuAnchor(null);

  const onExportPdfVariant = useCallback(async (variant: PdfExportVariant) => {
    closeExportPdfMenu();
    const api = window.translatorDesktop?.exportPdf;
    if (!api) {
      window.alert("PDF export is only available in the desktop app.");
      return;
    }
    const payload = buildPdfExportPayload(docRef.current, variant);
    const res = await api(payload);
    if ("cancelled" in res && res.cancelled) return;
    if ("ok" in res && res.ok === false) {
      window.alert(res.error);
    }
  }, []);

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

  const scheduleEqualizePairedHeights = useCallback(() => {
    if (equalizeRafRef.current !== 0) cancelAnimationFrame(equalizeRafRef.current);
    equalizeRafRef.current = requestAnimationFrame(() => {
      equalizeRafRef.current = 0;
      equalizePairedBlockHeights(
        srcScrollRef.current,
        tgtScrollRef.current,
        docRef.current.children.map((c) => c.id),
      );
      const src = srcScrollRef.current;
      const tgt = tgtScrollRef.current;
      if (src && tgt) {
        syncingScroll.current = true;
        clampScrollTop(src);
        syncScrollInUnison(src, tgt);
        requestAnimationFrame(() => {
          syncingScroll.current = false;
        });
      }
    });
  }, []);

  useLayoutEffect(() => {
    const srcRoot = srcScrollRef.current;
    const tgtRoot = tgtScrollRef.current;
    if (!srcRoot || !tgtRoot) return undefined;

    const blockIds = childIdsKey.length > 0 ? childIdsKey.split(",") : [];

    scheduleEqualizePairedHeights();

    const ro = new ResizeObserver(() => {
      scheduleEqualizePairedHeights();
    });
    ro.observe(srcRoot);
    ro.observe(tgtRoot);
    for (const el of srcRoot.querySelectorAll("article.doc-block")) ro.observe(el);
    for (const el of tgtRoot.querySelectorAll("article.doc-block")) ro.observe(el);

    return () => {
      ro.disconnect();
      if (equalizeRafRef.current !== 0) cancelAnimationFrame(equalizeRafRef.current);
      equalizeRafRef.current = 0;
      const srcMap = indexDocBlockArticles(srcRoot);
      const tgtMap = indexDocBlockArticles(tgtRoot);
      for (const id of blockIds) {
        const s = srcMap.get(id);
        const t = tgtMap.get(id);
        if (s) s.style.minHeight = "";
        if (t) t.style.minHeight = "";
      }
    };
  }, [childIdsKey, scheduleEqualizePairedHeights]);

  const onSrcScroll = () => {
    const src = srcScrollRef.current;
    const tgt = tgtScrollRef.current;
    if (!src || !tgt || syncingScroll.current) return;
    syncingScroll.current = true;
    syncScrollInUnison(src, tgt);
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  const onTgtScroll = () => {
    const src = srcScrollRef.current;
    const tgt = tgtScrollRef.current;
    if (!src || !tgt || syncingScroll.current) return;
    syncingScroll.current = true;
    syncScrollInUnison(tgt, src);
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  const targetFontClass = targetScriptClassForLang(doc.meta.activeTargetLang);
  const targetTextDir = doc.meta.activeTargetLang === "ur" ? "rtl" : "ltr";

  return (
    <Box
      id="translation-editor-root"
      className="translation-editor translation-editor-v2"
      sx={{
        height: "100vh",
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <AppBar id="app-top-bar" position="static" color="default" elevation={1} sx={{ flexShrink: 0 }}>
        <Toolbar
          id="app-toolbar"
          variant="dense"
          sx={{
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1,
            py: 0.75,
            columnGap: 1.25,
            minHeight: TOOLBAR_CONTROL_HEIGHT_PX + 12,
          }}
        >
          <Box
            id="app-titlebar-drag"
            sx={{
              flex: "1 1 120px",
              display: "flex",
              alignItems: "center",
              minWidth: 0,
              WebkitAppRegion: "drag",
            }}
          >
            <Typography id="app-title" variant="h6" component="h1" sx={{ fontWeight: 600 }}>
              Translator
            </Typography>
          </Box>
          <Box id="app-header-actions" sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap", WebkitAppRegion: "no-drag" }}>
            <Tooltip title="Import">
              <IconButton
                id="toolbar-import-document"
                size="small"
                color="primary"
                onClick={() => void onImportDocument()}
                aria-label="Import document"
                sx={{
                  ...toolbarIconButtonSx,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <FileUploadOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <>
              <Tooltip title="Export PDF">
                <IconButton
                  id="toolbar-export-pdf"
                  size="small"
                  color="primary"
                  aria-controls={exportMenuAnchor ? "toolbar-export-pdf-menu" : undefined}
                  aria-expanded={exportMenuAnchor ? true : undefined}
                  aria-haspopup="true"
                  aria-label="Export as PDF"
                  onClick={openExportPdfMenu}
                  sx={{
                    ...toolbarIconButtonSx,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "background.paper",
                  }}
                >
                  <PictureAsPdfOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                id="toolbar-export-pdf-menu"
                anchorEl={exportMenuAnchor}
                open={Boolean(exportMenuAnchor)}
                onClose={closeExportPdfMenu}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { minWidth: 260 } } }}
                disableAutoFocusItem
              >
                <MenuItem id="toolbar-export-pdf-source" onClick={() => void onExportPdfVariant("source")}>
                  Source text only
                </MenuItem>
                <MenuItem id="toolbar-export-pdf-target" onClick={() => void onExportPdfVariant("target")}>
                  Translation only ({labelForTargetLang(doc.meta.activeTargetLang)})
                </MenuItem>
                <MenuItem id="toolbar-export-pdf-bilingual" onClick={() => void onExportPdfVariant("bilingual")}>
                  Bilingual (source + translation per paragraph)
                </MenuItem>
              </Menu>
            </>
            <Tooltip title="Settings">
              <IconButton
                id="toolbar-open-configuration"
                size="small"
                onClick={() => setConfigOpen(true)}
                aria-label="Open configuration"
                sx={{
                  ...toolbarIconButtonSx,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                }}
              >
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Box
              id="toolbar-target-lang-form"
              component="div"
              className="toolbar-lang-row"
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 0,
                minWidth: 0,
                flexShrink: 0,
                height: TOOLBAR_CONTROL_HEIGHT_PX,
              }}
            >
              <Tooltip title="Target language">
                <Select
                  id="toolbar-target-lang-select"
                  aria-label="Target language"
                  className={`target-lang-font ${targetFontClass}`}
                  dir={targetTextDir}
                  value={doc.meta.activeTargetLang}
                  onChange={(e) => setTargetLanguageDropdown(e.target.value)}
                  variant="outlined"
                  size="small"
                  displayEmpty
                  MenuProps={selectMenuProps(320)}
                  startAdornment={
                    <InputAdornment position="start" sx={{ mr: 0, maxHeight: "none" }}>
                      <LanguageOutlined sx={{ fontSize: "1.125rem", color: "text.secondary" }} aria-hidden />
                    </InputAdornment>
                  }
                  sx={{
                    minWidth: 200,
                    maxWidth: 300,
                    height: TOOLBAR_CONTROL_HEIGHT_PX,
                    fontSize: "0.8125rem",
                    "& .MuiOutlinedInput-root": {
                      height: TOOLBAR_CONTROL_HEIGHT_PX,
                      borderRadius: 1,
                      pl: 0.75,
                    },
                    "& .MuiOutlinedInput-notchedOutline": {
                      top: 0,
                    },
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center",
                      minHeight: TOOLBAR_CONTROL_HEIGHT_PX - 2,
                      py: 0,
                      pr: 1.25,
                      pl: 0.5,
                      boxSizing: "border-box",
                    },
                  }}
                >
                  {!INDIAN_TARGET_LANGUAGE_OPTIONS.some((o) => o.code === doc.meta.activeTargetLang) && (
                    <MenuItem id={`toolbar-target-lang-option-${doc.meta.activeTargetLang}`} value={doc.meta.activeTargetLang}>
                      {labelForTargetLang(doc.meta.activeTargetLang)} ({doc.meta.activeTargetLang})
                    </MenuItem>
                  )}
                  {INDIAN_TARGET_LANGUAGE_OPTIONS.map((o) => (
                    <MenuItem id={`toolbar-target-lang-option-${o.code}`} key={o.code} value={o.code}>
                      {o.label} ({o.code})
                    </MenuItem>
                  ))}
                </Select>
              </Tooltip>
            </Box>
          </Box>
          <Box id="app-window-controls-slot" sx={{ ml: "auto", display: "flex", alignItems: "center", flexShrink: 0, WebkitAppRegion: "no-drag" }}>
            <DesktopTitleBar />
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        id="translation-editor-body"
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          px: 2,
          py: 1.5,
          maxWidth: 1480,
          mx: "auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <Typography id="app-subline" variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: "70ch" }}>
          Source updates as you type. Translation runs automatically <strong>{DEBOUNCE_MS / 1000}s</strong> after you stop
          editing a paragraph (non-empty text only).
        </Typography>

        {isLazyDoc && (
          <Alert id="lazy-translation-banner" severity="info" sx={{ mb: 2 }}>
            Large document: translations load for the <strong>paragraphs you scroll into view</strong> (plus the first
            screen). Other paragraphs translate as you reach them.
          </Alert>
        )}

        {offline && (
          <Alert id="offline-banner" severity="warning" sx={{ mb: 2 }} role="status">
            Translation failed — use <strong>Configuration</strong> to set the LLM provider and keys, then edit again to
            retry after {DEBOUNCE_MS / 1000}s, or change a character to re-schedule.
          </Alert>
        )}

        <Box
          id="editor-panes"
          className="panes panes-v2"
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            display: "grid",
            /* Equal columns so each “page” block has the same width as its pair */
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
            gridTemplateRows: { xs: "minmax(0, 1fr) minmax(0, 1fr)", md: "minmax(0, 1fr)" },
            gap: 2,
            alignItems: "stretch",
            overflow: "hidden",
          }}
        >
          <Paper
            id="pane-source-section"
            component="section"
            className="pane pane-source doc-prose"
            elevation={0}
            variant="outlined"
            aria-label="Source text"
            sx={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%", p: 0, overflow: "hidden" }}
          >
            <Typography id="pane-source-label" className="pane-label" variant="overline" color="text.secondary" sx={{ px: 1, pt: 1, pb: 0.5 }}>
              Source
            </Typography>
            <Box
              ref={srcScrollRef}
              id="pane-scroll-source"
              className="pane-scroll pane-scroll-source"
              onScroll={onSrcScroll}
              sx={{ flex: 1, minHeight: 0, scrollbarGutter: "stable" }}
            >
              {doc.children.map((b, i) => (
                <Box
                  key={b.id}
                  component="article"
                  className="doc-block"
                  data-block-id={b.id}
                  sx={{
                    mb: 2,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: DOC_BLOCK_PAIR_MIN_HEIGHT,
                    "&:last-child": { mb: 0 },
                  }}
                >
                  <TextField
                    id={`source-block-input-${b.id}`}
                    multiline
                    fullWidth
                    minRows={4}
                    aria-label={`Source paragraph ${i + 1}`}
                    value={canonicalPlainText(b)}
                    onChange={(e) => onSourceChange(b.id, e.target.value)}
                    spellCheck
                    variant="outlined"
                    size="small"
                    sx={{
                      flex: 1,
                      alignSelf: "stretch",
                      "& .MuiOutlinedInput-root": {
                        height: "100%",
                        alignItems: "stretch",
                        backgroundColor: "#fafafa",
                        "&.Mui-focused": { backgroundColor: "#fafafa" },
                      },
                      "& .MuiOutlinedInput-input": {
                        padding: "14px 16px",
                        boxSizing: "border-box",
                      },
                      "& textarea.source-doc-input": {
                        minHeight: "10rem",
                        boxSizing: "border-box",
                      },
                    }}
                    slotProps={{ htmlInput: { className: "source-doc-input" } }}
                  />
                </Box>
              ))}
            </Box>
          </Paper>
          <Paper
            id="pane-target-section"
            component="section"
            className={`pane pane-target doc-prose pane-target-pane ${targetFontClass}`}
            elevation={0}
            variant="outlined"
            aria-label="Translation"
            lang={doc.meta.activeTargetLang}
            sx={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, height: "100%", p: 0, overflow: "hidden" }}
          >
            <Typography id="pane-target-label" className="pane-label" variant="overline" color="text.secondary" sx={{ px: 1, pt: 1, pb: 0.5 }}>
              {labelForTargetLang(doc.meta.activeTargetLang)}
            </Typography>
            <Box
              ref={tgtScrollRef}
              id="pane-scroll-target"
              className="pane-scroll pane-scroll-target"
              dir={targetTextDir}
              onScroll={onTgtScroll}
              sx={{ flex: 1, minHeight: 0, scrollbarGutter: "stable" }}
            >
              {doc.children.map((b, i) => {
                const activeLang = doc.meta.activeTargetLang;
                const en = canonicalPlainText(b);
                const display = canonicalTargetPlainText(b, activeLang);
                const meta = getLocaleSlice(b, activeLang).translationMeta;
                const placeholder = display.length === 0 && en.length > 0;
                const mirrorDim = meta.state === "stale" || meta.state === "error";
                return (
                  <Box
                    key={b.id}
                    component="article"
                    className="doc-block"
                    data-block-id={b.id}
                    sx={{
                      mb: 2,
                      display: "flex",
                      flexDirection: "column",
                      minHeight: DOC_BLOCK_PAIR_MIN_HEIGHT,
                      "&:last-child": { mb: 0 },
                    }}
                  >
                    <Box
                      id={`target-block-display-${b.id}`}
                      className={`target-readonly doc-translation ${placeholder || mirrorDim ? "dim" : ""}`}
                      aria-label={`Translation paragraph ${i + 1}`}
                      component="div"
                      sx={{ flex: 1, minHeight: "10rem" }}
                    >
                      {meta.state === "translating" && (
                        <Typography id={`target-block-pending-${b.id}`} component="span" className="pending" variant="body2">
                          Translating…{" "}
                        </Typography>
                      )}
                      {placeholder ? <span className="mirror-faint">{en}</span> : display}
                    </Box>
                    {meta.state === "error" && meta.lastError && (
                      <Typography id={`target-block-error-${b.id}`} className="translation-error" variant="caption" color="error" role="alert" sx={{ display: "block", mt: 0.5 }}>
                        {meta.lastError}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Box>
      </Box>

      <Box
        id="app-copyright-footer"
        component="footer"
        sx={{
          flexShrink: 0,
          py: 1.5,
          px: 2,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          textAlign: "center",
        }}
      >
        <Typography id="app-copyright-text" variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          © {new Date().getFullYear()} Biplab Sarkar. All rights reserved.
        </Typography>
      </Box>

      <LlmConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </Box>
  );
}
