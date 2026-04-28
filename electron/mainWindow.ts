import path from "node:path";
import { BrowserWindow } from "electron";
import { getViteDevServerUrl, waitForVite } from "./viteProbe.ts";

export type CreateMainWindowOptions = {
  root: string;
  isDev: boolean;
};

export async function createMainBrowserWindow(opts: CreateMainWindowOptions): Promise<BrowserWindow> {
  const { root, isDev } = opts;
  const preloadPath = path.join(root, "electron", "preload.cjs");
  const viteUrl = getViteDevServerUrl();

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: "#fafafa",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await waitForVite();
    await win.loadURL(viteUrl);
  } else {
    const indexHtml = path.join(root, "dist", "index.html");
    await win.loadFile(indexHtml);
  }

  return win;
}
