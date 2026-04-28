import path from "node:path";
import { app, BrowserWindow } from "electron";

export function createSplashWindow(root: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#1565c0",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const htmlPath = path.join(root, "electron", "splash.html");
  win.webContents.once("did-finish-load", () => {
    const version = app.getVersion();
    void win.webContents.executeJavaScript(
      `(() => { const el = document.getElementById("splash-version"); if (el) el.textContent = ${JSON.stringify(`v${version}`)}; })()`,
    );
  });
  void win.loadFile(htmlPath);
  return win;
}
