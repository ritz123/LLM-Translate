import { LruTranslationCache } from "../src/core/translationCache.ts";
import type { TranslateRequest, TranslateResponse } from "../src/core/types.ts";
import { createGeminiAdapter } from "../server/llm/geminiAdapter.ts";
import { createMockAdapter } from "../server/llm/mockAdapter.ts";
import { createOpenAIAdapter } from "../server/llm/openaiAdapter.ts";
import type { ServerLLMAdapter } from "../server/llm/types.ts";

function selectLlmAdapter(): ServerLLMAdapter {
  const provider = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  if (provider === "mock") return createMockAdapter();
  if (provider === "gemini") return createGeminiAdapter() ?? createMockAdapter();
  if (provider === "openai") return createOpenAIAdapter() ?? createMockAdapter();
  return createGeminiAdapter() ?? createOpenAIAdapter() ?? createMockAdapter();
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

export function createTranslationService() {
  const cache = new LruTranslationCache(512);
  const llm = selectLlmAdapter();

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

  return {
    getModelVersion: () => llm.modelVersion,
    translate,
  };
}
