/** Per design doc Section 3.8 */
export type TranslationState =
  | "idle"
  | "pending"
  | "translating"
  | "done"
  | "stale"
  | "error";

export type EditSide = "source" | "target";

export interface Style {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface InlineTextNode {
  kind: "text";
  text: string;
  styles?: Style[];
}

export type InlineNode = InlineTextNode;

export interface TranslationMeta {
  state: TranslationState;
  sourceHash: string | null;
  targetText: string | null;
  lastError?: string;
}

/** Per-locale target mirror + meta (forward / user edit state). */
export interface BlockTargetLocaleSlice {
  targetInline?: InlineTextNode[];
  translationMeta: TranslationMeta;
  targetProvenance?: "machine" | "user";
}

/** Section 3 + 4.1: optional Hindi runs mirror; provenance for UX. */
export interface Block {
  id: string;
  type: "paragraph" | "heading" | "list_item" | string;
  structural: Record<string, unknown>;
  inline: InlineNode[];
  translationMeta: TranslationMeta;
  /** Section 4.1 — structured Hindi mirror; if absent, UI uses targetText. */
  targetInline?: InlineTextNode[];
  lastEditedSide?: EditSide | null;
  /** Monotonic stamp for stale supersede (Section 4.1, Section 8). */
  contentEpoch?: number;
  targetProvenance?: "machine" | "user";
  /** When set, preferred over root-level target fields for the keyed locales. */
  targetsByLang?: Record<string, BlockTargetLocaleSlice>;
}

export interface DocumentMeta {
  title: string;
  sourceLang: string;
  /** Locales to translate into (e.g. several Indian languages at once). */
  targetLangs: string[];
  /** Right pane and reverse-sync use this locale’s stored surface. */
  activeTargetLang: string;
}

export interface DocumentRoot {
  type: "document";
  schemaVersion: number;
  meta: DocumentMeta;
  children: Block[];
}

export const PROMPT_VERSION = "v1";
/** Overridden at runtime when server reports modelVersion. */
export const MODEL_VERSION = "mock-1";

export interface ChangeEvent {
  blockId: string;
  oldSourceHash: string | null;
  newSourceHash: string | null;
}

export interface TranslateRequest {
  blockId: string;
  sourceLang: string;
  targetLang: string;
  text: string;
  sourceHash: string;
  structuralJson?: string;
  blockType?: string;
  /** Neighbour context only (Section 7). */
  context?: { previousBlockText?: string; nextBlockText?: string };
}

export interface TranslateResponse {
  blockId: string;
  translation: string;
  sourceHash: string;
  modelVersion: string;
  latencyMs: number;
  cacheHit: boolean;
}

export interface TranslateBatchRequest {
  requests: TranslateRequest[];
}

export interface TranslateBatchResponse {
  results: TranslateResponse[];
}

/** Section 9 — client-side contract; server implements via HTTP. */
export interface LLMAdapter {
  translate(req: TranslateRequest): Promise<TranslateResponse>;
}
