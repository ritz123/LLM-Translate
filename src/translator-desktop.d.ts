import type { TranslateRequest, TranslateResponse } from "@core/types";

export interface TranslatorDebugInfo {
  modelVersion: string;
  llmProvider: string;
  hasGeminiKey: boolean;
  hasGeminiKeyFromSettings: boolean;
  hasGeminiKeyFromEnv: boolean;
  hasOpenAiKey: boolean;
  selectedGeminiModel: string;
  /** Full key string used for Gemini API calls (UI storage overrides env). */
  geminiApiKeyEffective: string;
  geminiApiKeyFromSettings: string;
  geminiApiKeyEnvGemini: string;
  geminiApiKeyEnvGoogle: string;
  openaiApiKeyEnv: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  activeIsOllama: boolean;
  geminiApiBaseEffective: string;
  geminiApiBaseFromSettings: string;
}

export type TranslatorDebugLlmPingResult =
  | { ok: true; info: TranslatorDebugInfo; response: TranslateResponse }
  | { ok: false; info: TranslatorDebugInfo; error: string };

export interface LlmUserSettingsPayload {
  llmProvider: string;
  geminiApiKeySaved: boolean;
  geminiModel: string;
  geminiApiBase: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  fallbackGeminiModelIds: readonly string[];
}

export interface GeminiModelOption {
  id: string;
  displayName: string;
}

export interface OllamaModelOption {
  id: string;
  displayName: string;
}

export interface SetLlmUserSettingsBody {
  llmProvider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  clearGeminiApiKey?: boolean;
  geminiApiBase?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export type ImportDocumentResult =
  | { cancelled: true }
  | { ok: true; filePath: string; title: string; plainText: string }
  | { ok: false; error: string };

export interface TranslatorDesktopAPI {
  getConfig(): Promise<{ modelVersion: string }>;
  getDebugInfo(): Promise<TranslatorDebugInfo>;
  debugLlmPing(): Promise<TranslatorDebugLlmPingResult>;
  getLlmUserSettings(): Promise<LlmUserSettingsPayload>;
  setLlmUserSettings(body: SetLlmUserSettingsBody): Promise<LlmUserSettingsPayload>;
  listGeminiModels(body?: { apiKey?: string; apiBase?: string }): Promise<{ models: GeminiModelOption[] }>;
  listOllamaModels(body?: { baseUrl?: string }): Promise<{ models: OllamaModelOption[] }>;
  translate(body: TranslateRequest): Promise<TranslateResponse>;
  translateBatch(requests: TranslateRequest[]): Promise<{ results: TranslateResponse[] }>;
  importDocument(): Promise<ImportDocumentResult>;
}

declare global {
  interface Window {
    translatorDesktop: TranslatorDesktopAPI;
  }
}

export {};
