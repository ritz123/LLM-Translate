# High-level design: translation editor document model

**Audience:** engineers working on the desktop editor, IPC translation pipeline, or persistence.  
**Scope:** in-memory document shape, how translation is keyed to content, and explicit assumptions. It does not prescribe UI layout or LLM prompts in detail.

---

## 1. What problem the model solves

The app keeps a **structured document** whose **source** is edited by the user and whose **targets** are produced or updated by machine translation (MT), possibly for **several target locales**. The model must:

- Give a stable **identity** per logical paragraph (`Block.id`).
- Separate **authoritative source text** from **per-locale target text** and **translation bookkeeping** (state, errors, fingerprints).
- Support **invalidation** when source or locale changes so stale MT is not silently trusted.

---

## 2. Top-level shape: `DocumentRoot`

The canonical tree root is `DocumentRoot` (`src/core/types.ts`):

| Field | Role |
|--------|------|
| `type` | Always `"document"` (discriminator for future extensions). |
| `schemaVersion` | Integer; today **`1`**. Bumping it is the coarse signal for migrations. |
| `meta` | Document-level **metadata** (title, languages, active target). |
| `children` | Ordered list of **`Block`** instances (flat sequence; no nested outline tree in the MVP). |

The document is treated as an **immutable update** graph in React: transforms return a new `DocumentRoot` rather than mutating in place.

---

## 3. Document metadata: `DocumentMeta`

`DocumentMeta` holds:

- **`title`** — display / import title; default `"Draft"`.
- **`sourceLang`** — BCP-47-ish locale string for the source column (default `"en"`).
- **`targetLangs`** — list of target locale codes the pipeline may fill (e.g. Indian languages).
- **`activeTargetLang`** — which target locale drives the **right-hand pane** and which **legacy root-level** mirror fields stay in sync with when present.

**Normalization** (`normalizeDocumentMeta` in `src/core/documentMeta.ts`):

- Accepts legacy **`targetLang`** (singular) and maps it into `targetLangs` / `activeTargetLang`.
- Ensures `activeTargetLang` is always a member of `targetLangs`.
- De-duplicates `targetLangs`.

---

## 4. Block model: `Block`

Each `Block` is one **logical segment** (today almost always a **paragraph** in the UI).

### 4.1 Source content

- **`inline`** — ordered list of **`InlineNode`** nodes. Today only **`InlineTextNode`** (`kind: "text"`) is used in the product path.
- **`type`** — e.g. `"paragraph"`; may be `"heading"` or `"list_item"` for richer trees later.
- **`structural`** — JSON-shaped bag for type-specific data (e.g. heading level); included in **hash** policy for translation identity.

**Canonical source string** for MT and hashing is **`canonicalPlainText(block)`**: concatenation of all text nodes in `inline`, in order (`src/core/canonical.ts`). Rich runs (multiple nodes with styles) are allowed by type; the **current editor** mostly behaves like a **single plain run** per block.

### 4.2 Target content and locales

Targets are stored **per locale** under optional **`targetsByLang`**: a map from locale code → **`BlockTargetLocaleSlice`**, which holds:

- `targetInline` — optional structured mirror (same node shape as source).
- `translationMeta` — state, `sourceHash`, `targetText`, errors (see §5).
- `targetProvenance` — `"machine"` vs `"user"` when relevant.

**Legacy mirror:** For older or single-locale data, target text and meta may still live on the **root** of the block (`targetInline`, `translationMeta` on `Block` itself). **`normalizeDocumentRoot`** (`documentModel.ts`) **seeds** `targetsByLang` from those legacy fields for the **active** locale and keeps root fields aligned when the active locale is read/written.

**`getLocaleSlice(block, lang)`** defines the effective slice: prefer `targetsByLang[lang]`; if the map exists but has no entry for `lang`, the slice is empty meta; otherwise fall back to legacy root fields.

### 4.3 Other block fields

- **`id`** — stable UUID per block (regenerated on merge/split operations that replace blocks).
- **`lastEditedSide`** — `"source"` | `"target"` | `null` for UX / policy hints.
- **`contentEpoch`** — optional monotonic counter for stale supersede (spec hook; used where merge/split resets state).

---

## 5. Translation metadata: `TranslationMeta`

Per locale (inside `BlockTargetLocaleSlice` or legacy root), **`TranslationMeta`** tracks:

| Field | Meaning |
|--------|---------|
| `state` | `idle` \| `pending` \| `translating` \| `done` \| `stale` \| `error` |
| `sourceHash` | Fingerprint of the **source + languages + structural policy** last successfully tied to `targetText` (see §6). |
| `targetText` | Plain string mirror of target (used when `targetInline` is absent or as redundancy). |
| `lastError` | Human-readable error when `state === "error"`. |

The UI and IPC layer set **`translating`** while a request is in flight and **`done`** / **`error`** / **`stale`** when results arrive or are dropped as inconsistent.

---

## 6. Fingerprints and the translation request

**`computeSourceHash`** (`src/core/sourceHash.ts`) hashes a payload built from:

- Canonical **source** plain text.
- **`sourceLang`** and **target** locale.
- **`PROMPT_VERSION`** (constant in `types.ts`) so prompt or client contract changes invalidate caches.
- **Block type** and a small **structural policy** string (e.g. heading level).

The server returns a **`sourceHash`** with each **`TranslateResponse`**; the client compares it to the **current** hash before applying MT so **concurrent edits** do not apply stale translations (`TranslationEditor` logic).

**`TranslateRequest`** (`types.ts`) carries `blockId`, languages, **canonical source text**, `sourceHash`, optional **structural** hints, and optional **neighbor block text** for context-only prompting (not part of the hash).

---

## 7. How documents are created or refreshed

- **`createInitialDocument()`** — one empty paragraph; default meta (e.g. Hindi target).
- **`buildDocumentFromImportedText(plainText, title, preserveMeta?)`** — splits **plain text** on **blank lines** (`\n{2,}`) into one block per segment; preserves language meta when provided.
- **`normalizeDocumentRoot(doc)`** — should be run after load or when ingesting external JSON so meta and `targetsByLang` are consistent.

Split/merge helpers exist for future rich editing (`splitBlockAt`, `mergeBlockWithPrevious`); they reset translation meta on affected blocks.

---

## 8. Assumptions (explicit)

1. **Flat MVP:** The shipped UI treats `children` as a **vertical list of paragraphs**; there is no nested document outline in the DOM tree beyond that list.
2. **Source editing = one primary text run:** `setBlockPlainText` replaces the block’s `inline` with a **single** `InlineTextNode` for the first run (vertical-slice simplification). Full multi-run rich-text editing is **not** the current editing contract.
3. **Target display:** The active locale’s target is shown from **`canonicalTargetPlainText(block, activeTargetLang)`**, which prefers `targetInline` then falls back to **`translationMeta.targetText`**.
4. **Multi-locale in data, often single-locale in UI:** The data model supports **`targetLangs`**, but the current toolbar may collapse to **one** active target for the pane; switching language may **re-schedule** translation for blocks.
5. **MT boundary:** Forward translation is triggered **debounced** per block over **IPC** to the Electron main process (`translateOne` → `desktop:translate`); there is **no** separate HTTP translation server required for the desktop path in production.
6. **Identity of “same” translation:** Staleness is primarily **hash-based** plus in-flight **abort** when the user keeps typing; the model does **not** guarantee OT-style convergence beyond “drop or mark stale if hash mismatches.”
7. **Persistence:** This document describes the **in-memory / JSON-shaped** model. Long-term file format on disk (if any) should preserve `schemaVersion` and round-trip through **`normalizeDocumentRoot`** on load.
8. **Schema versioning:** **`schemaVersion: 1`** is assumed by current factories; evolving the shape requires a deliberate migration story.
9. **Large-document translation:** When the block count reaches **`LAZY_TRANSLATION_BLOCK_THRESHOLD`** (see `src/core/lazyTranslation.ts`), forward translation is **lazy**: only blocks in or near the source viewport are translated immediately on import or language change; additional blocks are scheduled as the user scrolls them into view (IntersectionObserver on the source pane). Below the threshold, all non-empty blocks are still translated eagerly on import / language change.

---

## 9. Non-goals (for this design level)

- Exact **ProseMirror** or **CRDT** schema (the types are amenable to binding later, but the MVP is block + inline).
- **Undo stack** specification (React state history is not part of the core model).
- **Server-side** persistence API or authentication.

---

## 10. File map (implementation)

| Area | Primary files |
|------|----------------|
| Types | `src/core/types.ts` |
| Document transforms | `src/core/documentModel.ts` |
| Meta normalization | `src/core/documentMeta.ts` |
| Plain text & locale slice | `src/core/canonical.ts` |
| Hashing | `src/core/sourceHash.ts` |
| Lazy translation (large docs) | `src/core/lazyTranslation.ts`, `src/components/TranslationEditor.tsx` |
| IPC translate | `src/core/translationFetch.ts`, `electron/translateService.ts` |

For a longer product/architecture narrative (sections, roadmap), see **`.plan/translation-editor-architecture.plan.md`** in this repository.
