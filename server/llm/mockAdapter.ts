import { mockTranslate } from "../../src/core/mockTranslate.ts";
import type { TranslateRequest } from "../../src/core/types.ts";
import type { ServerLLMAdapter } from "./types.ts";

export function createMockAdapter(): ServerLLMAdapter {
  return {
    modelVersion: "mock-1",
    async translate(req: TranslateRequest) {
      const started = performance.now();
      await new Promise((r) => setTimeout(r, 80 + Math.floor(Math.random() * 120)));
      const translation = mockTranslate(req.text, req.sourceLang, req.targetLang);
      return { translation, latencyMs: Math.round(performance.now() - started) };
    },
  };
}
