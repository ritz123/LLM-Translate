import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";

function licenseLineFromPkg(license: string | undefined): string {
  if (license === "GPL-3.0-only") return "GNU GPL v3.0 only";
  if (license === "GPL-3.0-or-later") return "GNU GPL v3.0 or later";
  return license ? `License: ${license}` : "";
}

export function createSplashWindow(root: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 360,
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
    let licenseLine = "";
    try {
      const raw = fs.readFileSync(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { license?: string };
      licenseLine = licenseLineFromPkg(pkg.license);
    } catch {
      /* ignore */
    }
    const versionJson = JSON.stringify(`v${version}`);
    const licenseJson = JSON.stringify(licenseLine);
    void win.webContents.executeJavaScript(`(() => {
      const v = document.getElementById("splash-version");
      const l = document.getElementById("splash-license");
      if (v) v.textContent = ${versionJson};
      if (l) l.textContent = ${licenseJson};
    })()`);
  });
  void win.loadFile(htmlPath);
  return win;
}
