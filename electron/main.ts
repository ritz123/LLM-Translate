import "./env.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { loadLlmUserSettings } from "./llmUserSettings.ts";
import { createTranslationService, registerIpcHandlers } from "./ipcRegister.ts";
import { launchDesktopShell, openMainWindowImmediate } from "./launchDesktop.ts";

// Chromium GPU helpers often spam stderr or exit on minimal Linux (no compositor / D-Bus). Opt out with TRANSLATOR_USE_GPU=1.
if (process.platform === "linux" && process.env.TRANSLATOR_USE_GPU !== "1") {
  app.disableHardwareAcceleration();
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.env.ELECTRON_DEV === "1";

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string;
    build?: { productName?: string };
  };
  app.setName(pkg.build?.productName ?? pkg.name);
} catch {
  /* keep default */
}

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
