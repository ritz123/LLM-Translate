import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
export const DEFAULT_OLLAMA_MODEL = "llama3.2";
export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";

export interface LlmUserSettingsV1 {
  version: 1;
  /** auto | gemini | ollama | openai | mock — overrides LLM_PROVIDER env when set. */
  llmProvider?: string;
  /** User-entered key; takes precedence over env when set. */
  geminiApiKey?: string;
  geminiModel?: string;
  /** Overrides GEMINI_API_BASE when set (no trailing slash). */
  geminiApiBase?: string;
  /** Overrides OLLAMA_BASE_URL when set. */
  ollamaBaseUrl?: string;
  /** Overrides OLLAMA_MODEL when set. */
  ollamaModel?: string;
}

export function userSettingsPath(): string {
  return path.join(app.getPath("userData"), "llm-user-settings.json");
}

export function loadLlmUserSettings(): LlmUserSettingsV1 {
  const p = userSettingsPath();
  try {
    if (!fs.existsSync(p)) {
      return { version: 1, geminiModel: DEFAULT_GEMINI_MODEL };
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<LlmUserSettingsV1>;
    if (raw?.version !== 1) {
      return { version: 1, geminiModel: DEFAULT_GEMINI_MODEL };
    }
    const model =
      typeof raw.geminiModel === "string" && raw.geminiModel.trim().length > 0
        ? raw.geminiModel.trim()
        : DEFAULT_GEMINI_MODEL;
    const llmProvider =
      typeof raw.llmProvider === "string" && raw.llmProvider.trim().length > 0
        ? raw.llmProvider.trim().toLowerCase()
        : undefined;
    return {
      version: 1,
      llmProvider,
      geminiApiKey: typeof raw.geminiApiKey === "string" && raw.geminiApiKey.trim() ? raw.geminiApiKey.trim() : undefined,
      geminiModel: model,
      geminiApiBase:
        typeof raw.geminiApiBase === "string" && raw.geminiApiBase.trim().length > 0
          ? raw.geminiApiBase.trim().replace(/\/+$/, "")
          : undefined,
      ollamaBaseUrl:
        typeof raw.ollamaBaseUrl === "string" && raw.ollamaBaseUrl.trim().length > 0
          ? raw.ollamaBaseUrl.trim().replace(/\/+$/, "")
          : undefined,
      ollamaModel:
        typeof raw.ollamaModel === "string" && raw.ollamaModel.trim().length > 0
          ? raw.ollamaModel.trim()
          : undefined,
    };
  } catch {
    return { version: 1, geminiModel: DEFAULT_GEMINI_MODEL };
  }
}

function writeLlmUserSettings(next: LlmUserSettingsV1): void {
  const p = userSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
}

export function patchLlmUserSettings(patch: {
  llmProvider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  clearGeminiApiKey?: boolean;
  geminiApiBase?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}): LlmUserSettingsV1 {
  const cur = loadLlmUserSettings();
  const next: LlmUserSettingsV1 = {
    version: 1,
    geminiModel: cur.geminiModel ?? DEFAULT_GEMINI_MODEL,
  };
  if (cur.llmProvider) next.llmProvider = cur.llmProvider;
  if (cur.geminiApiBase) next.geminiApiBase = cur.geminiApiBase;
  if (cur.ollamaBaseUrl) next.ollamaBaseUrl = cur.ollamaBaseUrl;
  if (cur.ollamaModel) next.ollamaModel = cur.ollamaModel;

  if (patch.llmProvider !== undefined) {
    const p = patch.llmProvider.trim().toLowerCase();
    if (p === "" || p === "auto") {
      delete next.llmProvider;
    } else if (["gemini", "ollama", "openai", "mock"].includes(p)) {
      next.llmProvider = p;
    }
  }

  if (patch.clearGeminiApiKey) {
    /* omit geminiApiKey */
  } else if (patch.geminiApiKey !== undefined && patch.geminiApiKey.trim().length > 0) {
    next.geminiApiKey = patch.geminiApiKey.trim();
  } else if (cur.geminiApiKey) {
    next.geminiApiKey = cur.geminiApiKey;
  }
  if (patch.geminiModel !== undefined) {
    next.geminiModel = patch.geminiModel.trim() || DEFAULT_GEMINI_MODEL;
  }
  if (patch.geminiApiBase !== undefined) {
    if (patch.geminiApiBase.trim().length > 0) {
      next.geminiApiBase = patch.geminiApiBase.trim().replace(/\/+$/, "");
    } else {
      delete next.geminiApiBase;
    }
  }
  if (patch.ollamaBaseUrl !== undefined) {
    if (patch.ollamaBaseUrl.trim().length > 0) {
      next.ollamaBaseUrl = patch.ollamaBaseUrl.trim().replace(/\/+$/, "");
    } else {
      delete next.ollamaBaseUrl;
    }
  }
  if (patch.ollamaModel !== undefined) {
    if (patch.ollamaModel.trim().length > 0) {
      next.ollamaModel = patch.ollamaModel.trim();
    } else {
      delete next.ollamaModel;
    }
  }
  writeLlmUserSettings(next);
  return next;
}
