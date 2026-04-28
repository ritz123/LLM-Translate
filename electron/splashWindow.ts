import path from "node:path";
import { BrowserWindow } from "electron";

export function createSplashWindow(root: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 300,
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
  void win.loadFile(path.join(root, "electron", "splash.html"));
  return win;
}
