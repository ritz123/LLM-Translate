import { LruTranslationCache } from "../src/core/translationCache.ts";
import type { Block, TranslateRequest, TranslateResponse } from "../src/core/types.ts";
import { computeSourceHash } from "../src/core/sourceHash.ts";
import { DEBUG_LLM_PING_ENGLISH } from "../src/core/debugPing.ts";
import { createGeminiAdapter, type GeminiAdapterOverrides } from "../server/llm/geminiAdapter.ts";
import { createMockAdapter } from "../server/llm/mockAdapter.ts";
import { createOllamaAdapter } from "../server/llm/ollamaAdapter.ts";
import { createOpenAIAdapter } from "../server/llm/openaiAdapter.ts";
import type { ServerLLMAdapter } from "../server/llm/types.ts";
import { FALLBACK_GEMINI_MODEL_IDS } from "../server/llm/geminiListModels.ts";
import type { LlmUserSettingsV1 } from "./llmUserSettings.ts";
import { loadLlmUserSettings, patchLlmUserSettings } from "./llmUserSettings.ts";

function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t.length > 0) return t;
  }
  return "";
}

function trimOllamaBase(raw: string | undefined): string {
  const d = (raw ?? "http://127.0.0.1:11434").trim() || "http://127.0.0.1:11434";
  return d.replace(/\/+$/, "");
}

function geminiOverridesFromUser(user: LlmUserSettingsV1): GeminiAdapterOverrides {
  return {
    apiKey: user.geminiApiKey,
    model: user.geminiModel,
    apiBase: user.geminiApiBase,
  };
}

function ollamaOverridesFromUser(user: LlmUserSettingsV1) {
  return { baseUrl: user.ollamaBaseUrl, model: user.ollamaModel };
}

function selectLlmAdapter(user: LlmUserSettingsV1): ServerLLMAdapter {
  const gem = () => createGeminiAdapter(geminiOverridesFromUser(user));
  const fromUser = (user.llmProvider ?? "").trim().toLowerCase();
  const fromEnv = (process.env.LLM_PROVIDER ?? "auto").trim().toLowerCase();
  const provider = fromUser || fromEnv || "auto";
  if (provider === "mock") return createMockAdapter();
  if (provider === "ollama") return createOllamaAdapter(ollamaOverridesFromUser(user));
  if (provider === "gemini") return gem() ?? createMockAdapter();
  if (provider === "openai") return createOpenAIAdapter() ?? createMockAdapter();
  return gem() ?? createOpenAIAdapter() ?? createOllamaAdapter(ollamaOverridesFromUser(user)) ?? createMockAdapter();
}

export function validateTranslateRequest(body: unknown): TranslateRequest {
  const o = body as Partial<TranslateRequest>;
  if (!o.blockId || typeof o.blockId !== "string") throw new Error("blockId required");
  if (!o.sourceHash || typeof o.sourceHash !== "string") throw new Error("sourceHash required");
  if (!o.sourceLang || !o.targetLang) throw new Error("sourceLang and targetLang required");
  return {
    blockId: o.blockId,
    sourceLang: o.sourceLang,
    targetLang: o.targetLang,
    text: String(o.text ?? ""),
    sourceHash: o.sourceHash,
    structuralJson: o.structuralJson,
    blockType: o.blockType,
    context: o.context,
  };
}

export type LlmUserSettingsPayload = {
  llmProvider: string;
  geminiApiKeySaved: boolean;
  geminiModel: string;
  geminiApiBase: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  fallbackGeminiModelIds: readonly string[];
};

export function createTranslationService(initialUser: LlmUserSettingsV1) {
  const cache = new LruTranslationCache(512);
  let user = initialUser;
  let llm = selectLlmAdapter(user);

  function rebuildLlm(): void {
    user = loadLlmUserSettings();
    llm = selectLlmAdapter(user);
  }

  function effectiveGeminiKey(): string {
    return firstNonEmpty(user.geminiApiKey, process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
  }

  function getLlmUserSettingsPayload(): LlmUserSettingsPayload {
    return {
      llmProvider: user.llmProvider?.trim() ?? "",
      geminiApiKeySaved: Boolean(user.geminiApiKey?.trim()),
      geminiModel: user.geminiModel ?? "gemini-2.0-flash",
      geminiApiBase: user.geminiApiBase ?? "",
      ollamaBaseUrl: user.ollamaBaseUrl ?? "",
      ollamaModel: user.ollamaModel ?? "",
      fallbackGeminiModelIds: [...FALLBACK_GEMINI_MODEL_IDS],
    };
  }

  function resolveGeminiApiBaseForList(draftBase?: string): string {
    const t = draftBase?.trim();
    if (t && t.length > 0) return t.replace(/\/+$/, "");
    const u = loadLlmUserSettings();
    const def = "https://generativelanguage.googleapis.com/v1beta";
    return (firstNonEmpty(u.geminiApiBase, process.env.GEMINI_API_BASE) || def).replace(/\/+$/, "");
  }

  function getEffectiveGeminiKeyForList(draft?: string): string | undefined {
    const t = draft?.trim();
    if (t) return t;
    const e = effectiveGeminiKey();
    return e.length > 0 ? e : undefined;
  }

  function applyLlmUserSettingsPatch(patch: {
    llmProvider?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    clearGeminiApiKey?: boolean;
    geminiApiBase?: string;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
  }): void {
    patchLlmUserSettings(patch);
    rebuildLlm();
  }

  function getDebugInfo() {
    const hasFile = Boolean(user.geminiApiKey?.trim());
    const hasEnv = Boolean(firstNonEmpty(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY));
    const gemEnv = (process.env.GEMINI_API_KEY ?? "").trim();
    const gogEnv = (process.env.GOOGLE_API_KEY ?? "").trim();
    const openaiEnv = (process.env.OPENAI_API_KEY ?? "").trim();
    const uiKey = user.geminiApiKey?.trim() ?? "";
    const eff = effectiveGeminiKey();
    const ollamaBaseEff = trimOllamaBase(firstNonEmpty(user.ollamaBaseUrl, process.env.OLLAMA_BASE_URL));
    const ollamaModelEff = firstNonEmpty(user.ollamaModel, process.env.OLLAMA_MODEL) || "llama3.2";
    const activeIsOllama = llm.modelVersion.startsWith("ollama:");
    const gemBaseDef = "https://generativelanguage.googleapis.com/v1beta";
    const geminiApiBaseEff = (firstNonEmpty(user.geminiApiBase, process.env.GEMINI_API_BASE) || gemBaseDef).replace(
      /\/+$/,
      "",
    );
    const fromUser = (user.llmProvider ?? "").trim().toLowerCase();
    const fromEnv = (process.env.LLM_PROVIDER ?? "auto").trim().toLowerCase();
    return {
      modelVersion: llm.modelVersion,
      llmProvider: fromUser || fromEnv || "auto",
      ollamaBaseUrl: ollamaBaseEff,
      ollamaModel: ollamaModelEff,
      activeIsOllama,
      geminiApiBaseEffective: geminiApiBaseEff,
      geminiApiBaseFromSettings: user.geminiApiBase ?? "",
      hasGeminiKey: hasFile || hasEnv,
      hasGeminiKeyFromSettings: hasFile,
      hasGeminiKeyFromEnv: hasEnv,
      hasOpenAiKey: Boolean(openaiEnv),
      selectedGeminiModel: user.geminiModel ?? "gemini-2.0-flash",
      geminiApiKeyEffective: eff,
      geminiApiKeyFromSettings: uiKey,
      geminiApiKeyEnvGemini: gemEnv,
      geminiApiKeyEnvGoogle: gogEnv,
      openaiApiKeyEnv: openaiEnv,
    };
  }

  async function translate(req: TranslateRequest): Promise<TranslateResponse> {
    const started = performance.now();
    const key = req.sourceHash;
    const cached = cache.get(key);
    if (cached !== null) {
      return {
        blockId: req.blockId,
        translation: cached,
        sourceHash: req.sourceHash,
        modelVersion: llm.modelVersion,
        latencyMs: Math.round(performance.now() - started),
        cacheHit: true,
      };
    }
    const { translation, latencyMs } = await llm.translate(req);
    cache.set(key, translation);
    return {
      blockId: req.blockId,
      translation,
      sourceHash: req.sourceHash,
      modelVersion: llm.modelVersion,
      latencyMs,
      cacheHit: false,
    };
  }

  async function debugLlmPing(): Promise<
    | { ok: true; info: ReturnType<typeof getDebugInfo>; response: TranslateResponse }
    | { ok: false; info: ReturnType<typeof getDebugInfo>; error: string }
  > {
    const info = getDebugInfo();
    const text = DEBUG_LLM_PING_ENGLISH;
    const block: Block = {
      id: "__debug_block__",
      type: "paragraph",
      structural: {},
      inline: [{ kind: "text", text, styles: [] }],
      translationMeta: { state: "idle", sourceHash: null, targetText: null },
    };
    const meta = { title: "Debug", sourceLang: "en", targetLangs: ["hi"] as string[], activeTargetLang: "hi" };
    try {
      const sourceHash = await computeSourceHash(block, meta);
      const tr = validateTranslateRequest({
        blockId: "__debug_ping__",
        sourceLang: "en",
        targetLang: "hi",
        text,
        sourceHash,
        blockType: "paragraph",
      });
      const response = await translate(tr);
      return { ok: true, info, response };
    } catch (e) {
      return { ok: false, info, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    getModelVersion: () => llm.modelVersion,
    getDebugInfo,
    getLlmUserSettingsPayload,
    getEffectiveGeminiKeyForList,
    resolveGeminiApiBaseForList,
    applyLlmUserSettingsPatch,
    debugLlmPing,
    translate,
  };
}

export type TranslationService = ReturnType<typeof createTranslationService>;
