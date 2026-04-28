import "./env.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { listGeminiModels } from "../server/llm/geminiListModels.ts";
import { listOllamaModels } from "../server/llm/ollamaListModels.ts";
import { loadLlmUserSettings } from "./llmUserSettings.ts";
import {
  createTranslationService,
  validateTranslateRequest,
  type TranslationService,
} from "./translateService.ts";
import { importDocumentViaDialog } from "./importDocument.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.env.ELECTRON_DEV === "1";
const VITE_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

function registerIpc(s: TranslationService): void {
  ipcMain.handle("desktop:get-config", () => ({ modelVersion: s.getModelVersion() }));

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
}

function probeUrl(urlString: string): Promise<boolean> {
  return new Promise((resolve) => {
    const u = new URL(urlString);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search || "/",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForVite(timeoutMs = 120000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await probeUrl(`${VITE_URL}/`)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for Vite at ${VITE_URL}`);
}

async function createWindow(): Promise<void> {
  const preloadPath = path.join(root, "electron", "preload.cjs");

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    await waitForVite();
    win.webContents.openDevTools({ mode: "detach" });
    await win.loadURL(VITE_URL);
  } else {
    const indexHtml = path.join(root, "dist", "index.html");
    await win.loadFile(indexHtml);
  }
}

app.whenReady().then(() => {
  const svc = createTranslationService(loadLlmUserSettings());
  registerIpc(svc);
  void createWindow().catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch(console.error);
  }
});
