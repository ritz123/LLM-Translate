import { BrowserWindow } from "electron";
import { createSplashWindow } from "./splashWindow.ts";
import { createMainBrowserWindow } from "./mainWindow.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LaunchDesktopOptions = {
  root: string;
  isDev: boolean;
  showSplash: boolean;
};

export async function launchDesktopShell(opts: LaunchDesktopOptions): Promise<void> {
  const { root, isDev, showSplash } = opts;
  const splashStart = Date.now();
  const splash = showSplash ? createSplashWindow(root) : null;

  try {
    const win = await createMainBrowserWindow({ root, isDev });
    if (showSplash) {
      const elapsed = Date.now() - splashStart;
      if (elapsed < 5000) await delay(5000 - elapsed);
    }
    splash?.destroy();
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: "detach" });
  } catch (err) {
    splash?.destroy();
    throw err;
  }
}

/** macOS re-open: no splash, no minimum delay. */
export async function openMainWindowImmediate(opts: { root: string; isDev: boolean }): Promise<void> {
  const win = await createMainBrowserWindow(opts);
  win.show();
  if (opts.isDev) win.webContents.openDevTools({ mode: "detach" });
}
