import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { listGeminiModels } from "../server/llm/geminiListModels.ts";
import { listOllamaModels } from "../server/llm/ollamaListModels.ts";
import {
  createTranslationService,
  validateTranslateRequest,
  type TranslationService,
} from "./translateService.ts";
import { exportPdfViaDialog } from "./exportPdf.ts";
import { importDocumentViaDialog } from "./importDocument.ts";

export function registerIpcHandlers(s: TranslationService): void {
  ipcMain.handle("desktop:get-config", () => ({ modelVersion: s.getModelVersion() }));

  ipcMain.handle("desktop:get-app-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
  }));

  ipcMain.handle("desktop:debug-info", () => s.getDebugInfo());

  ipcMain.handle("desktop:debug-llm-ping", () => s.debugLlmPing());

  ipcMain.handle("desktop:get-llm-user-settings", () => s.getLlmUserSettingsPayload());

  ipcMain.handle("desktop:set-llm-user-settings", (_evt, body: unknown) => {
    const b = body as {
      llmProvider?: string;
      geminiApiKey?: string;
      geminiModel?: string;
      clearGeminiApiKey?: boolean;
      geminiApiBase?: string;
      ollamaBaseUrl?: string;
      ollamaModel?: string;
    };
    s.applyLlmUserSettingsPatch({
      llmProvider: b.llmProvider,
      geminiApiKey: b.geminiApiKey,
      geminiModel: b.geminiModel,
      clearGeminiApiKey: b.clearGeminiApiKey === true,
      geminiApiBase: b.geminiApiBase,
      ollamaBaseUrl: b.ollamaBaseUrl,
      ollamaModel: b.ollamaModel,
    });
    return s.getLlmUserSettingsPayload();
  });

  ipcMain.handle("desktop:list-gemini-models", async (_evt, body: unknown) => {
    const b = body as { apiKey?: string; apiBase?: string } | undefined;
    const draft = b?.apiKey?.trim();
    const key = s.getEffectiveGeminiKeyForList(draft);
    if (!key) {
      throw new Error(
        "No Gemini API key. Open Configuration to save a key, or set GEMINI_API_KEY / GOOGLE_API_KEY in the environment.",
      );
    }
    const models = await listGeminiModels(key, s.resolveGeminiApiBaseForList(b?.apiBase));
    return { models };
  });

  ipcMain.handle("desktop:list-ollama-models", async (_evt, body: unknown) => {
    const b = body as { baseUrl?: string } | undefined;
    const draft = b?.baseUrl?.trim();
    const models = await listOllamaModels(draft && draft.length > 0 ? draft : null);
    return { models };
  });

  ipcMain.handle("desktop:translate", async (_evt, body: unknown) => {
    const tr = validateTranslateRequest(body);
    return await s.translate(tr);
  });

  ipcMain.handle("desktop:translate-batch", async (_evt, payload: unknown) => {
    const requests = (payload as { requests?: unknown }).requests;
    if (!Array.isArray(requests)) throw new Error("requests array required");
    const results = [];
    for (const r of requests) {
      results.push(await s.translate(validateTranslateRequest(r)));
    }
    return { results };
  });

  ipcMain.handle("desktop:import-document", async (evt: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    return await importDocumentViaDialog(win);
  });

  ipcMain.handle("desktop:export-pdf", async (evt: IpcMainInvokeEvent, body: unknown) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    return await exportPdfViaDialog(win, body);
  });

  ipcMain.handle("desktop:window-minimize", (evt: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(evt.sender)?.minimize();
  });

  ipcMain.handle("desktop:window-maximize-toggle", (evt: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle("desktop:window-close", (evt: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(evt.sender)?.close();
  });
}

export { createTranslationService };
