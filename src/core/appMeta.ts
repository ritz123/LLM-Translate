export type AppInfo = {
  name: string;
  version: string;
};

/** SPDX id from package.json (Vite define); keep in sync with root `LICENSE`. */
export function getBundledLicenseSpdx(): string {
  return __APP_LICENSE_SPDX__;
}

/** Short license label for footer, splash, and compact UI. */
export function getLicenseShortLabel(): string {
  const spdx = getBundledLicenseSpdx();
  if (spdx === "GPL-3.0-only") return "GNU GPL v3.0 only";
  if (spdx === "GPL-3.0-or-later") return "GNU GPL v3.0 or later";
  return spdx;
}

export const GPL_V3_TERMS_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

/** Version baked into the renderer bundle (matches package.json at web build time). */
export function getBundledAppVersion(): string {
  return __APP_VERSION__;
}

export function getBundledProductName(): string {
  return __APP_PRODUCT_NAME__;
}

/** Prefer Electron IPC in desktop; fall back to Vite defines in browser-only dev. */
export async function getAppInfo(): Promise<AppInfo> {
  const api = window.translatorDesktop?.getAppInfo;
  if (api) return api();
  return { name: getBundledProductName(), version: getBundledAppVersion() };
}
