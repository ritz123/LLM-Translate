import "./env.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { loadLlmUserSettings } from "./llmUserSettings.ts";
import { createTranslationService, registerIpcHandlers } from "./ipcRegister.ts";
import { launchDesktopShell, openMainWindowImmediate } from "./launchDesktop.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.env.ELECTRON_DEV === "1";

app.whenReady().then(() => {
  const translationService = createTranslationService(loadLlmUserSettings());
  registerIpcHandlers(translationService);
  void launchDesktopShell({ root, isDev, showSplash: true }).catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void openMainWindowImmediate({ root, isDev }).catch(console.error);
  }
});
