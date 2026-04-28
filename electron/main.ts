import "./env.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  createTranslationService,
  validateTranslateRequest,
} from "./translateService.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.env.ELECTRON_DEV === "1";
const VITE_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";

const service = createTranslationService();

function registerIpc(): void {
  ipcMain.handle("desktop:get-config", () => ({ modelVersion: service.getModelVersion() }));

  ipcMain.handle("desktop:translate", async (_evt, body: unknown) => {
    const tr = validateTranslateRequest(body);
    return await service.translate(tr);
  });

  ipcMain.handle("desktop:translate-batch", async (_evt, payload: unknown) => {
    const requests = (payload as { requests?: unknown }).requests;
    if (!Array.isArray(requests)) throw new Error("requests array required");
    const results = [];
    for (const r of requests) {
      results.push(await service.translate(validateTranslateRequest(r)));
    }
    return { results };
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
  registerIpc();
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
